-- Executive Stay (rooms / guest house department type) completed: apartment profiles and state,
-- booking details, money of stays and apartments, expense validation, asset register and
-- movements, maintenance and repairs (docs/EXECUTIVE_STAY_PLAN.md). Additive only.

CREATE TYPE "RoomState" AS ENUM ('AVAILABLE', 'MAINTENANCE', 'UNAVAILABLE');
CREATE TYPE "RoomAssetMovementKind" AS ENUM ('BOUGHT', 'TRANSFER_OUT', 'TRANSFER_IN', 'DAMAGED', 'MISSING', 'REPAIRED', 'REPLACED', 'REMOVED');
CREATE TYPE "RepairPriority" AS ENUM ('LOW', 'NORMAL', 'HIGH', 'URGENT');
CREATE TYPE "RepairStatus" AS ENUM ('REPORTED', 'IN_PROGRESS', 'DONE', 'CANCELLED');

-- Apartments
ALTER TABLE "rooms" ADD COLUMN "weeklyRate" INTEGER,
  ADD COLUMN "monthlyRate" INTEGER,
  ADD COLUMN "description" TEXT,
  ADD COLUMN "state" "RoomState" NOT NULL DEFAULT 'AVAILABLE',
  ADD COLUMN "stateNote" TEXT;
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_rates_check" CHECK (("weeklyRate" IS NULL OR "weeklyRate" >= 0) AND ("monthlyRate" IS NULL OR "monthlyRate" >= 0));

-- Bookings
ALTER TABLE "room_bookings" ADD COLUMN "guestEmail" TEXT,
  ADD COLUMN "guestCount" INTEGER,
  ADD COLUMN "bookingType" TEXT NOT NULL DEFAULT 'NIGHT',
  ADD COLUMN "priceNote" TEXT,
  ADD COLUMN "checkedInAt" TIMESTAMP(3),
  ADD COLUMN "checkedOutAt" TIMESTAMP(3);
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_guests_check" CHECK ("guestCount" IS NULL OR "guestCount" > 0);

-- Money of stays and apartments, expense validation
ALTER TABLE "transactions" ADD COLUMN "stayId" TEXT,
  ADD COLUMN "roomId" TEXT,
  ADD COLUMN "authorizedByName" TEXT,
  ADD COLUMN "validatedById" TEXT,
  ADD COLUMN "validatedAt" TIMESTAMP(3),
  ADD COLUMN "validationNote" TEXT;
CREATE INDEX "transactions_stayId_idx" ON "transactions"("stayId");
CREATE INDEX "transactions_roomId_date_idx" ON "transactions"("roomId", "date");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_stayId_fkey" FOREIGN KEY ("stayId") REFERENCES "room_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_validatedById_fkey" FOREIGN KEY ("validatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Asset register
CREATE TABLE "room_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "roomId" TEXT,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "unitValue" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "room_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_assets_counts_check" CHECK ("quantity" >= 0 AND "damaged" >= 0 AND "damaged" <= "quantity" AND "unitValue" >= 0)
);
CREATE INDEX "room_assets_departmentId_roomId_idx" ON "room_assets"("departmentId", "roomId");
ALTER TABLE "room_assets" ADD CONSTRAINT "room_assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_assets" ADD CONSTRAINT "room_assets_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "room_asset_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "kind" "RoomAssetMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "value" INTEGER NOT NULL DEFAULT 0,
    "loss" INTEGER NOT NULL DEFAULT 0,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "otherRoomId" TEXT,
    "transactionId" TEXT,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "room_asset_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_asset_movements_amounts_check" CHECK ("quantity" > 0 AND "value" >= 0 AND "loss" >= 0 AND "cost" >= 0)
);
CREATE UNIQUE INDEX "room_asset_movements_departmentId_referenceNo_key" ON "room_asset_movements"("departmentId", "referenceNo");
CREATE INDEX "room_asset_movements_departmentId_date_idx" ON "room_asset_movements"("departmentId", "date");
CREATE INDEX "room_asset_movements_assetId_idx" ON "room_asset_movements"("assetId");
ALTER TABLE "room_asset_movements" ADD CONSTRAINT "room_asset_movements_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_asset_movements" ADD CONSTRAINT "room_asset_movements_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "room_assets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_asset_movements" ADD CONSTRAINT "room_asset_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Maintenance and repairs
CREATE TABLE "room_repairs" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "assetId" TEXT,
    "referenceNo" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "reportedOn" DATE NOT NULL,
    "priority" "RepairPriority" NOT NULL DEFAULT 'NORMAL',
    "status" "RepairStatus" NOT NULL DEFAULT 'REPORTED',
    "estimatedCost" INTEGER,
    "actualCost" INTEGER,
    "responsibleName" TEXT,
    "repairedOn" DATE,
    "transactionId" TEXT,
    "blocksRoom" BOOLEAN NOT NULL DEFAULT false,
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "room_repairs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_repairs_costs_check" CHECK (("estimatedCost" IS NULL OR "estimatedCost" >= 0) AND ("actualCost" IS NULL OR "actualCost" >= 0))
);
CREATE UNIQUE INDEX "room_repairs_departmentId_referenceNo_key" ON "room_repairs"("departmentId", "referenceNo");
CREATE INDEX "room_repairs_departmentId_status_idx" ON "room_repairs"("departmentId", "status");
CREATE INDEX "room_repairs_roomId_idx" ON "room_repairs"("roomId");
ALTER TABLE "room_repairs" ADD CONSTRAINT "room_repairs_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_repairs" ADD CONSTRAINT "room_repairs_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_repairs" ADD CONSTRAINT "room_repairs_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "room_assets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "room_repairs" ADD CONSTRAINT "room_repairs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
