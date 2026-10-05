-- Rooms / guest house department type (e.g. Executive Stay): rooms and stays. Additive only.
CREATE TYPE "RoomBookingStatus" AS ENUM ('RESERVED', 'CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT', 'CANCELLED');

CREATE TABLE "rooms" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "roomType" TEXT,
    "capacity" INTEGER,
    "nightlyRate" INTEGER NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "rooms_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "rooms_amounts_check" CHECK ("nightlyRate" >= 0 AND ("capacity" IS NULL OR "capacity" > 0))
);
CREATE UNIQUE INDEX "rooms_departmentId_name_key" ON "rooms"("departmentId", "name");
CREATE INDEX "rooms_organizationId_idx" ON "rooms"("organizationId");

CREATE TABLE "room_bookings" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "departmentId" TEXT NOT NULL,
    "roomId" TEXT NOT NULL,
    "referenceNo" TEXT NOT NULL,
    "guestName" TEXT NOT NULL,
    "guestPhone" TEXT,
    "checkIn" DATE NOT NULL,
    "checkOut" DATE NOT NULL,
    "status" "RoomBookingStatus" NOT NULL DEFAULT 'CONFIRMED',
    "nightlyRate" INTEGER NOT NULL DEFAULT 0,
    "totalPrice" INTEGER NOT NULL DEFAULT 0,
    "complimentary" BOOLEAN NOT NULL DEFAULT false,
    "sourceVenueBookingId" TEXT,
    "notes" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "cancelReason" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "room_bookings_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "room_bookings_dates_check" CHECK ("checkOut" > "checkIn"),
    CONSTRAINT "room_bookings_amounts_check" CHECK ("nightlyRate" >= 0 AND "totalPrice" >= 0)
);
CREATE UNIQUE INDEX "room_bookings_departmentId_referenceNo_key" ON "room_bookings"("departmentId", "referenceNo");
CREATE INDEX "room_bookings_roomId_checkIn_idx" ON "room_bookings"("roomId", "checkIn");
CREATE INDEX "room_bookings_departmentId_checkIn_idx" ON "room_bookings"("departmentId", "checkIn");
CREATE INDEX "room_bookings_sourceVenueBookingId_idx" ON "room_bookings"("sourceVenueBookingId");

ALTER TABLE "rooms" ADD CONSTRAINT "rooms_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_departmentId_fkey" FOREIGN KEY ("departmentId") REFERENCES "departments"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_roomId_fkey" FOREIGN KEY ("roomId") REFERENCES "rooms"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_sourceVenueBookingId_fkey" FOREIGN KEY ("sourceVenueBookingId") REFERENCES "venue_bookings"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "room_bookings" ADD CONSTRAINT "room_bookings_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
