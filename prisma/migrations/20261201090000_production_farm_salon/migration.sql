-- Production (bakery, workshop), farm (livestock, crops, fish) and salon / spa / gym
-- (docs/TRADE_AND_SERVICES_PLAN.md, phase 2). Additive: new department types, raw materials,
-- production movements, recipes and batches, farm batches and their events, appointments,
-- membership plans, memberships and visits; two columns on transactions.

ALTER TYPE "DepartmentDomain" ADD VALUE 'PRODUCTION';
ALTER TYPE "DepartmentDomain" ADD VALUE 'FARM';
ALTER TYPE "DepartmentDomain" ADD VALUE 'SALON';
ALTER TYPE "TradeProductKind" ADD VALUE 'RAW';
ALTER TYPE "TradeMovementKind" ADD VALUE 'PRODUCTION_OUT';
ALTER TYPE "TradeMovementKind" ADD VALUE 'PRODUCTION_IN';

CREATE TYPE "FarmBatchKind" AS ENUM ('POULTRY', 'LIVESTOCK', 'CROP', 'FISH');
CREATE TYPE "FarmEventKind" AS ENUM ('ADDITION', 'MORTALITY', 'FEED', 'TREATMENT', 'WEIGHT', 'PRODUCE', 'SALE', 'NOTE');
CREATE TYPE "AppointmentStatus" AS ENUM ('BOOKED', 'ARRIVED', 'NO_SHOW', 'CANCELLED');
CREATE TYPE "MembershipPlanKind" AS ENUM ('PERIOD', 'SESSIONS');

CREATE TABLE "production_recipes" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "yieldQuantity" DOUBLE PRECISION NOT NULL,
    "note" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_recipes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_recipe_lines" (
    "id" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "materialId" TEXT NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "production_recipe_lines_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "production_batches" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "recipeId" TEXT,
    "plannedQuantity" DOUBLE PRECISION NOT NULL,
    "producedQuantity" DOUBLE PRECISION NOT NULL,
    "totalCost" INTEGER NOT NULL,
    "unitCost" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'RECORDED',
    "voidReason" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "production_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_batches" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "kind" "FarmBatchKind" NOT NULL,
    "name" TEXT NOT NULL,
    "location" TEXT,
    "breed" TEXT,
    "unit" TEXT NOT NULL,
    "initialCount" DOUBLE PRECISION NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "expectedEndDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "closedAt" TIMESTAMP(3),
    "closeNote" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "farm_batches_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "farm_events" (
    "id" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "kind" "FarmEventKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "quantity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "unit" TEXT,
    "productId" TEXT,
    "value" INTEGER NOT NULL DEFAULT 0,
    "transactionId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "farm_events_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "appointments" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "clientId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "itemId" TEXT,
    "serviceLabel" TEXT,
    "workerId" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "minutes" INTEGER NOT NULL DEFAULT 60,
    "status" "AppointmentStatus" NOT NULL DEFAULT 'BOOKED',
    "ticketId" TEXT,
    "cancelReason" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "appointments_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_plans" (
    "id" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "kind" "MembershipPlanKind" NOT NULL,
    "days" INTEGER,
    "sessions" INTEGER,
    "price" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "membership_plans_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "memberships" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "clientId" TEXT,
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT,
    "startDate" DATE NOT NULL,
    "endDate" DATE,
    "sessionsTotal" INTEGER,
    "price" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "memberships_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "membership_visits" (
    "id" TEXT NOT NULL,
    "membershipId" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    CONSTRAINT "membership_visits_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "production_recipes_productId_key" ON "production_recipes"("productId");
CREATE INDEX "production_recipes_departmentId_idx" ON "production_recipes"("departmentId");
CREATE INDEX "production_recipe_lines_recipeId_idx" ON "production_recipe_lines"("recipeId");
CREATE UNIQUE INDEX "production_batches_departmentId_referenceNo_key" ON "production_batches"("departmentId", "referenceNo");
CREATE INDEX "production_batches_departmentId_date_idx" ON "production_batches"("departmentId", "date");
CREATE UNIQUE INDEX "farm_batches_departmentId_referenceNo_key" ON "farm_batches"("departmentId", "referenceNo");
CREATE INDEX "farm_batches_departmentId_status_idx" ON "farm_batches"("departmentId", "status");
CREATE INDEX "farm_events_batchId_date_idx" ON "farm_events"("batchId", "date");
CREATE INDEX "farm_events_departmentId_date_idx" ON "farm_events"("departmentId", "date");
CREATE UNIQUE INDEX "appointments_ticketId_key" ON "appointments"("ticketId");
CREATE UNIQUE INDEX "appointments_departmentId_referenceNo_key" ON "appointments"("departmentId", "referenceNo");
CREATE INDEX "appointments_departmentId_startAt_idx" ON "appointments"("departmentId", "startAt");
CREATE INDEX "appointments_workerId_startAt_idx" ON "appointments"("workerId", "startAt");
CREATE UNIQUE INDEX "membership_plans_departmentId_name_key" ON "membership_plans"("departmentId", "name");
CREATE UNIQUE INDEX "memberships_departmentId_referenceNo_key" ON "memberships"("departmentId", "referenceNo");
CREATE INDEX "memberships_departmentId_status_idx" ON "memberships"("departmentId", "status");
CREATE INDEX "membership_visits_membershipId_date_idx" ON "membership_visits"("membershipId", "date");

ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_recipe_lines" ADD CONSTRAINT "production_recipe_lines_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "production_recipes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "production_recipes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "farm_batches" ADD CONSTRAINT "farm_batches_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "farm_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "venue_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_workerId_fkey" FOREIGN KEY ("workerId") REFERENCES "service_workers"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_planId_fkey" FOREIGN KEY ("planId") REFERENCES "membership_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "venue_clients"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "membership_visits" ADD CONSTRAINT "membership_visits_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "trade_movements" ADD COLUMN "productionBatchId" TEXT;
ALTER TABLE "trade_movements" ADD COLUMN "farmEventId" TEXT;
CREATE INDEX "trade_movements_productionBatchId_idx" ON "trade_movements"("productionBatchId");

ALTER TABLE "transactions" ADD COLUMN "farmBatchId" TEXT;
ALTER TABLE "transactions" ADD COLUMN "membershipId" TEXT;
CREATE INDEX "transactions_farmBatchId_idx" ON "transactions"("farmBatchId");
CREATE INDEX "transactions_membershipId_idx" ON "transactions"("membershipId");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_farmBatchId_fkey" FOREIGN KEY ("farmBatchId") REFERENCES "farm_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_membershipId_fkey" FOREIGN KEY ("membershipId") REFERENCES "memberships"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Quantities and amounts that cannot be negative.
ALTER TABLE "production_recipes" ADD CONSTRAINT "production_recipes_yield_check" CHECK ("yieldQuantity" > 0);
ALTER TABLE "production_recipe_lines" ADD CONSTRAINT "production_recipe_lines_quantity_check" CHECK ("quantity" > 0);
ALTER TABLE "production_batches" ADD CONSTRAINT "production_batches_quantities_check" CHECK ("producedQuantity" > 0 AND "plannedQuantity" >= 0 AND "totalCost" >= 0 AND "unitCost" >= 0);
ALTER TABLE "farm_batches" ADD CONSTRAINT "farm_batches_initial_check" CHECK ("initialCount" >= 0);
ALTER TABLE "farm_events" ADD CONSTRAINT "farm_events_quantity_check" CHECK ("quantity" >= 0 AND "value" >= 0);
ALTER TABLE "appointments" ADD CONSTRAINT "appointments_minutes_check" CHECK ("minutes" > 0);
ALTER TABLE "membership_plans" ADD CONSTRAINT "membership_plans_values_check" CHECK ("price" >= 0 AND ("days" IS NULL OR "days" > 0) AND ("sessions" IS NULL OR "sessions" > 0));
ALTER TABLE "memberships" ADD CONSTRAINT "memberships_values_check" CHECK ("price" >= 0 AND ("sessionsTotal" IS NULL OR "sessionsTotal" > 0));
