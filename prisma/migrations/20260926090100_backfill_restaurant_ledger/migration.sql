-- Data backfill for the restaurant ledger (implementation_plan.md §11 "Backfills").
-- Runs in its own migration so the enum values added by the previous migration are committed.
-- Every statement is idempotent: re-running it changes nothing.

-- 1. Existing users with a primary department get a primary membership.
INSERT INTO "user_departments" ("id", "userId", "departmentId", "isPrimary", "isActive", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, u."id", u."departmentId", true, true, NOW(), NOW()
FROM "users" u
WHERE u."departmentId" IS NOT NULL
ON CONFLICT ("userId", "departmentId") DO NOTHING;

-- 2. Explicit accounting classification instead of category strings (§6.7).
UPDATE "transactions" SET "type" = 'DEBT_PAYMENT'
WHERE "type" = 'INCOME' AND "operationCategory" = 'DEBT_COLLECTION';

UPDATE "transactions" SET "type" = 'RENT_INCOME'
WHERE "type" = 'INCOME' AND "operationCategory" = 'RENT_INCOME';

UPDATE "transactions" SET "type" = 'OTHER_INCOME', "operationCategory" = COALESCE("operationCategory", 'OTHER_INCOME')
WHERE "type" = 'INCOME';

UPDATE "transactions" SET "type" = 'CASH_HANDOVER'
WHERE "type" = 'EXPENSE' AND "operationCategory" = 'CASH_HANDOVER';

UPDATE "transactions" SET "type" = 'OTHER_EXPENSE'
WHERE "type" = 'EXPENSE' AND "operationCategory" = 'OTHER_EXPENSE';

UPDATE "transactions" SET "type" = 'PURCHASE'
WHERE "type" = 'EXPENSE' AND "category" LIKE 'purchase-%';

-- 3. Legacy credit sales that only had the isDebtPaid flag get a Debt record
--    with limited historical detail (clearly marked as migrated).
INSERT INTO "debts" (
  "id", "debtorName", "debtorContact", "foodDescription", "amountOwed", "amountPaid", "status",
  "date", "transactionId", "organizationId", "departmentId", "userId", "createdAt", "updatedAt"
)
SELECT
  gen_random_uuid()::text,
  COALESCE(NULLIF(TRIM(t."customerName"), ''), 'Unknown customer (migrated)'),
  NULL,
  'Legacy credit sale (migrated, item detail unknown)',
  t."amount",
  CASE WHEN t."isDebtPaid" THEN t."amount" ELSE 0 END,
  CASE WHEN t."isDebtPaid" THEN 'PAID'::"DebtStatus" ELSE 'UNPAID'::"DebtStatus" END,
  t."date", t."id", t."organizationId", t."departmentId", t."userId", NOW(), NOW()
FROM "transactions" t
LEFT JOIN "debts" d ON d."transactionId" = t."id"
WHERE t."type" = 'SALE'
  AND t."paymentMethod" = 'CREDIT'
  AND t."organizationId" IS NOT NULL
  AND t."departmentId" IS NOT NULL
  AND d."id" IS NULL;

-- 4. Sale-line snapshots: net value, inventory mode and (approximate) unit cost.
UPDATE "sale_lines" sl
SET "netAmount" = sl."totalAmount" - sl."discountAmount"
WHERE sl."netAmount" = 0 AND sl."totalAmount" > 0;

UPDATE "sale_lines" sl
SET "inventoryMode" = m."inventoryMode",
    "unitCost" = CASE WHEN sl."unitCost" = 0 THEN m."costPrice" ELSE sl."unitCost" END
FROM "menu_items" m
WHERE m."id" = sl."menuItemId";

-- 5. Opening unit cost defaults to the current valuation cost.
UPDATE "department_stock_items"
SET "openingUnitCost" = "valuationUnitCost"
WHERE "openingUnitCost" = 0 AND "valuationUnitCost" > 0;

-- 6. Legacy handovers written without a transaction remain RECORDED (default).
--    Legacy recurring flags are switched off: the recurring feature was retired.
UPDATE "transactions" SET "isRecurring" = false WHERE "isRecurring" = true;
