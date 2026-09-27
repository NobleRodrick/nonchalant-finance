-- Restaurant v2: plate-based stock (menu = stock), reference numbers, debtors, manual debts,
-- in-app notifications, department codes. Removes the retired personal-finance budget
-- table and recurring-transaction columns. Additive for every restaurant table.

-- CreateEnum
CREATE TYPE "DebtSource" AS ENUM ('CREDIT_SALE', 'MANUAL', 'OPENING_BALANCE');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'STOCK_ADDED';
ALTER TYPE "StockMovementType" ADD VALUE 'SOLD';
ALTER TYPE "StockMovementType" ADD VALUE 'SPOILED';
ALTER TYPE "StockMovementType" ADD VALUE 'CORRECTION';
ALTER TYPE "StockMovementType" ADD VALUE 'OPENING_CORRECTION';

-- DropForeignKey
ALTER TABLE "budgets" DROP CONSTRAINT "budgets_userId_fkey";

-- AlterTable
ALTER TABLE "departments" ADD COLUMN     "cashierDiscountLimit" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "openingCashFloat" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "code" TEXT;

-- AlterTable
ALTER TABLE "transactions" DROP COLUMN "isDebtPaid",
DROP COLUMN "isRecurring",
DROP COLUMN "lastProcessed",
DROP COLUMN "nextRecurringDate",
DROP COLUMN "purchaseReference",
DROP COLUMN "purchaseSupplier",
DROP COLUMN "recurringInterval",
ADD COLUMN     "referenceNo" TEXT;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "purchaseId" TEXT,
ADD COLUMN     "reason" TEXT,
ADD COLUMN     "referenceNo" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "archivedAt" TIMESTAMP(3),
ADD COLUMN     "lowStockLevel" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "section" TEXT,
ADD COLUMN     "sortOrder" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchase_lines" ADD COLUMN     "description" TEXT;

-- AlterTable
ALTER TABLE "debts" ADD COLUMN     "debtorId" TEXT,
ADD COLUMN     "dueDate" TIMESTAMP(3),
ADD COLUMN     "referenceNo" TEXT,
ADD COLUMN     "source" "DebtSource" NOT NULL DEFAULT 'CREDIT_SALE',
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "cash_handovers" ADD COLUMN     "referenceNo" TEXT;

-- AlterTable
ALTER TABLE "daily_reports" ADD COLUMN     "referenceNo" TEXT,
ADD COLUMN     "schemaVersion" INTEGER NOT NULL DEFAULT 1;

-- DropTable
DROP TABLE "budgets";

-- DropEnum
DROP TYPE "RecurringInterval";

-- CreateTable
CREATE TABLE "debtors" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "debtors_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_sequences" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "docType" TEXT NOT NULL,
    "nextValue" INTEGER NOT NULL DEFAULT 1,

    CONSTRAINT "document_sequences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "departmentId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT,
    "href" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "debtors_departmentId_name_key" ON "debtors"("departmentId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "document_sequences_departmentId_docType_key" ON "document_sequences"("departmentId", "docType");

-- CreateIndex
CREATE INDEX "notifications_userId_readAt_createdAt_idx" ON "notifications"("userId", "readAt", "createdAt");

-- CreateIndex
CREATE INDEX "transactions_departmentId_type_date_idx" ON "transactions"("departmentId", "type", "date");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_departmentId_referenceNo_key" ON "transactions"("departmentId", "referenceNo");

-- CreateIndex
CREATE INDEX "debts_debtorId_idx" ON "debts"("debtorId");

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_purchaseId_fkey" FOREIGN KEY ("purchaseId") REFERENCES "purchases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debts" ADD CONSTRAINT "debts_debtorId_fkey" FOREIGN KEY ("debtorId") REFERENCES "debtors"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debtors" ADD CONSTRAINT "debtors_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debtors" ADD CONSTRAINT "debtors_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_sequences" ADD CONSTRAINT "document_sequences_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

