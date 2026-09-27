-- CreateEnum
CREATE TYPE "AccountingPeriodStatus" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "PurchaseStatus" AS ENUM ('RECORDED', 'VOIDED');

-- CreateEnum
CREATE TYPE "HandoverStatus" AS ENUM ('RECORDED', 'CONFIRMED', 'DISPUTED', 'VOIDED');

-- CreateEnum
CREATE TYPE "InventoryItemType" AS ENUM ('STOCK_ITEM', 'DISH');

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "TransactionType" ADD VALUE 'RENT_INCOME';
ALTER TYPE "TransactionType" ADD VALUE 'OTHER_INCOME';
ALTER TYPE "TransactionType" ADD VALUE 'DEBT_PAYMENT';
ALTER TYPE "TransactionType" ADD VALUE 'OTHER_EXPENSE';
ALTER TYPE "TransactionType" ADD VALUE 'CASH_HANDOVER';

-- AlterEnum
ALTER TYPE "TransactionStatus" ADD VALUE 'VOIDED';

-- AlterEnum
-- This migration adds more than one value to an enum.
-- With PostgreSQL versions 11 and earlier, this is not possible
-- in a single migration. This can be worked around by creating
-- multiple migrations, each migration adding only one value to
-- the enum.


ALTER TYPE "StockMovementType" ADD VALUE 'PREPARATION';
ALTER TYPE "StockMovementType" ADD VALUE 'REVERSAL';

-- AlterEnum
ALTER TYPE "DebtStatus" ADD VALUE 'CANCELLED';

-- AlterTable
ALTER TABLE "organizations" ADD COLUMN     "timezone" TEXT NOT NULL DEFAULT 'Africa/Douala';

-- AlterTable
ALTER TABLE "user_departments" ADD COLUMN     "roleOverride" "UserRole";

-- AlterTable
ALTER TABLE "transactions" ADD COLUMN     "counterparty" TEXT,
ADD COLUMN     "idempotencyKey" TEXT,
ADD COLUMN     "reference" TEXT,
ADD COLUMN     "voidReason" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3),
ADD COLUMN     "voidedById" TEXT;

-- AlterTable
ALTER TABLE "department_stock_items" ADD COLUMN     "openingUnitCost" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "stock_movements" ADD COLUMN     "balanceAfter" DECIMAL(65,30),
ADD COLUMN     "menuItemId" TEXT,
ALTER COLUMN "stockItemId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "menu_items" ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'plate';

-- AlterTable
ALTER TABLE "sale_lines" ADD COLUMN     "inventoryMode" "DishInventoryMode" NOT NULL DEFAULT 'DIRECT_PLATE',
ADD COLUMN     "netAmount" DECIMAL(65,30) NOT NULL DEFAULT 0,
ADD COLUMN     "unitCost" DECIMAL(65,30) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "purchases" ADD COLUMN     "status" "PurchaseStatus" NOT NULL DEFAULT 'RECORDED';

-- AlterTable
ALTER TABLE "debt_payments" ADD COLUMN     "transactionId" TEXT,
ADD COLUMN     "voidedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "cash_handovers" ADD COLUMN     "confirmedAt" TIMESTAMP(3),
ADD COLUMN     "confirmedById" TEXT,
ADD COLUMN     "reviewNote" TEXT,
ADD COLUMN     "status" "HandoverStatus" NOT NULL DEFAULT 'RECORDED';

-- AlterTable
ALTER TABLE "daily_reports" ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- CreateTable
CREATE TABLE "accounting_periods" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "status" "AccountingPeriodStatus" NOT NULL DEFAULT 'OPEN',
    "closedById" TEXT,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "accounting_periods_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_snapshots" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "dailyReportId" TEXT NOT NULL,
    "snapshotDate" TIMESTAMP(3) NOT NULL,
    "itemType" "InventoryItemType" NOT NULL,
    "stockItemId" TEXT,
    "menuItemId" TEXT,
    "name" TEXT NOT NULL,
    "unit" TEXT NOT NULL,
    "openingQuantity" DECIMAL(65,30) NOT NULL,
    "addedQuantity" DECIMAL(65,30) NOT NULL,
    "usedQuantity" DECIMAL(65,30) NOT NULL,
    "wastedQuantity" DECIMAL(65,30) NOT NULL,
    "adjustedQuantity" DECIMAL(65,30) NOT NULL,
    "closingQuantity" DECIMAL(65,30) NOT NULL,
    "unitCost" DECIMAL(65,30) NOT NULL,
    "closingValue" DECIMAL(65,30) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "inventory_snapshots_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "attachments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT,
    "uploadedById" TEXT NOT NULL,
    "entityType" TEXT,
    "entityId" TEXT,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "accounting_periods_organizationId_startDate_endDate_idx" ON "accounting_periods"("organizationId", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "accounting_periods_organizationId_startDate_key" ON "accounting_periods"("organizationId", "startDate");

-- CreateIndex
CREATE INDEX "inventory_snapshots_departmentId_snapshotDate_idx" ON "inventory_snapshots"("departmentId", "snapshotDate");

-- CreateIndex
CREATE INDEX "inventory_snapshots_dailyReportId_idx" ON "inventory_snapshots"("dailyReportId");

-- CreateIndex
CREATE INDEX "attachments_organizationId_entityType_entityId_idx" ON "attachments"("organizationId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "transactions_departmentId_date_idx" ON "transactions"("departmentId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "transactions_organizationId_idempotencyKey_key" ON "transactions"("organizationId", "idempotencyKey");

-- CreateIndex
CREATE INDEX "stock_movements_menuItemId_date_idx" ON "stock_movements"("menuItemId", "date");

-- CreateIndex
CREATE UNIQUE INDEX "debt_payments_transactionId_key" ON "debt_payments"("transactionId");

-- CreateIndex
CREATE INDEX "audit_events_entityType_entityId_idx" ON "audit_events"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "accounting_periods" ADD CONSTRAINT "accounting_periods_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "debt_payments" ADD CONSTRAINT "debt_payments_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_dailyReportId_fkey" FOREIGN KEY ("dailyReportId") REFERENCES "daily_reports"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_stockItemId_fkey" FOREIGN KEY ("stockItemId") REFERENCES "department_stock_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_snapshots" ADD CONSTRAINT "inventory_snapshots_menuItemId_fkey" FOREIGN KEY ("menuItemId") REFERENCES "menu_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "attachments" ADD CONSTRAINT "attachments_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

