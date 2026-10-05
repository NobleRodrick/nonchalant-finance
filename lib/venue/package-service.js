/**
 * Venue packages (the hall with extra benefits, e.g. a free room at Executive Stay) and the rooms
 * they give: created, changed, offered or withdrawn by the venue's head; a booking keeps a copy
 * of its package as sold. A package room becomes a real stay of a specific room in a rooms
 * department of the organization, so it shows as occupied there.
 */
import { recordAudit } from "@/lib/audit";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { departmentHeadIds, notifyUsers } from "@/lib/notifications";
import { addDaysToKey } from "@/lib/timezone";
import { cancelStay, createStay } from "@/lib/rooms/room-service";
import { dateKeyOf } from "./dates";

const KINDS = ["ROOM", "SERVICE", "OTHER"];
const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function packageFields(input) {
  const name = text(input?.name, 80);
  if (!name || name.length < 2) throw invalid("Name the package.");
  const price = Number(input.price);
  if (!Number.isInteger(price) || price < 0) throw invalid("The package price must be a whole number of francs (0 or more): it is added to the hall's price.");
  const items = (Array.isArray(input.items) ? input.items : [])
    .filter((i) => text(i?.label))
    .map((i, n) => {
      const kind = KINDS.includes(i.kind) ? i.kind : "OTHER";
      const quantity = Number(i.quantity ?? 1);
      if (!Number.isInteger(quantity) || quantity < 1 || quantity > 100) throw invalid(`"${i.label}": the quantity must be a whole number from 1.`);
      const nights = kind === "ROOM" ? Number(i.nights ?? 1) : null;
      if (kind === "ROOM" && (!Number.isInteger(nights) || nights < 1 || nights > 30)) throw invalid(`"${i.label}": say how many nights (1 to 30).`);
      return { kind, label: text(i.label, 120), quantity, nights, sortOrder: n };
    });
  return { name, description: text(input.description, 1000), price, items };
}

/** Creates a package or changes one (its items are replaced; bookings keep their copy). */
export async function savePackage(tx, { user, department }, input) {
  const { items, ...data } = packageFields(input);
  if (input.id) {
    const existing = await tx.venuePackage.findFirst({ where: { id: input.id, departmentId: department.id }, include: { items: true } });
    if (!existing) throw notFound("Package not found.");
    await tx.venuePackageItem.deleteMany({ where: { packageId: existing.id } });
    await tx.venuePackage.update({ where: { id: existing.id }, data: { ...data, items: { create: items } } });
    await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_PACKAGE_UPDATED", entityType: "VenuePackage", entityId: existing.id, before: { name: existing.name, price: existing.price, items: existing.items.map((i) => i.label) }, after: { ...data, items: items.map((i) => i.label) } });
    return { packageId: existing.id };
  }
  const pkg = await tx.venuePackage.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id, items: { create: items } } });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_PACKAGE_CREATED", entityType: "VenuePackage", entityId: pkg.id, after: { ...data, items: items.map((i) => i.label) } });
  return { packageId: pkg.id };
}

/** Offers a package again, or stops offering it (bookings already made keep it). */
export async function setPackageActive(tx, { user, department }, input) {
  const pkg = await tx.venuePackage.findFirst({ where: { id: input?.packageId || "-", departmentId: department.id } });
  if (!pkg) throw notFound("Package not found.");
  const isActive = Boolean(input.active);
  await tx.venuePackage.update({ where: { id: pkg.id }, data: { isActive, archivedAt: null } });
  await recordAudit(tx, { user, departmentId: department.id, action: isActive ? "VENUE_PACKAGE_ACTIVATED" : "VENUE_PACKAGE_DEACTIVATED", entityType: "VenuePackage", entityId: pkg.id });
  return { packageId: pkg.id, isActive };
}

/** Removes a package from the lists (kept for the bookings that used it). */
export async function removePackage(tx, { user, department }, input) {
  const pkg = await tx.venuePackage.findFirst({ where: { id: input?.packageId || "-", departmentId: department.id } });
  if (!pkg) throw notFound("Package not found.");
  await tx.venuePackage.update({ where: { id: pkg.id }, data: { isActive: false, archivedAt: new Date() } });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_PACKAGE_REMOVED", entityType: "VenuePackage", entityId: pkg.id });
  return { packageId: pkg.id };
}

/** Rooms a booking's package gives (Σ quantity of its ROOM items) and the default nights. */
export function packageRooms(snapshot) {
  const rooms = (snapshot?.items || []).filter((i) => i.kind === "ROOM");
  return { count: rooms.reduce((s, i) => s + (Number(i.quantity) || 0), 0), nights: Math.max(1, ...rooms.map((i) => Number(i.nights) || 1)) };
}

/**
 * Gives one room of a booking's package: a complimentary stay of a specific room of a rooms
 * department of the organization (the night of the event by default). Its heads are notified.
 */
export async function allocatePackageRoom(tx, ctx, input) {
  const { user, department } = ctx;
  const booking = await tx.venueBooking.findFirst({ where: { id: input?.bookingId || "-", departmentId: department.id }, include: { client: { select: { name: true, phone: true } } } });
  if (!booking) throw notFound("Booking not found.");
  if (!["RESERVED", "CONFIRMED"].includes(booking.status)) throw invalid(`Booking ${booking.referenceNo} is ${booking.status.toLowerCase()}: its rooms cannot change.`);
  const { count, nights } = packageRooms(booking.packageSnapshot);
  if (!count) throw invalid(`The package of ${booking.referenceNo} gives no room.`);
  const given = await tx.roomBooking.count({ where: { sourceVenueBookingId: booking.id, status: { not: "CANCELLED" } } });
  if (given >= count) throw invalid(`The package gives ${count} room(s): all are allocated.`);
  const rooms = await tx.department.findFirst({ where: { id: input.roomsDepartmentId || "-", organizationId: user.organizationId, domain: "ROOM_RENTAL", isActive: true } });
  if (!rooms) throw forbidden("Choose a rooms department of your business (e.g. Executive Stay).");
  const checkInKey = input.checkInKey || dateKeyOf(booking.eventDate);
  const checkOutKey = input.checkOutKey || addDaysToKey(checkInKey, nights);
  const stay = await createStay(
    tx,
    { ...ctx, department: rooms },
    { roomId: input.roomId, checkInKey, checkOutKey, guestName: input.guestName || booking.client.name, guestPhone: input.guestPhone || booking.client.phone, notes: `Free with ${booking.referenceNo} (${booking.packageSnapshot?.name}) of ${department.name}`, allowPast: true },
    { sourceVenueBookingId: booking.id, complimentary: true }
  );
  await notifyUsers(tx, {
    organizationId: user.organizationId,
    userIds: await departmentHeadIds(tx, rooms.id),
    departmentId: rooms.id,
    kind: "ROOM_ALLOCATED",
    title: `Room ${stay.roomName} given with ${department.name}'s booking ${booking.referenceNo}`,
    body: `${input.guestName || booking.client.name}: ${checkInKey} → ${checkOutKey} (free, package ${booking.packageSnapshot?.name}).`,
    href: `/d/${rooms.id}/stays`,
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_ROOM_ALLOCATED", entityType: "VenueBooking", entityId: booking.id, after: { stay: stay.referenceNo, room: stay.roomName, department: rooms.name, checkInKey, checkOutKey } });
  return { ...stay, bookingId: booking.id };
}

/** Gives back a package room (cancels its stay). */
export async function releasePackageRoom(tx, ctx, input) {
  const stay = await tx.roomBooking.findFirst({ where: { id: input?.stayId || "-", sourceVenueBooking: { departmentId: ctx.department.id } } });
  if (!stay) throw notFound("Room not found for this venue.");
  return cancelStay(tx, ctx, { stay, reason: input.reason || "Package room released" });
}

/** Cancels the package rooms of a booking that is cancelled. */
export async function releaseBookingRooms(tx, ctx, booking) {
  const stays = await tx.roomBooking.findMany({ where: { sourceVenueBookingId: booking.id, status: { in: ["RESERVED", "CONFIRMED"] } } });
  for (const stay of stays) await cancelStay(tx, ctx, { stay, reason: `Booking ${booking.referenceNo} cancelled` });
  return stays.length;
}
