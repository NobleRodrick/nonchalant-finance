-- Full accounting (SYSCOHADA): companies, chart of accounts, journals, ledger, suppliers,
-- bank statements (docs/ACCOUNTING_PLAN.md). Additive: existing records are untouched; every
-- business gets one default company holding all its departments, in Simple accounting.

ALTER TYPE "TransactionType" ADD VALUE 'SUPPLIER_PAYMENT';
ALTER TYPE "UserRole" ADD VALUE 'ACCOUNTANT';

CREATE TYPE "AccountingLevel" AS ENUM ('SIMPLE', 'FULL');
CREATE TYPE "JournalKind" AS ENUM ('SALES', 'PURCHASES', 'CASH', 'BANK', 'MOBILE_MONEY', 'GENERAL', 'OPENING');
CREATE TYPE "JournalEntryStatus" AS ENUM ('DRAFT', 'PENDING', 'POSTED', 'REJECTED');
CREATE TYPE "SupplierBillStatus" AS ENUM ('OPEN', 'PARTIAL', 'PAID', 'VOIDED');
CREATE TYPE "StatementLineStatus" AS ENUM ('UNMATCHED', 'MATCHED', 'IGNORED');

CREATE TABLE "companies" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "legalName" TEXT,
    "taxId" TEXT,
    "tradeRegister" TEXT,
    "address" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "accountingLevel" "AccountingLevel" NOT NULL DEFAULT 'SIMPLE',
    "fullSince" DATE,
    "fiscalYearStartMonth" INTEGER NOT NULL DEFAULT 1,
    "vatEnabled" BOOLEAN NOT NULL DEFAULT false,
    "vatSince" DATE,
    "vatPricesInclude" BOOLEAN NOT NULL DEFAULT true,
    "vatRateBp" INTEGER NOT NULL DEFAULT 1925,
    "vatExempt" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "payablesEnabled" BOOLEAN NOT NULL DEFAULT false,
    "reconciliationEnabled" BOOLEAN NOT NULL DEFAULT false,
    "approvalThreshold" INTEGER NOT NULL DEFAULT 0,
    "accountMap" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "company_members" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "company_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ledger_accounts" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "reconcilable" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ledger_accounts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journals" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "JournalKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journals_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_entries" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "journalId" TEXT NOT NULL,
    "number" TEXT,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "reference" TEXT,
    "departmentId" TEXT,
    "sourceKey" TEXT,
    "fingerprint" TEXT,
    "status" "JournalEntryStatus" NOT NULL DEFAULT 'POSTED',
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "late" BOOLEAN NOT NULL DEFAULT false,
    "reversalOfId" TEXT,
    "reversedAt" TIMESTAMP(3),
    "total" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    "createdById" TEXT,
    "createdByName" TEXT,
    "approvedById" TEXT,
    "approvedByName" TEXT,
    "approvedAt" TIMESTAMP(3),
    "rejectedReason" TEXT,
    "postedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "journal_entries_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "journal_lines" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    "debit" INTEGER NOT NULL DEFAULT 0,
    "credit" INTEGER NOT NULL DEFAULT 0,
    "label" TEXT,
    "departmentId" TEXT,
    "partnerKey" TEXT,
    "partnerName" TEXT,
    "vatBase" INTEGER,
    "reconciliationId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "journal_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    "address" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "supplier_bills" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "supplierId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "supplierRef" TEXT,
    "date" DATE NOT NULL,
    "dueDate" DATE,
    "total" INTEGER NOT NULL,
    "taxAmount" INTEGER NOT NULL DEFAULT 0,
    "paid" INTEGER NOT NULL DEFAULT 0,
    "status" "SupplierBillStatus" NOT NULL DEFAULT 'OPEN',
    "note" TEXT,
    "voidReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "supplier_bills_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "bank_statements" (
    "id" TEXT NOT NULL,
    "companyId" TEXT NOT NULL,
    "accountNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fromDate" DATE NOT NULL,
    "toDate" DATE NOT NULL,
    "openingBalance" INTEGER NOT NULL DEFAULT 0,
    "closingBalance" INTEGER NOT NULL DEFAULT 0,
    "importedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "bank_statements_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "statement_lines" (
    "id" TEXT NOT NULL,
    "statementId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT NOT NULL,
    "reference" TEXT,
    "amount" INTEGER NOT NULL,
    "status" "StatementLineStatus" NOT NULL DEFAULT 'UNMATCHED',
    "journalLineId" TEXT,
    "entryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "statement_lines_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "companies_organizationId_name_key" ON "companies"("organizationId", "name");
CREATE INDEX "companies_organizationId_idx" ON "companies"("organizationId");
CREATE UNIQUE INDEX "company_members_companyId_userId_key" ON "company_members"("companyId", "userId");
CREATE INDEX "company_members_userId_idx" ON "company_members"("userId");
CREATE UNIQUE INDEX "ledger_accounts_companyId_number_key" ON "ledger_accounts"("companyId", "number");
CREATE UNIQUE INDEX "journals_companyId_code_key" ON "journals"("companyId", "code");
CREATE UNIQUE INDEX "journal_entries_reversalOfId_key" ON "journal_entries"("reversalOfId");
CREATE UNIQUE INDEX "journal_entries_companyId_number_key" ON "journal_entries"("companyId", "number");
CREATE INDEX "journal_entries_companyId_date_idx" ON "journal_entries"("companyId", "date");
CREATE INDEX "journal_entries_companyId_sourceKey_idx" ON "journal_entries"("companyId", "sourceKey");
CREATE INDEX "journal_entries_companyId_status_idx" ON "journal_entries"("companyId", "status");
CREATE INDEX "journal_entries_journalId_date_idx" ON "journal_entries"("journalId", "date");
CREATE INDEX "journal_lines_entryId_idx" ON "journal_lines"("entryId");
CREATE INDEX "journal_lines_companyId_accountId_date_idx" ON "journal_lines"("companyId", "accountId", "date");
CREATE INDEX "journal_lines_companyId_partnerKey_idx" ON "journal_lines"("companyId", "partnerKey");
CREATE INDEX "journal_lines_companyId_departmentId_date_idx" ON "journal_lines"("companyId", "departmentId", "date");
CREATE INDEX "journal_lines_reconciliationId_idx" ON "journal_lines"("reconciliationId");
CREATE UNIQUE INDEX "suppliers_companyId_name_key" ON "suppliers"("companyId", "name");
CREATE UNIQUE INDEX "supplier_bills_companyId_referenceNo_key" ON "supplier_bills"("companyId", "referenceNo");
CREATE INDEX "supplier_bills_companyId_status_idx" ON "supplier_bills"("companyId", "status");
CREATE INDEX "supplier_bills_supplierId_idx" ON "supplier_bills"("supplierId");
CREATE INDEX "bank_statements_companyId_accountNumber_idx" ON "bank_statements"("companyId", "accountNumber");
CREATE UNIQUE INDEX "statement_lines_journalLineId_key" ON "statement_lines"("journalLineId");
CREATE INDEX "statement_lines_statementId_status_idx" ON "statement_lines"("statementId", "status");

ALTER TABLE "companies" ADD CONSTRAINT "companies_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "company_members" ADD CONSTRAINT "company_members_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ledger_accounts" ADD CONSTRAINT "ledger_accounts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journals" ADD CONSTRAINT "journals_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_journalId_fkey" FOREIGN KEY ("journalId") REFERENCES "journals"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_entries" ADD CONSTRAINT "journal_entries_reversalOfId_fkey" FOREIGN KEY ("reversalOfId") REFERENCES "journal_entries"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "journal_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "ledger_accounts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bank_statements" ADD CONSTRAINT "bank_statements_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "statement_lines" ADD CONSTRAINT "statement_lines_statementId_fkey" FOREIGN KEY ("statementId") REFERENCES "bank_statements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Departments belong to a company; periods may close one company only
ALTER TABLE "departments" ADD COLUMN "companyId" TEXT;
ALTER TABLE "departments" ADD COLUMN "ledgerDirtyAt" TIMESTAMP(3);
ALTER TABLE "departments" ADD COLUMN "ledgerSyncedAt" TIMESTAMP(3);
CREATE INDEX "departments_companyId_idx" ON "departments"("companyId");
ALTER TABLE "departments" ADD CONSTRAINT "departments_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "accounting_periods" ADD COLUMN "companyId" TEXT;
DROP INDEX "accounting_periods_organizationId_startDate_key";
CREATE UNIQUE INDEX "accounting_periods_organizationId_companyId_startDate_key" ON "accounting_periods"("organizationId", "companyId", "startDate");
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Money records: VAT included, supplier, supplier bill
ALTER TABLE "transactions" ADD COLUMN "taxAmount" INTEGER;
ALTER TABLE "transactions" ADD COLUMN "supplierId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "supplierBillId" TEXT;
CREATE INDEX "transactions_supplierBillId_idx" ON "transactions"("supplierBillId");
CREATE INDEX "transactions_supplierId_date_idx" ON "transactions"("supplierId", "date");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supplierId_fkey" FOREIGN KEY ("supplierId") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_supplierBillId_fkey" FOREIGN KEY ("supplierBillId") REFERENCES "supplier_bills"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- One default company per business, holding all its departments
INSERT INTO "companies" ("id", "organizationId", "name", "isDefault", "updatedAt")
SELECT gen_random_uuid()::text, o."id", o."name", true, CURRENT_TIMESTAMP FROM "organizations" o;
UPDATE "departments" d SET "companyId" = c."id" FROM "companies" c WHERE c."organizationId" = d."organizationId" AND c."isDefault";

-- A department created without a company joins the business's default company (created if needed)
CREATE OR REPLACE FUNCTION department_default_company() RETURNS trigger AS $$
DECLARE cid TEXT;
BEGIN
  IF NEW."companyId" IS NULL THEN
    SELECT "id" INTO cid FROM "companies" WHERE "organizationId" = NEW."organizationId" AND "isDefault" LIMIT 1;
    IF cid IS NULL THEN
      cid := gen_random_uuid()::text;
      INSERT INTO "companies" ("id", "organizationId", "name", "isDefault", "updatedAt")
      SELECT cid, o."id", o."name", true, CURRENT_TIMESTAMP FROM "organizations" o WHERE o."id" = NEW."organizationId"
      ON CONFLICT ("organizationId", "name") DO UPDATE SET "isDefault" = true RETURNING "id" INTO cid;
    END IF;
    NEW."companyId" := cid;
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER departments_default_company BEFORE INSERT ON "departments" FOR EACH ROW EXECUTE FUNCTION department_default_company();

-- Rules the database keeps too
CREATE UNIQUE INDEX "companies_one_default" ON "companies"("organizationId") WHERE "isDefault";
ALTER TABLE "companies" ADD CONSTRAINT "companies_settings_check" CHECK ("fiscalYearStartMonth" BETWEEN 1 AND 12 AND "vatRateBp" BETWEEN 0 AND 10000 AND "approvalThreshold" >= 0);
ALTER TABLE "journal_lines" ADD CONSTRAINT "journal_lines_amount_check" CHECK ("debit" >= 0 AND "credit" >= 0 AND (("debit" > 0) <> ("credit" > 0)));
ALTER TABLE "supplier_bills" ADD CONSTRAINT "supplier_bills_amount_check" CHECK ("total" > 0 AND "taxAmount" >= 0 AND "taxAmount" <= "total" AND "paid" >= 0 AND "paid" <= "total");
CREATE UNIQUE INDEX "journal_entries_active_source_key" ON "journal_entries"("companyId", "sourceKey") WHERE "sourceKey" IS NOT NULL AND "status" = 'POSTED' AND "reversedAt" IS NULL AND "reversalOfId" IS NULL;

-- A posted entry balances (checked when the transaction commits)
CREATE OR REPLACE FUNCTION journal_entry_balanced() RETURNS trigger AS $$
DECLARE eid TEXT; st "JournalEntryStatus"; d BIGINT; c BIGINT; n INTEGER;
BEGIN
  IF TG_TABLE_NAME = 'journal_entries' THEN eid := NEW."id"; ELSE eid := NEW."entryId"; END IF;
  SELECT "status" INTO st FROM "journal_entries" WHERE "id" = eid;
  IF st IS DISTINCT FROM 'POSTED' THEN RETURN NULL; END IF;
  SELECT COALESCE(SUM("debit"), 0), COALESCE(SUM("credit"), 0), COUNT(*) INTO d, c, n FROM "journal_lines" WHERE "entryId" = eid;
  IF d <> c OR n < 2 THEN
    RAISE EXCEPTION 'Journal entry % does not balance (debit %, credit %)', eid, d, c;
  END IF;
  RETURN NULL;
END $$ LANGUAGE plpgsql;
CREATE CONSTRAINT TRIGGER journal_lines_balanced AFTER INSERT OR UPDATE ON "journal_lines" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();
CREATE CONSTRAINT TRIGGER journal_entries_balanced AFTER INSERT OR UPDATE ON "journal_entries" DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION journal_entry_balanced();

-- Posted entries are never changed or deleted: only their reversal is recorded on them
CREATE OR REPLACE FUNCTION journal_entry_immutable() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD."status" = 'POSTED' THEN RAISE EXCEPTION 'A posted journal entry cannot be deleted; reverse it'; END IF;
    RETURN OLD;
  END IF;
  IF OLD."status" = 'POSTED' AND (NEW."status" <> OLD."status" OR NEW."date" <> OLD."date" OR NEW."journalId" <> OLD."journalId" OR NEW."total" <> OLD."total"
     OR NEW."number" IS DISTINCT FROM OLD."number" OR NEW."sourceKey" IS DISTINCT FROM OLD."sourceKey" OR NEW."fingerprint" IS DISTINCT FROM OLD."fingerprint") THEN
    RAISE EXCEPTION 'A posted journal entry cannot be changed; reverse it';
  END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER journal_entries_immutable BEFORE UPDATE OR DELETE ON "journal_entries" FOR EACH ROW EXECUTE FUNCTION journal_entry_immutable();

CREATE OR REPLACE FUNCTION journal_line_immutable() RETURNS trigger AS $$
DECLARE st "JournalEntryStatus";
BEGIN
  SELECT "status" INTO st FROM "journal_entries" WHERE "id" = COALESCE(OLD."entryId", NEW."entryId");
  IF st = 'POSTED' THEN
    IF TG_OP = 'DELETE' THEN RAISE EXCEPTION 'A line of a posted journal entry cannot be deleted'; END IF;
    IF NEW."debit" <> OLD."debit" OR NEW."credit" <> OLD."credit" OR NEW."accountId" <> OLD."accountId" OR NEW."date" <> OLD."date"
       OR NEW."partnerKey" IS DISTINCT FROM OLD."partnerKey" OR NEW."departmentId" IS DISTINCT FROM OLD."departmentId" THEN
      RAISE EXCEPTION 'A line of a posted journal entry cannot be changed';
    END IF;
  END IF;
  IF TG_OP = 'DELETE' THEN RETURN OLD; END IF;
  RETURN NEW;
END $$ LANGUAGE plpgsql;
CREATE TRIGGER journal_lines_immutable BEFORE UPDATE OR DELETE ON "journal_lines" FOR EACH ROW EXECUTE FUNCTION journal_line_immutable();
