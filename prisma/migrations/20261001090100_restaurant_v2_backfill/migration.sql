-- Restaurant v2 data backfill. Runs in its own migration so the enum values added by the
-- previous migration are committed. Every statement is idempotent.

-- 1. Dishes: the recipe mode is retired. Every dish is a plate line (menu = stock).
--    Recipe dishes never held plates; they start at their current quantity (normally 0)
--    and the department head sets their opening stock on the Menu & Stock page.
UPDATE "menu_items" SET "inventoryMode" = 'DIRECT_PLATE' WHERE "inventoryMode" = 'RECIPE';
UPDATE "menu_items" SET "archivedAt" = "updatedAt" WHERE "isActive" = false AND "archivedAt" IS NULL;

-- 2. Department short codes (used in printed reference numbers): RST, RST2, … per organization.
WITH ranked AS (
  SELECT d."id",
         CASE d."domain"
           WHEN 'RESTAURANT' THEN 'RST' WHEN 'BAR' THEN 'BAR' WHEN 'PRESSING' THEN 'PRS'
           WHEN 'CAR_WASH' THEN 'CWS' WHEN 'ROOM_RENTAL' THEN 'ROOM' WHEN 'MATERIAL_RENTAL' THEN 'MAT'
           WHEN 'SHOP' THEN 'SHOP' ELSE 'OTH' END AS prefix,
         ROW_NUMBER() OVER (PARTITION BY d."organizationId", d."domain" ORDER BY d."createdAt", d."id") AS n
  FROM "departments" d
  WHERE d."code" IS NULL
)
UPDATE "departments" d
SET "code" = r.prefix || CASE WHEN r.n = 1 THEN '' ELSE r.n::text END
FROM ranked r
WHERE d."id" = r."id";

-- 3. Customer directory from existing debts, then link every debt to its debtor.
INSERT INTO "debtors" ("id", "organizationId", "departmentId", "name", "phone", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, x."organizationId", x."departmentId", x."name", x."phone", true, NOW(), NOW()
FROM (
  SELECT DISTINCT ON (d."departmentId", TRIM(d."debtorName"))
         d."organizationId", d."departmentId", TRIM(d."debtorName") AS "name", d."debtorContact" AS "phone"
  FROM "debts" d
  WHERE TRIM(COALESCE(d."debtorName", '')) <> ''
  ORDER BY d."departmentId", TRIM(d."debtorName"), d."createdAt" DESC
) x
ON CONFLICT ("departmentId", "name") DO NOTHING;

UPDATE "debts" d
SET "debtorId" = c."id"
FROM "debtors" c
WHERE d."debtorId" IS NULL AND c."departmentId" = d."departmentId" AND c."name" = TRIM(d."debtorName");

-- 4. Debt source: debts without a sale existed before the app (no revenue on their day).
UPDATE "debts" SET "source" = 'OPENING_BALANCE' WHERE "transactionId" IS NULL AND "source" = 'CREDIT_SALE';

-- 5. Purchase lines become descriptive ("Fish · 10 kg").
UPDATE "purchase_lines" pl
SET "description" = x."label"
FROM (
  SELECT p2."id",
         COALESCE(si."name", mi."name", 'Item') || ' · ' ||
         RTRIM(RTRIM(p2."quantity"::text, '0'), '.') || ' ' || COALESCE(si."unit", mi."unit", '') AS "label"
  FROM "purchase_lines" p2
  LEFT JOIN "department_stock_items" si ON si."id" = p2."stockItemId"
  LEFT JOIN "menu_items" mi ON mi."id" = p2."menuItemId"
  WHERE p2."description" IS NULL
) x
WHERE pl."id" = x."id";

-- 6. Reference numbers for existing records, in date order per department and type.
WITH numbered AS (
  SELECT t."id", t."departmentId",
         CASE
           WHEN t."type" = 'SALE' THEN 'S' WHEN t."type" = 'PURCHASE' THEN 'P' WHEN t."type" = 'EXPENSE' THEN 'E'
           WHEN t."type" = 'OTHER_EXPENSE' THEN 'X' WHEN t."type" = 'RENT_INCOME' THEN 'R'
           WHEN t."type" IN ('OTHER_INCOME', 'INCOME') THEN 'I' WHEN t."type" = 'DISCOUNT' THEN 'K'
           WHEN t."type" = 'DEBT_PAYMENT' THEN 'Y' WHEN t."type" = 'CASH_HANDOVER' THEN 'H' ELSE 'T' END AS doc
  FROM "transactions" t
  WHERE t."referenceNo" IS NULL AND t."departmentId" IS NOT NULL
), seq AS (
  SELECT n."id", n.doc,
         ROW_NUMBER() OVER (PARTITION BY n."departmentId", n.doc ORDER BY t."date", t."createdAt", t."id")
           + COALESCE((SELECT MAX(SUBSTRING(t2."referenceNo" FROM '[0-9]+$')::int) FROM "transactions" t2
                       WHERE t2."departmentId" = n."departmentId" AND t2."referenceNo" LIKE n.doc || '-%'), 0) AS v
  FROM numbered n JOIN "transactions" t ON t."id" = n."id"
)
UPDATE "transactions" t SET "referenceNo" = s.doc || '-' || LPAD(s.v::text, 4, '0')
FROM seq s WHERE t."id" = s."id";

UPDATE "cash_handovers" h SET "referenceNo" = t."referenceNo"
FROM "transactions" t WHERE h."transactionId" = t."id" AND h."referenceNo" IS NULL;

WITH seq AS (
  SELECT d."id", ROW_NUMBER() OVER (PARTITION BY d."departmentId" ORDER BY d."date", d."createdAt", d."id") AS v
  FROM "debts" d WHERE d."referenceNo" IS NULL
)
UPDATE "debts" d SET "referenceNo" = 'D-' || LPAD(s.v::text, 4, '0') FROM seq s WHERE d."id" = s."id";

WITH seq AS (
  SELECT r."id", ROW_NUMBER() OVER (PARTITION BY r."departmentId" ORDER BY r."reportDate", r."id") AS v
  FROM "daily_reports" r WHERE r."referenceNo" IS NULL
)
UPDATE "daily_reports" r SET "referenceNo" = 'DR-' || LPAD(s.v::text, 4, '0') FROM seq s WHERE r."id" = s."id";

-- Plate additions / corrections that are not part of a sale or purchase transaction.
WITH m AS (
  SELECT sm."id", sm."departmentId",
         CASE WHEN sm."type" IN ('OPENING', 'PREPARATION', 'PURCHASE', 'STOCK_ADDED') THEN 'A' ELSE 'C' END AS doc,
         sm."date", sm."createdAt"
  FROM "stock_movements" sm
  WHERE sm."referenceNo" IS NULL AND sm."menuItemId" IS NOT NULL AND sm."transactionId" IS NULL
    AND sm."type" IN ('OPENING', 'PREPARATION', 'PURCHASE', 'STOCK_ADDED', 'WASTE', 'DAMAGE', 'ADJUSTMENT', 'SPOILED', 'CORRECTION', 'OPENING_CORRECTION')
), seq AS (
  SELECT m."id", m.doc, ROW_NUMBER() OVER (PARTITION BY m."departmentId", m.doc ORDER BY m."date", m."createdAt", m."id") AS v FROM m
)
UPDATE "stock_movements" sm SET "referenceNo" = s.doc || '-' || LPAD(s.v::text, 4, '0') FROM seq s WHERE sm."id" = s."id";

-- 7. Counters continue after the highest number used.
INSERT INTO "document_sequences" ("id", "departmentId", "docType", "nextValue")
SELECT gen_random_uuid()::text, x."departmentId", x.doc, MAX(x.v) + 1
FROM (
  SELECT "departmentId", SPLIT_PART("referenceNo", '-', 1) AS doc, SUBSTRING("referenceNo" FROM '[0-9]+$')::int AS v
  FROM "transactions" WHERE "referenceNo" IS NOT NULL AND "departmentId" IS NOT NULL
  UNION ALL
  SELECT "departmentId", 'D', SUBSTRING("referenceNo" FROM '[0-9]+$')::int FROM "debts" WHERE "referenceNo" IS NOT NULL
  UNION ALL
  SELECT "departmentId", 'DR', SUBSTRING("referenceNo" FROM '[0-9]+$')::int FROM "daily_reports" WHERE "referenceNo" IS NOT NULL
  UNION ALL
  SELECT "departmentId", SPLIT_PART("referenceNo", '-', 1), SUBSTRING("referenceNo" FROM '[0-9]+$')::int
  FROM "stock_movements" WHERE "referenceNo" IS NOT NULL
) x
GROUP BY x."departmentId", x.doc
ON CONFLICT ("departmentId", "docType") DO UPDATE SET "nextValue" = GREATEST("document_sequences"."nextValue", EXCLUDED."nextValue");
