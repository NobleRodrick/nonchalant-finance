-- Event venue / banquet hall department type (docs/VENUE_RENTAL_PLAN.md). Additive only.

-- Department type and money types
ALTER TYPE "DepartmentDomain" ADD VALUE IF NOT EXISTS 'EVENT_VENUE';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'BOOKING_PAYMENT';
ALTER TYPE "TransactionType" ADD VALUE IF NOT EXISTS 'BOOKING_REFUND';

-- Enums
CREATE TYPE "VenuePriceRuleKind" AS ENUM ('WEEKDAY', 'SEASON', 'SPECIAL_DATE');
CREATE TYPE "VenueBookingStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'COMPLETED', 'CANCELLED');
CREATE TYPE "VenueChargeKind" AS ENUM ('DAMAGE', 'EXTRA_SERVICE', 'OTHER');
CREATE TYPE "VenuePackageItemKind" AS ENUM ('ROOM', 'SERVICE', 'OTHER');
CREATE TYPE "VenueAssetCategory" AS ENUM ('CHAIRS', 'TABLES', 'DECORATION', 'SOUND', 'LIGHTING', 'FURNITURE', 'OTHER');
CREATE TYPE "EventCheckPhase" AS ENUM ('BEFORE', 'AFTER');
CREATE TYPE "AssetIncidentKind" AS ENUM ('DAMAGED', 'MISSING');
CREATE TYPE "AssetResponsibility" AS ENUM ('CLIENT', 'STAFF', 'UNKNOWN');
CREATE TYPE "AssetIncidentStatus" AS ENUM ('OPEN', 'CHARGED', 'LOSS', 'RESOLVED');
CREATE TYPE "VenueLeadStatus" AS ENUM ('NEW', 'CONTACTED', 'FOLLOW_UP', 'NEGOTIATING', 'BOOKED', 'LOST', 'CANCELLED');

-- Halls
CREATE TABLE "venues" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "capacity" INTEGER,
    "basePrice" INTEGER NOT NULL DEFAULT 0,
    "reservationHoldDays" INTEGER NOT NULL DEFAULT 7,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venues_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "venues_departmentId_name_key" ON "venues"("departmentId", "name");
CREATE INDEX "venues_organizationId_idx" ON "venues"("organizationId");

-- Price rules
CREATE TABLE "venue_price_rules" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "kind" "VenuePriceRuleKind" NOT NULL,
    "label" TEXT,
    "weekday" INTEGER,
    "startDate" DATE,
    "endDate" DATE,
    "price" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_price_rules_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_price_rules_price_check" CHECK ("price" >= 0),
    CONSTRAINT "venue_price_rules_weekday_check" CHECK ("weekday" IS NULL OR ("weekday" BETWEEN 0 AND 6)),
    CONSTRAINT "venue_price_rules_range_check" CHECK ("startDate" IS NULL OR "endDate" IS NULL OR "startDate" <= "endDate")
);
CREATE INDEX "venue_price_rules_venueId_kind_idx" ON "venue_price_rules"("venueId", "kind");

-- Clients
CREATE TABLE "venue_clients" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "phoneAlt" TEXT,
    "email" TEXT,
    "company" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_clients_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "venue_clients_departmentId_name_idx" ON "venue_clients"("departmentId", "name");
CREATE INDEX "venue_clients_organizationId_idx" ON "venue_clients"("organizationId");

-- Packages
CREATE TABLE "venue_packages" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "archivedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_packages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_packages_price_check" CHECK ("price" >= 0)
);
CREATE INDEX "venue_packages_departmentId_isActive_idx" ON "venue_packages"("departmentId", "isActive");

CREATE TABLE "venue_package_items" (
    "id" TEXT NOT NULL,
    "packageId" TEXT NOT NULL,
    "kind" "VenuePackageItemKind" NOT NULL,
    "label" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "nights" INTEGER,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "venue_package_items_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_package_items_quantity_check" CHECK ("quantity" > 0)
);
CREATE INDEX "venue_package_items_packageId_idx" ON "venue_package_items"("packageId");

-- Leads
CREATE TABLE "venue_leads" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "enquiryDate" DATE NOT NULL,
    "proposedDate" DATE,
    "eventType" TEXT,
    "guests" INTEGER,
    "packageId" TEXT,
    "priceDiscussed" INTEGER,
    "source" TEXT,
    "handledById" TEXT,
    "followUpDate" DATE,
    "status" "VenueLeadStatus" NOT NULL DEFAULT 'NEW',
    "closedReason" TEXT,
    "closedAt" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_leads_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "venue_leads_departmentId_status_idx" ON "venue_leads"("departmentId", "status");
CREATE INDEX "venue_leads_departmentId_followUpDate_idx" ON "venue_leads"("departmentId", "followUpDate");
CREATE INDEX "venue_leads_departmentId_enquiryDate_idx" ON "venue_leads"("departmentId", "enquiryDate");

-- Bookings
CREATE TABLE "venue_bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventDate" DATE NOT NULL,
    "startTime" TEXT,
    "endTime" TEXT,
    "guests" INTEGER,
    "status" "VenueBookingStatus" NOT NULL DEFAULT 'RESERVED',
    "hallPrice" INTEGER NOT NULL,
    "packageId" TEXT,
    "packageSnapshot" JSONB,
    "packagePrice" INTEGER NOT NULL DEFAULT 0,
    "agreedPrice" INTEGER NOT NULL,
    "priceNote" TEXT,
    "holdUntil" DATE,
    "bookedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "notes" TEXT,
    "leadId" TEXT,
    "handledById" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_bookings_amounts_check" CHECK ("hallPrice" >= 0 AND "packagePrice" >= 0 AND "agreedPrice" >= 0),
    CONSTRAINT "venue_bookings_guests_check" CHECK ("guests" IS NULL OR "guests" >= 0)
);
CREATE UNIQUE INDEX "venue_bookings_departmentId_referenceNo_key" ON "venue_bookings"("departmentId", "referenceNo");
CREATE UNIQUE INDEX "venue_bookings_leadId_key" ON "venue_bookings"("leadId");
CREATE INDEX "venue_bookings_departmentId_eventDate_idx" ON "venue_bookings"("departmentId", "eventDate");
CREATE INDEX "venue_bookings_departmentId_status_eventDate_idx" ON "venue_bookings"("departmentId", "status", "eventDate");
CREATE INDEX "venue_bookings_organizationId_eventDate_idx" ON "venue_bookings"("organizationId", "eventDate");
CREATE INDEX "venue_bookings_clientId_idx" ON "venue_bookings"("clientId");
-- One event per date and hall: a cancelled booking frees the date. The database refuses a
-- second active booking even when two people book the same date at the same moment.
CREATE UNIQUE INDEX "venue_bookings_one_event_per_date" ON "venue_bookings"("venueId", "eventDate") WHERE "status" <> 'CANCELLED';

-- Charges added to a booking (damages, extra services)
CREATE TABLE "venue_booking_charges" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "kind" "VenueChargeKind" NOT NULL,
    "label" TEXT NOT NULL,
    "amount" INTEGER NOT NULL,
    "date" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdById" TEXT NOT NULL,
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "venue_booking_charges_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_booking_charges_amount_check" CHECK ("amount" > 0)
);
CREATE UNIQUE INDEX "venue_booking_charges_departmentId_referenceNo_key" ON "venue_booking_charges"("departmentId", "referenceNo");
CREATE INDEX "venue_booking_charges_bookingId_idx" ON "venue_booking_charges"("bookingId");
CREATE INDEX "venue_booking_charges_departmentId_date_idx" ON "venue_booking_charges"("departmentId", "date");

-- Assets and checks
CREATE TABLE "venue_assets" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "VenueAssetCategory" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitValue" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_assets_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_assets_amounts_check" CHECK ("quantity" >= 0 AND "unitValue" >= 0)
);
CREATE UNIQUE INDEX "venue_assets_departmentId_name_key" ON "venue_assets"("departmentId", "name");
CREATE INDEX "venue_assets_organizationId_idx" ON "venue_assets"("organizationId");

CREATE TABLE "event_asset_checks" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "phase" "EventCheckPhase" NOT NULL,
    "checkedById" TEXT NOT NULL,
    "checkedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "event_asset_checks_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "event_asset_checks_bookingId_phase_key" ON "event_asset_checks"("bookingId", "phase");
CREATE INDEX "event_asset_checks_departmentId_checkedAt_idx" ON "event_asset_checks"("departmentId", "checkedAt");

CREATE TABLE "event_asset_check_lines" (
    "id" TEXT NOT NULL,
    "checkId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "expected" INTEGER NOT NULL,
    "good" INTEGER NOT NULL,
    "damaged" INTEGER NOT NULL DEFAULT 0,
    "missing" INTEGER NOT NULL DEFAULT 0,
    "note" TEXT,
    CONSTRAINT "event_asset_check_lines_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "event_asset_check_lines_counts_check" CHECK ("good" >= 0 AND "damaged" >= 0 AND "missing" >= 0 AND "good" + "damaged" + "missing" = "expected")
);
CREATE UNIQUE INDEX "event_asset_check_lines_checkId_assetId_key" ON "event_asset_check_lines"("checkId", "assetId");

CREATE TABLE "venue_asset_incidents" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "bookingId" TEXT NOT NULL,
    "assetId" TEXT NOT NULL,
    "kind" "AssetIncidentKind" NOT NULL,
    "quantity" INTEGER NOT NULL,
    "cost" INTEGER NOT NULL DEFAULT 0,
    "responsibility" "AssetResponsibility" NOT NULL DEFAULT 'UNKNOWN',
    "status" "AssetIncidentStatus" NOT NULL DEFAULT 'OPEN',
    "chargeId" TEXT,
    "note" TEXT,
    "settledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_asset_incidents_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_asset_incidents_amounts_check" CHECK ("quantity" > 0 AND "cost" >= 0)
);
CREATE UNIQUE INDEX "venue_asset_incidents_chargeId_key" ON "venue_asset_incidents"("chargeId");
CREATE INDEX "venue_asset_incidents_departmentId_status_idx" ON "venue_asset_incidents"("departmentId", "status");
CREATE INDEX "venue_asset_incidents_bookingId_idx" ON "venue_asset_incidents"("bookingId");

-- Cash counted in the drawer (discrepancies)
CREATE TABLE "venue_cash_counts" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "countedCash" INTEGER NOT NULL,
    "expectedCash" INTEGER NOT NULL,
    "variance" INTEGER NOT NULL,
    "notes" TEXT,
    "countedById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "venue_cash_counts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "venue_cash_counts_counted_check" CHECK ("countedCash" >= 0)
);
CREATE UNIQUE INDEX "venue_cash_counts_departmentId_date_key" ON "venue_cash_counts"("departmentId", "date");
CREATE INDEX "venue_cash_counts_organizationId_date_idx" ON "venue_cash_counts"("organizationId", "date");

-- Money records of a booking
ALTER TABLE "transactions" ADD COLUMN "receivedByName" TEXT;
ALTER TABLE "transactions" ADD COLUMN "bookingId" TEXT;
CREATE INDEX "transactions_bookingId_idx" ON "transactions"("bookingId");

-- Foreign keys
ALTER TABLE "venues" ADD CONSTRAINT "venues_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_price_rules" ADD CONSTRAINT "venue_price_rules_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_price_rules" ADD CONSTRAINT "venue_price_rules_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_clients" ADD CONSTRAINT "venue_clients_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_packages" ADD CONSTRAINT "venue_packages_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_package_items" ADD CONSTRAINT "venue_package_items_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "venue_packages"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_leads" ADD CONSTRAINT "venue_leads_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_leads" ADD CONSTRAINT "venue_leads_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "venue_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_leads" ADD CONSTRAINT "venue_leads_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "venues"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "venue_clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_packageId_fkey" FOREIGN KEY ("packageId") REFERENCES "venue_packages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_leadId_fkey" FOREIGN KEY ("leadId") REFERENCES "venue_leads"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_handledById_fkey" FOREIGN KEY ("handledById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_bookings" ADD CONSTRAINT "venue_bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_booking_charges" ADD CONSTRAINT "venue_booking_charges_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_booking_charges" ADD CONSTRAINT "venue_booking_charges_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "venue_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_assets" ADD CONSTRAINT "venue_assets_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_asset_checks" ADD CONSTRAINT "event_asset_checks_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_asset_checks" ADD CONSTRAINT "event_asset_checks_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "venue_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_asset_checks" ADD CONSTRAINT "event_asset_checks_checkedById_fkey" FOREIGN KEY ("checkedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "event_asset_check_lines" ADD CONSTRAINT "event_asset_check_lines_checkId_fkey" FOREIGN KEY ("checkId") REFERENCES "event_asset_checks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "event_asset_check_lines" ADD CONSTRAINT "event_asset_check_lines_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "venue_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_asset_incidents" ADD CONSTRAINT "venue_asset_incidents_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_asset_incidents" ADD CONSTRAINT "venue_asset_incidents_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "venue_bookings"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_asset_incidents" ADD CONSTRAINT "venue_asset_incidents_assetId_fkey" FOREIGN KEY ("assetId") REFERENCES "venue_assets"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "venue_asset_incidents" ADD CONSTRAINT "venue_asset_incidents_chargeId_fkey" FOREIGN KEY ("chargeId") REFERENCES "venue_booking_charges"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "venue_cash_counts" ADD CONSTRAINT "venue_cash_counts_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "venue_cash_counts" ADD CONSTRAINT "venue_cash_counts_countedById_fkey" FOREIGN KEY ("countedById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "transactions" ADD CONSTRAINT "transactions_bookingId_fkey" FOREIGN KEY ("bookingId") REFERENCES "venue_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
