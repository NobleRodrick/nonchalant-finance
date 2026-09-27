-- Cash requests: the Boss asks a department head to hand over the cash of a period.
-- Additive only (new enum, new table, one nullable column).

-- CreateEnum
CREATE TYPE "CashRequestStatus" AS ENUM ('OPEN', 'ANSWERED', 'CANCELLED');

-- AlterTable
ALTER TABLE "cash_handovers" ADD COLUMN     "cashRequestId" TEXT;

-- CreateTable
CREATE TABLE "cash_requests" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "fromKey" TEXT NOT NULL,
    "toKey" TEXT NOT NULL,
    "note" TEXT,
    "status" "CashRequestStatus" NOT NULL DEFAULT 'OPEN',
    "answeredAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cash_requests_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cash_requests_organizationId_status_idx" ON "cash_requests"("organizationId", "status");

-- CreateIndex
CREATE INDEX "cash_requests_departmentId_status_idx" ON "cash_requests"("departmentId", "status");

-- AddForeignKey
ALTER TABLE "cash_handovers" ADD CONSTRAINT "cash_handovers_cashRequestId_fkey" FOREIGN KEY ("cashRequestId") REFERENCES "cash_requests"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cash_requests" ADD CONSTRAINT "cash_requests_requestedById_fkey" FOREIGN KEY ("requestedById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

