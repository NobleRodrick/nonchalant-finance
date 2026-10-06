-- Office & property rental (PROPERTY_RENTAL departments, e.g. Place Étoilée & Main Building):
-- buildings, offices with their charge settings and price history, contracts, charges and meter
-- readings, payment allocations, the deposit ledger, maintenance and inspections; money records
-- linked to a contract, an office or a building; tenants' identification
-- (docs/PROPERTY_RENTAL_PLAN.md). Additive only.

ALTER TYPE "DepartmentDomain" ADD VALUE IF NOT EXISTS 'PROPERTY_RENTAL';

CREATE TYPE "PropertyUnitState" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE', 'AWAITING_HANDOVER');
CREATE TYPE "PropertyChargeKind" AS ENUM ('ELECTRICITY', 'WATER', 'INTERNET', 'CLEANING', 'SECURITY', 'WASTE', 'MAINTENANCE', 'DAMAGE', 'LATE_FEE', 'OTHER');
CREATE TYPE "PropertyBillingMethod" AS ENUM ('METER', 'FIXED', 'SHARE', 'INCLUDED');
CREATE TYPE "PropertyLeaseStatus" AS ENUM ('RESERVED', 'ACTIVE', 'ENDED', 'CANCELLED');
CREATE TYPE "PropertyDepositKind" AS ENUM ('RECEIVED', 'REFUNDED', 'APPLIED_RENT', 'APPLIED_CHARGES', 'APPLIED_DAMAGE');
CREATE TYPE "PropertyMaintenanceStatus" AS ENUM ('REPORTED', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED');
CREATE TYPE "PropertyInspectionKind" AS ENUM ('MOVE_IN', 'MOVE_OUT', 'DAMAGE', 'MAINTENANCE', 'ROUTINE');

CREATE TABLE "property_buildings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "address" TEXT,
    "notes" TEXT,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_buildings_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_units" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "buildingId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "floor" TEXT,
    "category" TEXT,
    "size" DOUBLE PRECISION,
    "listRent" INTEGER NOT NULL DEFAULT 0,
    "depositRequired" INTEGER NOT NULL DEFAULT 0,
    "condition" TEXT,
    "state" "PropertyUnitState" NOT NULL DEFAULT 'AVAILABLE',
    "stateNote" TEXT,
    "availableFrom" DATE,
    "description" TEXT,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_units_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_unit_charges" (
    "id" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" "PropertyChargeKind" NOT NULL,
    "label" TEXT,
    "method" "PropertyBillingMethod" NOT NULL,
    "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "meterNumber" TEXT,
    "lastReading" DOUBLE PRECISION,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_unit_charges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_rates" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "unitId" TEXT,
    "leaseId" TEXT,
    "amount" INTEGER NOT NULL,
    "fromMonth" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "property_rates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_leases" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "status" "PropertyLeaseStatus" NOT NULL DEFAULT 'RESERVED',
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "moveInDate" DATE,
    "moveOutDate" DATE,
    "rent" INTEGER NOT NULL,
    "dueDay" INTEGER NOT NULL DEFAULT 5,
    "monthsPerBill" INTEGER NOT NULL DEFAULT 1,
    "depositRequired" INTEGER NOT NULL DEFAULT 0,
    "noticeDays" INTEGER NOT NULL DEFAULT 30,
    "utilities" TEXT,
    "conditions" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "endReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "settlement" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_leases_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_charges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "kind" "PropertyChargeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "monthKey" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "dueDate" DATE NOT NULL,
    "amount" INTEGER NOT NULL,
    "previousReading" DOUBLE PRECISION,
    "currentReading" DOUBLE PRECISION,
    "units" DOUBLE PRECISION,
    "rate" DOUBLE PRECISION,
    "note" TEXT,
    "maintenanceId" TEXT,
    "inspectionId" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "property_charges_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_allocations" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "monthKey" TEXT,
    "chargeId" TEXT,
    "amount" INTEGER NOT NULL,
    "source" TEXT NOT NULL,
    "transactionId" TEXT,
    "depositId" TEXT,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "property_allocations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_deposits" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "leaseId" TEXT NOT NULL,
    "kind" "PropertyDepositKind" NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "transactionId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "property_deposits_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_maintenance" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "leaseId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "priority" TEXT NOT NULL DEFAULT 'NORMAL',
    "reportedAt" TIMESTAMP(3) NOT NULL,
    "reportedBy" TEXT,
    "assignedTo" TEXT,
    "scheduledFor" TIMESTAMP(3),
    "status" "PropertyMaintenanceStatus" NOT NULL DEFAULT 'REPORTED',
    "cost" INTEGER NOT NULL DEFAULT 0,
    "technician" TEXT,
    "approvedById" TEXT,
    "approvedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "transactionId" TEXT,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_maintenance_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "property_inspections" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "unitId" TEXT NOT NULL,
    "leaseId" TEXT,
    "maintenanceId" TEXT,
    "kind" "PropertyInspectionKind" NOT NULL,
    "scheduledFor" DATE,
    "doneAt" TIMESTAMP(3),
    "inspector" TEXT,
    "condition" TEXT,
    "rows" JSONB,
    "damageCost" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "property_inspections_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "property_buildings_departmentId_name_key" ON "property_buildings"("departmentId", "name");
CREATE UNIQUE INDEX "property_units_buildingId_name_key" ON "property_units"("buildingId", "name");
CREATE INDEX "property_units_departmentId_isActive_idx" ON "property_units"("departmentId", "isActive");
CREATE INDEX "property_unit_charges_unitId_idx" ON "property_unit_charges"("unitId");
CREATE INDEX "property_rates_unitId_fromMonth_idx" ON "property_rates"("unitId", "fromMonth");
CREATE INDEX "property_rates_leaseId_fromMonth_idx" ON "property_rates"("leaseId", "fromMonth");
CREATE UNIQUE INDEX "property_leases_departmentId_referenceNo_key" ON "property_leases"("departmentId", "referenceNo");
CREATE INDEX "property_leases_unitId_status_idx" ON "property_leases"("unitId", "status");
CREATE INDEX "property_leases_clientId_idx" ON "property_leases"("clientId");
CREATE INDEX "property_leases_departmentId_status_idx" ON "property_leases"("departmentId", "status");
CREATE UNIQUE INDEX "property_charges_departmentId_referenceNo_key" ON "property_charges"("departmentId", "referenceNo");
CREATE INDEX "property_charges_leaseId_monthKey_idx" ON "property_charges"("leaseId", "monthKey");
CREATE INDEX "property_charges_departmentId_date_idx" ON "property_charges"("departmentId", "date");
CREATE INDEX "property_allocations_leaseId_idx" ON "property_allocations"("leaseId");
CREATE INDEX "property_allocations_transactionId_idx" ON "property_allocations"("transactionId");
CREATE INDEX "property_allocations_chargeId_idx" ON "property_allocations"("chargeId");
CREATE UNIQUE INDEX "property_deposits_transactionId_key" ON "property_deposits"("transactionId");
CREATE INDEX "property_deposits_leaseId_idx" ON "property_deposits"("leaseId");
CREATE INDEX "property_deposits_departmentId_date_idx" ON "property_deposits"("departmentId", "date");
CREATE UNIQUE INDEX "property_maintenance_departmentId_referenceNo_key" ON "property_maintenance"("departmentId", "referenceNo");
CREATE INDEX "property_maintenance_unitId_idx" ON "property_maintenance"("unitId");
CREATE INDEX "property_maintenance_departmentId_status_idx" ON "property_maintenance"("departmentId", "status");
CREATE UNIQUE INDEX "property_inspections_departmentId_referenceNo_key" ON "property_inspections"("departmentId", "referenceNo");
CREATE INDEX "property_inspections_unitId_idx" ON "property_inspections"("unitId");
CREATE INDEX "property_inspections_departmentId_scheduledFor_idx" ON "property_inspections"("departmentId", "scheduledFor");

ALTER TABLE "property_buildings" ADD CONSTRAINT "property_buildings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "property_buildings"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_unit_charges" ADD CONSTRAINT "property_unit_charges_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_rates" ADD CONSTRAINT "property_rates_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_rates" ADD CONSTRAINT "property_rates_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "property_leases"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_leases" ADD CONSTRAINT "property_leases_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "property_leases" ADD CONSTRAINT "property_leases_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_leases" ADD CONSTRAINT "property_leases_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "venue_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_leases" ADD CONSTRAINT "property_leases_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_charges" ADD CONSTRAINT "property_charges_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "property_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_charges" ADD CONSTRAINT "property_charges_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_allocations" ADD CONSTRAINT "property_allocations_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "property_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_allocations" ADD CONSTRAINT "property_allocations_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "property_charges"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_allocations" ADD CONSTRAINT "property_allocations_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_allocations" ADD CONSTRAINT "property_allocations_depositId_fkey" FOREIGN KEY ("depositId") REFERENCES "property_deposits"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_deposits" ADD CONSTRAINT "property_deposits_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "property_leases"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_deposits" ADD CONSTRAINT "property_deposits_transactionId_fkey" FOREIGN KEY ("transactionId") REFERENCES "transactions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_maintenance" ADD CONSTRAINT "property_maintenance_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_maintenance" ADD CONSTRAINT "property_maintenance_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "property_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "property_inspections" ADD CONSTRAINT "property_inspections_unitId_fkey" FOREIGN KEY ("unitId") REFERENCES "property_units"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "property_inspections" ADD CONSTRAINT "property_inspections_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "property_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Rules the database keeps too
ALTER TABLE "property_units" ADD CONSTRAINT "property_units_amounts_check" CHECK ("listRent" >= 0 AND "depositRequired" >= 0 AND ("size" IS NULL OR "size" > 0));
ALTER TABLE "property_leases" ADD CONSTRAINT "property_leases_terms_check" CHECK ("rent" >= 0 AND "depositRequired" >= 0 AND "dueDay" BETWEEN 1 AND 28 AND "monthsPerBill" IN (1, 3, 6, 12) AND "noticeDays" >= 0 AND ("endDate" IS NULL OR "endDate" >= "startDate") AND ("moveOutDate" IS NULL OR "moveOutDate" >= "startDate"));
ALTER TABLE "property_charges" ADD CONSTRAINT "property_charges_amount_check" CHECK ("amount" > 0);
ALTER TABLE "property_allocations" ADD CONSTRAINT "property_allocations_target_check" CHECK ("amount" > 0 AND (("monthKey" IS NOT NULL) <> ("chargeId" IS NOT NULL)));
ALTER TABLE "property_deposits" ADD CONSTRAINT "property_deposits_amount_check" CHECK ("amount" > 0);
ALTER TABLE "property_rates" ADD CONSTRAINT "property_rates_target_check" CHECK ("amount" >= 0 AND (("unitId" IS NOT NULL) <> ("leaseId" IS NOT NULL)));

-- Tenants (shared customers table)
ALTER TABLE "venue_clients" ADD COLUMN "identification" TEXT;

-- Money records of a contract, an office or a building
ALTER TABLE "transactions" ADD COLUMN "leaseId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "propertyUnitId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "buildingId" TEXT;
CREATE INDEX "transactions_leaseId_idx" ON "transactions"("leaseId");
CREATE INDEX "transactions_propertyUnitId_date_idx" ON "transactions"("propertyUnitId", "date");
CREATE INDEX "transactions_buildingId_date_idx" ON "transactions"("buildingId", "date");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_leaseId_fkey" FOREIGN KEY ("leaseId") REFERENCES "property_leases"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_propertyUnitId_fkey" FOREIGN KEY ("propertyUnitId") REFERENCES "property_units"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_buildingId_fkey" FOREIGN KEY ("buildingId") REFERENCES "property_buildings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
