-- Faster pages: indexes for the debts page, the daily report, the Boss's counters.
CREATE INDEX "debts_departmentId_date_idx" ON "debts"("departmentId", "date");
CREATE INDEX "debt_payments_departmentId_date_idx" ON "debt_payments"("departmentId", "date");
CREATE INDEX "cash_handovers_organizationId_status_idx" ON "cash_handovers"("organizationId", "status");
CREATE INDEX "daily_reports_organizationId_status_idx" ON "daily_reports"("organizationId", "status");

-- Offline sync: every write sent by a device, keyed for idempotency (lib/sync).
CREATE TABLE "sync_operations" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT,
    "userId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "result" JSONB NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sync_operations_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "sync_operations_organizationId_key_key" ON "sync_operations"("organizationId", "key");
CREATE INDEX "sync_operations_departmentId_appliedAt_idx" ON "sync_operations"("departmentId", "appliedAt");

ALTER TABLE "sync_operations" ADD CONSTRAINT "sync_operations_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organizations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
