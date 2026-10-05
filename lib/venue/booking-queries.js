/**
 * Reading venue bookings for pages: the calendar of a month, the list (filtered, paged), one
 * booking with everything about it, what needs attention. Money of bookings is summed by the
 * database (one grouped query), never row by row. Every query is scoped to the department.
 */
import { db } from "@/lib/prisma";
import { dbDate, dateKeyOf } from "./dates";
import { ACTIVE_STATUSES, bookingFigures, holdExpired } from "./booking-math";

export const LIST_PAGE_SIZE = 50;

const BOOKING_SELECT = {
  id: true,
  referenceNo: true,
  status: true,
  eventType: true,
  eventDate: true,
  startTime: true,
  endTime: true,
  guests: true,
  hallPrice: true,
  packagePrice: true,
  packageSnapshot: true,
  agreedPrice: true,
  priceNote: true,
  holdUntil: true,
  bookedAt: true,
  confirmedAt: true,
  completedAt: true,
  cancelledAt: true,
  cancelReason: true,
  notes: true,
  leadId: true,
  venueId: true,
  client: { select: { id: true, name: true, phone: true, phoneAlt: true, email: true, company: true } },
  handledBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

/** Money of bookings by id: { [bookingId]: { charges: [...], money: [...] } } in two grouped queries. */
export async function bookingMoney(bookingIds, client = db) {
  const out = Object.fromEntries(bookingIds.map((id) => [id, { charges: [], money: [] }]));
  if (!bookingIds.length) return out;
  const [money, charges] = await Promise.all([
    client.transaction.groupBy({
      by: ["bookingId", "type", "status"],
      where: { bookingId: { in: bookingIds }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } },
      _sum: { amount: true },
    }),
    client.venueBookingCharge.groupBy({
      by: ["bookingId"],
      where: { bookingId: { in: bookingIds }, voidedAt: null },
      _sum: { amount: true },
    }),
  ]);
  for (const m of money) out[m.bookingId].money.push({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) });
  for (const c of charges) out[c.bookingId].charges.push({ amount: Number(c._sum.amount || 0), voidedAt: null });
  return out;
}

/** A booking as pages show it: dates as keys, its money figures, whether its hold is over. */
function shape(b, money, todayKey) {
  const figures = bookingFigures({ agreedPrice: b.agreedPrice, status: b.status, ...money });
  return {
    ...b,
    eventDate: undefined,
    holdUntil: undefined,
    eventDateKey: dateKeyOf(b.eventDate),
    holdUntilKey: dateKeyOf(b.holdUntil),
    figures,
    holdExpired: holdExpired({ status: b.status, holdUntil: b.holdUntil, received: figures.received }, todayKey),
  };
}

async function shapeAll(rows, todayKey, client) {
  const money = await bookingMoney(rows.map((r) => r.id), client);
  return rows.map((r) => shape(r, money[r.id], todayKey));
}

/** Bookings whose event falls in [fromKey, toKey] (every status), by date. */
export async function bookingsBetween({ departmentId, fromKey, toKey, todayKey, client = db }) {
  const rows = await client.venueBooking.findMany({
    where: { departmentId, eventDate: { gte: dbDate(fromKey), lte: dbDate(toKey) } },
    select: BOOKING_SELECT,
    orderBy: [{ eventDate: "asc" }, { createdAt: "asc" }],
  });
  return shapeAll(rows, todayKey, client);
}

/**
 * The list of bookings: `status` (one or "ACTIVE"), event dates in [fromKey, toKey], `q` (client,
 * phone or reference), newest event first for the past and soonest first for upcoming. Paged.
 */
export async function listBookings({ departmentId, status, fromKey, toKey, q, page = 1, todayKey, upcoming = false, client = db }) {
  const where = { departmentId };
  if (status === "ACTIVE") where.status = { in: ["RESERVED", "CONFIRMED"] };
  else if (status) where.status = status;
  if (fromKey || toKey) where.eventDate = { ...(fromKey ? { gte: dbDate(fromKey) } : {}), ...(toKey ? { lte: dbDate(toKey) } : {}) };
  const term = String(q || "").trim();
  if (term) {
    where.OR = [
      { referenceNo: { contains: term, mode: "insensitive" } },
      { eventType: { contains: term, mode: "insensitive" } },
      { client: { name: { contains: term, mode: "insensitive" } } },
      { client: { phone: { contains: term } } },
    ];
  }
  const take = LIST_PAGE_SIZE;
  const skip = (Math.max(1, Number(page) || 1) - 1) * take;
  const [rows, total] = await Promise.all([
    client.venueBooking.findMany({ where, select: BOOKING_SELECT, orderBy: [{ eventDate: upcoming ? "asc" : "desc" }, { createdAt: "desc" }], take, skip }),
    client.venueBooking.count({ where }),
  ]);
  return { rows: await shapeAll(rows, todayKey, client), total, page: Math.floor(skip / take) + 1, pages: Math.max(1, Math.ceil(total / take)) };
}

/** One booking with its payments, charges, asset checks and history; null when not in the department. */
export async function bookingDetail({ departmentId, bookingId, todayKey, client = db }) {
  const b = await client.venueBooking.findFirst({ where: { id: bookingId, departmentId }, select: { ...BOOKING_SELECT, venue: { select: { id: true, name: true, capacity: true } } } });
  if (!b) return null;
  const [money, charges, audit] = await Promise.all([
    client.transaction.findMany({
      where: { bookingId: b.id },
      select: { id: true, type: true, amount: true, paymentMethod: true, reference: true, referenceNo: true, description: true, receivedByName: true, date: true, status: true, voidReason: true, category: true, user: { select: { name: true } }, createdAt: true },
      orderBy: { date: "asc" },
    }),
    client.venueBookingCharge.findMany({ where: { bookingId: b.id }, orderBy: { date: "asc" } }),
    client.auditEvent.findMany({ where: { entityType: "VenueBooking", entityId: b.id }, select: { id: true, action: true, afterJson: true, beforeJson: true, createdAt: true, userId: true }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  const [people, files] = await Promise.all([
    client.user.findMany({ where: { id: { in: [...new Set(audit.map((a) => a.userId).filter(Boolean))] } }, select: { id: true, name: true } }),
    money.length
      ? client.attachment.findMany({ where: { entityType: "Transaction", entityId: { in: money.map((t) => t.id) } }, select: { id: true, entityId: true, fileName: true, mimeType: true } })
      : [],
  ]);
  const nameOf = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const payments = money.filter((t) => t.type === "BOOKING_PAYMENT" || t.type === "BOOKING_REFUND");
  const shaped = shape(b, { money: payments.map((t) => ({ type: t.type, status: t.status, amount: Number(t.amount) })), charges }, todayKey);
  const proofs = (id) => files.filter((f) => f.entityId === id).map(({ entityId, ...f }) => f);
  return {
    ...shaped,
    transactions: money.map((t) => ({ ...t, amount: Number(t.amount), proofs: proofs(t.id) })),
    charges,
    history: audit.map((a) => ({ ...a, by: nameOf[a.userId] || null })),
  };
}

/** Reservations whose hold is over without money received (they still hold their date). */
export async function expiredHolds({ departmentId, todayKey, client = db }) {
  const rows = await client.venueBooking.findMany({
    where: { departmentId, status: "RESERVED", holdUntil: { lt: dbDate(todayKey) } },
    select: BOOKING_SELECT,
    orderBy: { holdUntil: "asc" },
    take: 50,
  });
  return (await shapeAll(rows, todayKey, client)).filter((b) => b.holdExpired);
}

/** The next active bookings from today. */
export async function upcomingBookings({ departmentId, todayKey, take = 8, client = db }) {
  const rows = await client.venueBooking.findMany({
    where: { departmentId, status: { in: ACTIVE_STATUSES.filter((s) => s !== "COMPLETED") }, eventDate: { gte: dbDate(todayKey) } },
    select: BOOKING_SELECT,
    orderBy: { eventDate: "asc" },
    take,
  });
  return shapeAll(rows, todayKey, client);
}

/** Clients of the department matching `q` (name or phone), for the booking form. */
export async function searchClients({ departmentId, q, take = 10, client = db }) {
  const term = String(q || "").trim();
  return client.venueClient.findMany({
    where: { departmentId, ...(term ? { OR: [{ name: { contains: term, mode: "insensitive" } }, { phone: { contains: term } }] } : {}) },
    select: { id: true, name: true, phone: true, email: true, company: true },
    orderBy: { updatedAt: "desc" },
    take,
  });
}

/** Dates taken by a booking that is not cancelled, from `fromKey` on (date pickers, free dates). */
export async function heldDates({ departmentId, fromKey, client = db }) {
  const rows = await client.venueBooking.findMany({
    where: { departmentId, status: { in: ACTIVE_STATUSES }, eventDate: { gte: dbDate(fromKey) } },
    select: { eventDate: true },
    orderBy: { eventDate: "asc" },
    take: 2000,
  });
  return rows.map((r) => dateKeyOf(r.eventDate));
}
