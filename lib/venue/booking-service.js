/**
 * Changes to venue clients and bookings, run by the operations (lib/operations/venue.js) inside
 * their database transaction. Rules:
 *   - one event per date and hall: the date is locked while it is checked, and the database's
 *     unique index refuses a second active booking even at the same instant;
 *   - the price of the date comes from the hall's prices; the agreed price may differ (a lower
 *     one needs a reason), the package is copied as sold;
 *   - a reservation holds the date until its hold date unless money is received; it is never
 *     released silently;
 *   - completed and cancelled bookings no longer change; every change is audited.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { addDaysToKey, isDateKey, toDateKey } from "@/lib/timezone";
import { dbDate, dateKeyOf } from "./dates";
import { priceForDate } from "./pricing";
import { ruleView } from "./hall-service";
import { ACTIVE_STATUSES, allowedTransitions } from "./booking-math";
import { releaseBookingRooms } from "./package-service";
import { formatMoney } from "@/lib/format";

const text = (v, max = 500) => String(v ?? "").trim().slice(0, max) || null;

function wholeOrNull(value, label, { min = 0, max = 1e10 } = {}) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number${min > 0 ? ` of at least ${min}` : " (0 or more)"}.`);
  return n;
}

function timeOrNull(value, label) {
  const v = text(value, 5);
  if (!v) return null;
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw invalid(`${label} must be a time like 14:00.`);
  return v;
}

/** The business day of the operation (the device's day for a record made offline). */
function dayOf(ctx) {
  return toDateKey(ctx.date || ctx.now || new Date(), ctx.timeZone);
}

async function hallFor(tx, department, venueId) {
  const venue = await tx.venue.findFirst({
    where: { departmentId: department.id, isActive: true, ...(venueId ? { id: venueId } : {}) },
    orderBy: { createdAt: "asc" },
    include: { priceRules: true },
  });
  if (!venue) throw invalid("Set up the hall first (Hall & prices).");
  return venue;
}

/** Locks a date of a hall for this transaction and refuses it when an active booking holds it. */
async function claimDate(tx, { venueId, dateKey, exceptId = null }) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`venue-date:${venueId}:${dateKey}`}))`;
  const taken = await tx.venueBooking.findFirst({
    where: { venueId, eventDate: dbDate(dateKey), status: { in: ACTIVE_STATUSES }, ...(exceptId ? { id: { not: exceptId } } : {}) },
    select: { referenceNo: true, eventType: true, client: { select: { name: true } } },
  });
  if (taken) throw conflict(`${dateKey} is already booked: ${taken.referenceNo}, ${taken.eventType} for ${taken.client.name}. Choose another date.`);
}

/** A database refusal of a second booking on a date (the partial unique index). */
function isDateTaken(error) {
  return error?.code === "P2002" || /venue_bookings_one_event_per_date/.test(String(error?.message || ""));
}

// ─── Clients ─────────────────────────────────────────────────────────────────

function clientFields(input) {
  const name = text(input?.name, 120);
  if (!name || name.length < 2) throw invalid("Enter the client's name.");
  const email = text(input.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("The e-mail address does not look right.");
  return { name, phone: text(input.phone, 40), phoneAlt: text(input.phoneAlt, 40), email, company: text(input.company, 120), notes: text(input.notes, 1000) };
}

/**
 * The client of a booking: an existing one (`clientId`), or a new one (`client`). A new client
 * with the name and phone of an existing one is that client.
 */
export async function resolveClient(tx, { user, department }, { clientId, client }) {
  if (clientId) {
    const found = await tx.venueClient.findFirst({ where: { id: clientId, departmentId: department.id } });
    if (!found) throw notFound("Client not found in this department.");
    return found;
  }
  const data = clientFields(client);
  if (data.phone) {
    const same = await tx.venueClient.findFirst({ where: { departmentId: department.id, phone: data.phone, name: { equals: data.name, mode: "insensitive" } } });
    if (same) return same;
  }
  const created = await tx.venueClient.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_CLIENT_CREATED", entityType: "VenueClient", entityId: created.id, after: data });
  return created;
}

/** Adds a client, or changes one's details. */
export async function saveClient(tx, ctx, input) {
  if (!input?.id) {
    const c = await resolveClient(tx, ctx, { client: input });
    return { clientId: c.id, name: c.name };
  }
  const existing = await tx.venueClient.findFirst({ where: { id: input.id, departmentId: ctx.department.id } });
  if (!existing) throw notFound("Client not found in this department.");
  const data = clientFields(input);
  const c = await tx.venueClient.update({ where: { id: existing.id }, data });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "VENUE_CLIENT_UPDATED", entityType: "VenueClient", entityId: c.id, before: clientFields(existing), after: data });
  return { clientId: c.id, name: c.name };
}

// ─── Bookings ────────────────────────────────────────────────────────────────

async function packageFor(tx, department, packageId) {
  if (!packageId) return null;
  const pkg = await tx.venuePackage.findFirst({ where: { id: packageId, departmentId: department.id }, include: { items: { orderBy: { sortOrder: "asc" } } } });
  if (!pkg) throw notFound("Package not found.");
  if (!pkg.isActive || pkg.archivedAt) throw invalid(`The package "${pkg.name}" is not offered any more.`);
  return { id: pkg.id, price: pkg.price, snapshot: { name: pkg.name, price: pkg.price, description: pkg.description, items: pkg.items.map((i) => ({ kind: i.kind, label: i.label, quantity: i.quantity, nights: i.nights })) } };
}

/** The agreed price (default: the date's price + the package) and its note. */
function agreedPriceOf(input, suggested) {
  const agreed = wholeOrNull(input.agreedPrice, "The agreed price") ?? suggested;
  const note = text(input.priceNote, 300);
  if (agreed < suggested && !note) throw invalid(`The agreed price is below the price of the date (${formatMoney(suggested)}): say why (e.g. negotiated discount).`);
  return { agreedPrice: agreed, priceNote: note };
}

async function handlerFor(tx, department, handledById, fallback) {
  const id = handledById || fallback;
  if (!id) return null;
  const member = await tx.userDepartment.findFirst({ where: { userId: id, departmentId: department.id, isActive: true }, select: { userId: true } });
  if (!member) throw invalid("The person handling the booking must be a head of this department.");
  return member.userId;
}

function bookingView(b) {
  return {
    id: b.id,
    referenceNo: b.referenceNo,
    status: b.status,
    eventDateKey: dateKeyOf(b.eventDate),
    eventType: b.eventType,
    agreedPrice: b.agreedPrice,
    holdUntilKey: dateKeyOf(b.holdUntil),
  };
}

/**
 * Books a date: Reserved (held until the hold date) or Confirmed. Returns the booking and the
 * client (ids a later record made offline may refer to).
 */
export async function createBooking(tx, ctx, input) {
  const { user, department } = ctx;
  const todayKey = dayOf(ctx);
  const dateKey = input?.eventDateKey;
  if (!isDateKey(dateKey)) throw invalid("Choose the date of the event.");
  if (dateKey < todayKey) throw invalid("The date of the event has passed: choose today or a later date.");
  const eventType = text(input.eventType, 80);
  if (!eventType) throw invalid("Choose the type of event (wedding, birthday, conference …).");
  const status = input.status === "CONFIRMED" ? "CONFIRMED" : "RESERVED";

  const venue = await hallFor(tx, department, input.venueId);
  if (input.leadId) {
    const lead = await tx.venueLead.findFirst({ where: { id: input.leadId, departmentId: department.id }, select: { status: true, booking: { select: { referenceNo: true } } } });
    if (!lead) throw notFound("Lead not found.");
    if (lead.booking) throw conflict(`This lead is already booked (${lead.booking.referenceNo}).`);
  }
  await claimDate(tx, { venueId: venue.id, dateKey });
  const client = await resolveClient(tx, ctx, { clientId: input.clientId, client: input.client });
  const pkg = await packageFor(tx, department, input.packageId);
  const hallPrice = priceForDate(dateKey, { basePrice: venue.basePrice, rules: venue.priceRules.map(ruleView) }).price;
  const suggested = hallPrice + (pkg?.price || 0);
  const { agreedPrice, priceNote } = agreedPriceOf(input, suggested);
  const holdKey = status === "RESERVED" ? [addDaysToKey(todayKey, venue.reservationHoldDays), dateKey].sort()[0] : null;

  let booking;
  try {
    booking = await tx.venueBooking.create({
      data: {
        organizationId: user.organizationId,
        departmentId: department.id,
        venueId: venue.id,
        clientId: client.id,
        referenceNo: await nextReference(tx, department.id, DOC_TYPES.BOOKING),
        eventType,
        eventDate: dbDate(dateKey),
        startTime: timeOrNull(input.startTime, "The start time"),
        endTime: timeOrNull(input.endTime, "The end time"),
        guests: wholeOrNull(input.guests, "The number of guests"),
        status,
        hallPrice,
        packageId: pkg?.id || null,
        packageSnapshot: pkg?.snapshot || undefined,
        packagePrice: pkg?.price || 0,
        agreedPrice,
        priceNote,
        holdUntil: dbDate(holdKey),
        bookedAt: ctx.date || ctx.now,
        confirmedAt: status === "CONFIRMED" ? ctx.now : null,
        notes: text(input.notes, 2000),
        leadId: input.leadId || null,
        handledById: await handlerFor(tx, department, input.handledById, user.role === "ADMIN" ? null : user.id),
        createdById: user.id,
      },
    });
  } catch (error) {
    if (isDateTaken(error)) throw conflict(`${dateKey} has just been booked by someone else. Choose another date.`);
    throw error;
  }
  if (input.leadId) {
    const lead = await tx.venueLead.findFirst({ where: { id: input.leadId, departmentId: department.id } });
    if (!lead) throw notFound("Lead not found.");
    await tx.venueLead.update({ where: { id: lead.id }, data: { status: "BOOKED", closedAt: ctx.now, closedReason: null } });
  }
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_BOOKING_CREATED", entityType: "VenueBooking", entityId: booking.id, after: { ...bookingView(booking), client: client.name, suggested } });
  return { bookingId: booking.id, referenceNo: booking.referenceNo, clientId: client.id, status: booking.status, eventDateKey: dateKey, agreedPrice, holdUntilKey: holdKey };
}

/** The booking of this department, or an error. */
async function bookingOf(tx, department, bookingId) {
  const b = await tx.venueBooking.findFirst({ where: { id: bookingId || "-", departmentId: department.id } });
  if (!b) throw notFound("Booking not found.");
  return b;
}

function refuse(booking, action) {
  const label = booking.status.toLowerCase();
  throw invalid(`Booking ${booking.referenceNo} is ${label}: it cannot be ${action}.`);
}

/** Changes the details of a booking (not its date: see moveBooking). */
export async function updateBooking(tx, ctx, input) {
  const { user, department } = ctx;
  const b = await bookingOf(tx, department, input?.bookingId);
  if (!allowedTransitions(b, dayOf(ctx)).edit) refuse(b, "changed");
  const data = {};
  if (input.eventType !== undefined) {
    data.eventType = text(input.eventType, 80);
    if (!data.eventType) throw invalid("Choose the type of event.");
  }
  if (input.guests !== undefined) data.guests = wholeOrNull(input.guests, "The number of guests");
  if (input.startTime !== undefined) data.startTime = timeOrNull(input.startTime, "The start time");
  if (input.endTime !== undefined) data.endTime = timeOrNull(input.endTime, "The end time");
  if (input.notes !== undefined) data.notes = text(input.notes, 2000);
  if (input.handledById !== undefined) data.handledById = await handlerFor(tx, department, input.handledById, null);
  if (input.agreedPrice !== undefined) Object.assign(data, agreedPriceOf(input, b.hallPrice + b.packagePrice));
  const updated = await tx.venueBooking.update({ where: { id: b.id }, data });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_BOOKING_UPDATED", entityType: "VenueBooking", entityId: b.id, before: Object.fromEntries(Object.keys(data).map((k) => [k, b[k]])), after: data });
  return { bookingId: updated.id, referenceNo: updated.referenceNo };
}

/** Moves a booking to another free date (the agreed price stays unless changed). */
export async function moveBooking(tx, ctx, input) {
  const { user, department } = ctx;
  const b = await bookingOf(tx, department, input?.bookingId);
  const todayKey = dayOf(ctx);
  if (!allowedTransitions(b, todayKey).move) refuse(b, "moved");
  const dateKey = input.eventDateKey;
  if (!isDateKey(dateKey)) throw invalid("Choose the new date.");
  if (dateKey < todayKey) throw invalid("The new date has passed: choose today or a later date.");
  const from = dateKeyOf(b.eventDate);
  if (dateKey === from) throw invalid("The booking is already on that date.");
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the event moves (e.g. the client asked).");
  const venue = await hallFor(tx, department, b.venueId);
  await claimDate(tx, { venueId: venue.id, dateKey, exceptId: b.id });
  const hallPrice = priceForDate(dateKey, { basePrice: venue.basePrice, rules: venue.priceRules.map(ruleView) }).price;
  const data = { eventDate: dbDate(dateKey), hallPrice };
  if (b.holdUntil && dateKeyOf(b.holdUntil) > dateKey) data.holdUntil = dbDate(dateKey);
  if (input.agreedPrice !== undefined && input.agreedPrice !== "") Object.assign(data, agreedPriceOf(input, hallPrice + b.packagePrice));
  let updated;
  try {
    updated = await tx.venueBooking.update({ where: { id: b.id }, data });
  } catch (error) {
    if (isDateTaken(error)) throw conflict(`${dateKey} has just been booked by someone else. Choose another date.`);
    throw error;
  }
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_BOOKING_MOVED", entityType: "VenueBooking", entityId: b.id, before: { eventDate: from, hallPrice: b.hallPrice, agreedPrice: b.agreedPrice }, after: { eventDate: dateKey, hallPrice, agreedPrice: updated.agreedPrice, reason } });
  return { bookingId: b.id, referenceNo: b.referenceNo, eventDateKey: dateKey };
}

/** Reserved → Confirmed (the hold no longer applies). */
export async function confirmBooking(tx, ctx, input) {
  const b = await bookingOf(tx, ctx.department, input?.bookingId);
  if (!allowedTransitions(b, dayOf(ctx)).confirm) refuse(b, "confirmed");
  const updated = await tx.venueBooking.update({ where: { id: b.id }, data: { status: "CONFIRMED", confirmedAt: ctx.now, holdUntil: null } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "VENUE_BOOKING_CONFIRMED", entityType: "VenueBooking", entityId: b.id, before: { status: b.status }, after: { status: updated.status } });
  return { bookingId: b.id, referenceNo: b.referenceNo, status: updated.status };
}

/** The event took place (on or after its date): its price is revenue of the event date. */
export async function completeBooking(tx, ctx, input) {
  const b = await bookingOf(tx, ctx.department, input?.bookingId);
  const todayKey = dayOf(ctx);
  const t = allowedTransitions(b, todayKey);
  if (!t.complete) {
    if (["RESERVED", "CONFIRMED"].includes(b.status)) throw invalid(`The event of ${b.referenceNo} is on ${dateKeyOf(b.eventDate)}: it can be marked as completed from that day.`);
    refuse(b, "completed");
  }
  const updated = await tx.venueBooking.update({ where: { id: b.id }, data: { status: "COMPLETED", completedAt: ctx.now, holdUntil: null, confirmedAt: b.confirmedAt || ctx.now } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "VENUE_BOOKING_COMPLETED", entityType: "VenueBooking", entityId: b.id, before: { status: b.status }, after: { status: updated.status } });
  return { bookingId: b.id, referenceNo: b.referenceNo, status: updated.status };
}

/**
 * Cancels a booking (frees its date). Money already received stays recorded: give it back with a
 * refund, or keep it (it is then the cancellation's income).
 */
export async function cancelBooking(tx, ctx, input) {
  const b = await bookingOf(tx, ctx.department, input?.bookingId);
  if (!allowedTransitions(b, dayOf(ctx)).cancel) refuse(b, "cancelled");
  const reason = text(input.reason, 500);
  if (!reason) throw invalid("Say why the booking is cancelled.");
  const updated = await tx.venueBooking.update({ where: { id: b.id }, data: { status: "CANCELLED", cancelledAt: ctx.now, cancelReason: reason, holdUntil: null } });
  if (b.leadId) await tx.venueLead.update({ where: { id: b.leadId }, data: { status: "CANCELLED", closedReason: `Booking ${b.referenceNo} cancelled: ${reason}`, closedAt: ctx.now } });
  // Rooms given with its package are free again in their rooms department.
  await releaseBookingRooms(tx, ctx, b);
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "VENUE_BOOKING_CANCELLED", entityType: "VenueBooking", entityId: b.id, before: { status: b.status }, after: { status: updated.status, reason } });
  return { bookingId: b.id, referenceNo: b.referenceNo, status: updated.status };
}

/** Holds a reservation longer (a new hold date, not after the event). */
export async function extendHold(tx, ctx, input) {
  const b = await bookingOf(tx, ctx.department, input?.bookingId);
  const todayKey = dayOf(ctx);
  if (!allowedTransitions(b, todayKey).extendHold) refuse(b, "held longer");
  const until = input.holdUntilKey;
  if (!isDateKey(until) || until < todayKey) throw invalid("Choose the new hold date (today or later).");
  const eventKey = dateKeyOf(b.eventDate);
  if (until > eventKey) throw invalid("A reservation cannot be held after the event's date.");
  await tx.venueBooking.update({ where: { id: b.id }, data: { holdUntil: dbDate(until) } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "VENUE_BOOKING_HOLD_EXTENDED", entityType: "VenueBooking", entityId: b.id, before: { holdUntil: dateKeyOf(b.holdUntil) }, after: { holdUntil: until } });
  return { bookingId: b.id, referenceNo: b.referenceNo, holdUntilKey: until };
}
