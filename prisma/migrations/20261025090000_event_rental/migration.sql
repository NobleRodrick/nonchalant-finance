-- Event & decoration rental (MATERIAL_RENTAL departments, e.g. Deco Diva): stock lines and
-- their movements, bookings with lines, dispatch and returns, incidents and charges, the asset
-- register; per-person rights of heads; business details for documents
-- (docs/EVENT_RENTAL_PLAN.md). Additive only.

ALTER TYPE "PaymentMethod" ADD VALUE IF NOT EXISTS 'OTHER';

CREATE TYPE "ItemCondition" AS ENUM ('NEW', 'GOOD', 'FAIR', 'WORN');
CREATE TYPE "RentalMovementKind" AS ENUM ('OPENING', 'PURCHASED', 'ISSUED', 'RETURNED', 'DAMAGED', 'REPAIR_SENT', 'REPAIRED', 'MISSING', 'FOUND', 'WRITTEN_OFF', 'ADJUSTED', 'TRANSFERRED');
CREATE TYPE "RentalOrderStatus" AS ENUM ('INQUIRY', 'QUOTED', 'CONFIRMED', 'PREPARING', 'DISPATCHED', 'RETURNED', 'CLOSED', 'CANCELLED');
CREATE TYPE "RentalLineKind" AS ENUM ('ITEM', 'SERVICE');
CREATE TYPE "RentalCheckKind" AS ENUM ('DISPATCH', 'RETURN');
CREATE TYPE "RentalIncidentKind" AS ENUM ('DAMAGED', 'BROKEN', 'MISSING');
CREATE TYPE "RentalIncidentStatus" AS ENUM ('OPEN', 'CHARGED', 'LOSS', 'REPAIR', 'RESOLVED');
CREATE TYPE "RentalChargeKind" AS ENUM ('DAMAGE', 'EXTRA_DAYS', 'TRANSPORT', 'LABOUR', 'OTHER');
CREATE TYPE "DepreciationMethod" AS ENUM ('STRAIGHT_LINE', 'DECLINING_BALANCE');

-- Business details printed on documents; per-person rights; customers' address
ALTER TABLE "departments" ADD COLUMN "profile" JSONB;
ALTER TABLE "user_departments" ADD COLUMN "grants" TEXT[] NOT NULL DEFAULT ARRAY['APPROVE', 'VOID', 'PRICES', 'EXPORT', 'ARCHIVE']::TEXT[];
ALTER TABLE "venue_clients" ADD COLUMN "address" TEXT;

-- Stock lines
CREATE TABLE "rental_items" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "description" TEXT,
    "unit" TEXT NOT NULL DEFAULT 'piece',
    "rentalPrice" INTEGER NOT NULL DEFAULT 0,
    "purchasePrice" INTEGER NOT NULL DEFAULT 0,
    "replacementValue" INTEGER NOT NULL DEFAULT 0,
    "purchasedOn" DATE,
    "supplier" TEXT,
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "location" TEXT,
    "photoId" TEXT,
    "lowStockLevel" INTEGER NOT NULL DEFAULT 0,
    "owned" INTEGER NOT NULL DEFAULT 0,
    "out" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "inRepair" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "archiveReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rental_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_items_amounts_check" CHECK ("rentalPrice" >= 0 AND "purchasePrice" >= 0 AND "replacementValue" >= 0 AND "lowStockLevel" >= 0),
    CONSTRAINT "rental_items_counts_check" CHECK ("owned" >= 0 AND "out" >= 0 AND "damaged" >= 0 AND "inRepair" >= 0 AND "missing" >= 0 AND "out" + "damaged" + "inRepair" + "missing" <= "owned")
);
CREATE UNIQUE INDEX "rental_items_departmentId_code_key" ON "rental_items"("departmentId", "code");
CREATE INDEX "rental_items_departmentId_isActive_category_idx" ON "rental_items"("departmentId", "isActive", "category");
ALTER TABLE "rental_items" ADD CONSTRAINT "rental_items_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Customers' bookings
CREATE TABLE "rental_orders" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "eventLocation" TEXT,
    "dispatchDate" DATE NOT NULL,
    "returnDate" DATE NOT NULL,
    "guests" INTEGER,
    "status" "RentalOrderStatus" NOT NULL DEFAULT 'INQUIRY',
    "itemsTotal" INTEGER NOT NULL DEFAULT 0,
    "servicesTotal" INTEGER NOT NULL DEFAULT 0,
    "discount" INTEGER NOT NULL DEFAULT 0,
    "agreedPrice" INTEGER NOT NULL DEFAULT 0,
    "priceNote" TEXT,
    "depositDue" INTEGER NOT NULL DEFAULT 0,
    "paymentDueDate" DATE,
    "specialInstructions" TEXT,
    "notes" TEXT,
    "staffNames" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
    "handledById" TEXT,
    "createdById" TEXT NOT NULL,
    "quotedAt" TIMESTAMP(3),
    "confirmedAt" TIMESTAMP(3),
    "preparingAt" TIMESTAMP(3),
    "dispatchedAt" TIMESTAMP(3),
    "returnedAt" TIMESTAMP(3),
    "closedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rental_orders_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_orders_dates_check" CHECK ("dispatchDate" <= "eventDate" AND "eventDate" <= "returnDate"),
    CONSTRAINT "rental_orders_amounts_check" CHECK ("itemsTotal" >= 0 AND "servicesTotal" >= 0 AND "discount" >= 0 AND "agreedPrice" >= 0 AND "depositDue" >= 0 AND ("guests" IS NULL OR "guests" > 0))
);
CREATE UNIQUE INDEX "rental_orders_departmentId_referenceNo_key" ON "rental_orders"("departmentId", "referenceNo");
CREATE INDEX "rental_orders_departmentId_eventDate_idx" ON "rental_orders"("departmentId", "eventDate");
CREATE INDEX "rental_orders_departmentId_status_dispatchDate_idx" ON "rental_orders"("departmentId", "status", "dispatchDate");
CREATE INDEX "rental_orders_departmentId_returnDate_idx" ON "rental_orders"("departmentId", "returnDate");
CREATE INDEX "rental_orders_clientId_idx" ON "rental_orders"("clientId");
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "venue_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rental_orders" ADD CONSTRAINT "rental_orders_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "rental_order_lines" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "kind" "RentalLineKind" NOT NULL DEFAULT 'ITEM',
    "itemId" TEXT,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "listPrice" INTEGER NOT NULL DEFAULT 0,
    "unitPrice" INTEGER NOT NULL,
    "total" INTEGER NOT NULL,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "issued" INTEGER NOT NULL DEFAULT 0,
    "returned" INTEGER NOT NULL DEFAULT 0,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "broken" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rental_order_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_order_lines_check" CHECK ("quantity" > 0 AND "unitPrice" >= 0 AND "listPrice" >= 0 AND "total" >= 0 AND "issued" >= 0 AND "returned" >= 0 AND "damaged" >= 0 AND "broken" >= 0 AND "missing" >= 0 AND "returned" + "damaged" + "broken" + "missing" <= "issued" AND ("kind" = 'SERVICE' OR "itemId" IS NOT NULL))
);
CREATE INDEX "rental_order_lines_orderId_idx" ON "rental_order_lines"("orderId");
CREATE INDEX "rental_order_lines_itemId_idx" ON "rental_order_lines"("itemId");
ALTER TABLE "rental_order_lines" ADD CONSTRAINT "rental_order_lines_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_order_lines" ADD CONSTRAINT "rental_order_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "rental_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Stock movements (the ledger behind each line's counters)
CREATE TABLE "rental_movements" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "kind" "RentalMovementKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "dOwned" INTEGER NOT NULL DEFAULT 0,
    "dOut" INTEGER NOT NULL DEFAULT 0,
    "dDamaged" INTEGER NOT NULL DEFAULT 0,
    "dRepair" INTEGER NOT NULL DEFAULT 0,
    "dMissing" INTEGER NOT NULL DEFAULT 0,
    "value" INTEGER NOT NULL DEFAULT 0,
    "orderId" TEXT,
    "purchaseId" TEXT,
    "incidentId" TEXT,
    "fromLocation" TEXT,
    "toLocation" TEXT,
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rental_movements_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_movements_check" CHECK ("quantity" >= 0 AND "value" >= 0)
);
CREATE UNIQUE INDEX "rental_movements_departmentId_referenceNo_key" ON "rental_movements"("departmentId", "referenceNo");
CREATE INDEX "rental_movements_itemId_date_idx" ON "rental_movements"("itemId", "date");
CREATE INDEX "rental_movements_departmentId_date_idx" ON "rental_movements"("departmentId", "date");
CREATE INDEX "rental_movements_orderId_idx" ON "rental_movements"("orderId");
ALTER TABLE "rental_movements" ADD CONSTRAINT "rental_movements_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_movements" ADD CONSTRAINT "rental_movements_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "rental_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_movements" ADD CONSTRAINT "rental_movements_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rental_movements" ADD CONSTRAINT "rental_movements_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Dispatch and returns
CREATE TABLE "rental_checks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "kind" "RentalCheckKind" NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "counterpart" TEXT,
    "notes" TEXT,
    "checkedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rental_checks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "rental_checks_departmentId_referenceNo_key" ON "rental_checks"("departmentId", "referenceNo");
CREATE INDEX "rental_checks_orderId_idx" ON "rental_checks"("orderId");
CREATE INDEX "rental_checks_departmentId_date_idx" ON "rental_checks"("departmentId", "date");
ALTER TABLE "rental_checks" ADD CONSTRAINT "rental_checks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_checks" ADD CONSTRAINT "rental_checks_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_checks" ADD CONSTRAINT "rental_checks_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE "rental_check_lines" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "lineId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "broken" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "rental_check_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_check_lines_check" CHECK ("quantity" >= 0 AND "damaged" >= 0 AND "broken" >= 0 AND "missing" >= 0)
);
CREATE INDEX "rental_check_lines_checkId_idx" ON "rental_check_lines"("checkId");
ALTER TABLE "rental_check_lines" ADD CONSTRAINT "rental_check_lines_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "rental_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_check_lines" ADD CONSTRAINT "rental_check_lines_lineId_fkey" FOREIGN KEY ("lineId") REFERENCES "rental_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_check_lines" ADD CONSTRAINT "rental_check_lines_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "rental_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Charges added to what a customer owes
CREATE TABLE "rental_charges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "kind" "RentalChargeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "rental_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_charges_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "rental_charges_departmentId_referenceNo_key" ON "rental_charges"("departmentId", "referenceNo");
CREATE INDEX "rental_charges_orderId_idx" ON "rental_charges"("orderId");
CREATE INDEX "rental_charges_departmentId_date_idx" ON "rental_charges"("departmentId", "date");
ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_charges" ADD CONSTRAINT "rental_charges_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "rental_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Damaged, broken and missing items
CREATE TABLE "rental_incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "orderId" TEXT,
    "kind" "RentalIncidentKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "reason" TEXT,
    "responsibleName" TEXT,
    "estimatedLoss" INTEGER NOT NULL DEFAULT 0,
    "repairCost" INTEGER NOT NULL DEFAULT 0,
    "chargedAmount" INTEGER NOT NULL DEFAULT 0,
    "status" "RentalIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "chargeId" TEXT,
    "repairBy" TEXT,
    "stockAction" TEXT,
    "repairedAt" TIMESTAMP(3),
    "note" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "settledAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rental_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rental_incidents_check" CHECK ("quantity" > 0 AND "estimatedLoss" >= 0 AND "repairCost" >= 0 AND "chargedAmount" >= 0)
);
CREATE UNIQUE INDEX "rental_incidents_departmentId_referenceNo_key" ON "rental_incidents"("departmentId", "referenceNo");
CREATE UNIQUE INDEX "rental_incidents_chargeId_key" ON "rental_incidents"("chargeId");
CREATE INDEX "rental_incidents_departmentId_status_idx" ON "rental_incidents"("departmentId", "status");
CREATE INDEX "rental_incidents_orderId_idx" ON "rental_incidents"("orderId");
CREATE INDEX "rental_incidents_itemId_idx" ON "rental_incidents"("itemId");
ALTER TABLE "rental_incidents" ADD CONSTRAINT "rental_incidents_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "rental_incidents" ADD CONSTRAINT "rental_incidents_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "rental_items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "rental_incidents" ADD CONSTRAINT "rental_incidents_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rental_incidents" ADD CONSTRAINT "rental_incidents_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "rental_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "rental_incidents" ADD CONSTRAINT "rental_incidents_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Asset register (any department)
CREATE TABLE "fixed_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "rentalItemId" TEXT,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "purchaseDate" DATE NOT NULL,
    "cost" INTEGER NOT NULL,
    "supplier" TEXT,
    "usefulLifeMonths" INTEGER NOT NULL,
    "salvageValue" INTEGER NOT NULL DEFAULT 0,
    "method" "DepreciationMethod" NOT NULL DEFAULT 'STRAIGHT_LINE',
    "condition" "ItemCondition" NOT NULL DEFAULT 'GOOD',
    "location" TEXT,
    "responsibleName" TEXT,
    "notes" TEXT,
    "purchaseId" TEXT,
    "disposedOn" DATE,
    "disposalReason" TEXT,
    "disposalValue" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "fixed_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "fixed_assets_check" CHECK ("quantity" > 0 AND "cost" >= 0 AND "usefulLifeMonths" > 0 AND "salvageValue" >= 0 AND "salvageValue" <= "cost" AND "disposalValue" >= 0)
);
CREATE UNIQUE INDEX "fixed_assets_departmentId_code_key" ON "fixed_assets"("departmentId", "code");
CREATE INDEX "fixed_assets_departmentId_disposedOn_idx" ON "fixed_assets"("departmentId", "disposedOn");
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "fixed_assets" ADD CONSTRAINT "fixed_assets_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "rental_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Money of bookings; purchases of rental items
ALTER TABLE "transactions" ADD COLUMN "rentalOrderId" TEXT;
CREATE INDEX "transactions_rentalOrderId_idx" ON "transactions"("rentalOrderId");
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_rentalOrderId_fkey" FOREIGN KEY ("rentalOrderId") REFERENCES "rental_orders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "purchase_lines" ADD COLUMN "rentalItemId" TEXT;
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_rentalItemId_fkey" FOREIGN KEY ("rentalItemId") REFERENCES "rental_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;
