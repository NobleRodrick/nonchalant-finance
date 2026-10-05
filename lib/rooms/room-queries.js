/** Reading rooms and stays for pages (scoped to the rooms department). */
import { db } from "@/lib/prisma";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { addDaysToKey } from "@/lib/timezone";
import { bookingFigures } from "@/lib/finance/booking-money";
import { STAY_VIEWS, apartmentState, nightsOf, occupancyGrid, occupancyRate } from "./stay-math";

export async function roomsOf(departmentId, { includeInactive = false, client = db } = {}) {
  return client.room.findMany({ where: { departmentId, ...(includeInactive ? {} : { isActive: true }) }, orderBy: { name: "asc" } });
}

const STAY_SELECT = {
  id: true,
  referenceNo: true,
  roomId: true,
  guestName: true,
  guestPhone: true,
  guestEmail: true,
  guestCount: true,
  bookingType: true,
  priceNote: true,
  checkedInAt: true,
  checkedOutAt: true,
  cancelledAt: true,
  createdAt: true,
  checkIn: true,
  checkOut: true,
  status: true,
  nightlyRate: true,
  totalPrice: true,
  complimentary: true,
  notes: true,
  cancelReason: true,
  room: { select: { name: true } },
  sourceVenueBooking: { select: { id: true, referenceNo: true, departmentId: true, eventType: true, department: { select: { name: true } } } },
};

function shape(s) {
  const checkInKey = dateKeyOf(s.checkIn);
  const checkOutKey = dateKeyOf(s.checkOut);
  return { ...s, checkIn: undefined, checkOut: undefined, checkInKey, checkOutKey, nights: nightsOf(checkInKey, checkOutKey) };
}

/** Stays with a night in [fromKey, toKey] (every status). */
export async function staysBetween({ departmentId, fromKey, toKey, client = db }) {
  const rows = await client.roomBooking.findMany({
    where: { departmentId, checkIn: { lte: dbDate(toKey) }, checkOut: { gt: dbDate(fromKey) } },
    select: STAY_SELECT,
    orderBy: [{ checkIn: "asc" }],
  });
  return rows.map(shape);
}

/** Stays of a department, newest arrival first (paged by `take`). */
export async function listStays({ departmentId, status, take = 100, client = db }) {
  const rows = await client.roomBooking.findMany({ where: { departmentId, ...(status ? { status } : {}) }, select: STAY_SELECT, orderBy: { checkIn: "desc" }, take });
  return rows.map(shape);
}

/** Rooms given with a venue booking's package (stays naming it). */
export async function packageStays(venueBookingId, client = db) {
  const rows = await client.roomBooking.findMany({ where: { sourceVenueBookingId: venueBookingId }, select: { ...STAY_SELECT, department: { select: { id: true, name: true } } }, orderBy: { checkIn: "asc" } });
  return rows.map(shape);
}

/** Rooms departments of an organization with their active rooms (to allocate a package room). */
export async function roomsDepartments(organizationId, client = db) {
  return client.department.findMany({
    where: { organizationId, domain: "ROOM_RENTAL", isActive: true },
    select: { id: true, name: true, rooms: { where: { isActive: true }, select: { id: true, name: true, roomType: true }, orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
}

/**
 * Occupancy of a rooms department on `dateKey` and the 7 nights from it: rooms taken tonight,
 * arrivals, departures, complimentary (package) nights, occupancy rates (the Boss's overview).
 */
export async function roomsSummary({ departmentId, dateKey, client = db }) {
  const toKey = addDaysToKey(dateKey, 6);
  const [rooms, stays] = await Promise.all([roomsOf(departmentId, { client }), staysBetween({ departmentId, fromKey: addDaysToKey(dateKey, -1), toKey, client }) /* from the night before: today's departures */]);
  const tonight = occupancyGrid(rooms, stays, dateKey, dateKey);
  const week = occupancyGrid(rooms, stays, dateKey, toKey);
  const live = stays.filter((s) => s.status !== "CANCELLED");
  return {
    rooms: rooms.length,
    occupied: tonight.filter((r) => r.nights[0].stay).length,
    rateTonight: occupancyRate(tonight),
    rateWeek: occupancyRate(week),
    arrivals: live.filter((s) => s.checkInKey === dateKey).length,
    departures: live.filter((s) => s.checkOutKey === dateKey).length,
    complimentaryTonight: tonight.filter((r) => r.nights[0].stay?.complimentary).length,
  };
}

/** Money of stays by id: { [stayId]: [{ type, status, amount }] } in one grouped query. */
export async function stayMoney(stayIds, client = db) {
  const out = Object.fromEntries(stayIds.map((id) => [id, []]));
  if (!stayIds.length) return out;
  const rows = await client.transaction.groupBy({ by: ["stayId", "type", "status"], where: { stayId: { in: stayIds }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, _sum: { amount: true } });
  for (const m of rows) out[m.stayId].push({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) });
  return out;
}

/** Stays with their money figures (price, paid, balance, payment status). */
export async function withFigures(stays, client = db) {
  const money = await stayMoney(stays.map((s) => s.id), client);
  return stays.map((s) => ({ ...s, figures: bookingFigures({ agreedPrice: s.totalPrice, status: s.status, money: money[s.id] }) }));
}

/**
 * The bookings of a view (upcoming | current | completed | cancelled), searchable by guest,
 * phone or reference, with their money. Upcoming soonest first, the others latest first.
 */
export async function listStaysView({ departmentId, view = "upcoming", q, roomId, take = 100, client = db }) {
  const v = STAY_VIEWS[view] || STAY_VIEWS.upcoming;
  const term = String(q || "").trim();
  const rows = await client.roomBooking.findMany({
    where: {
      departmentId,
      status: { in: v.statuses },
      ...(roomId ? { roomId } : {}),
      ...(term ? { OR: [{ guestName: { contains: term, mode: "insensitive" } }, { guestPhone: { contains: term } }, { referenceNo: { contains: term, mode: "insensitive" } }] } : {}),
    },
    select: STAY_SELECT,
    orderBy: view === "upcoming" ? { checkIn: "asc" } : { checkIn: "desc" },
    take,
  });
  return withFigures(rows.map(shape), client);
}

/** How many bookings each view holds (the tabs). */
export async function stayViewCounts(departmentId, client = db) {
  const rows = await client.roomBooking.groupBy({ by: ["status"], where: { departmentId }, _count: { _all: true } });
  const of = (st) => rows.filter((r) => st.includes(r.status)).reduce((s, r) => s + r._count._all, 0);
  return Object.fromEntries(Object.entries(STAY_VIEWS).map(([k, v]) => [k, of(v.statuses)]));
}

/** One stay with its payments (and their proof) and history; null when not in the department. */
export async function stayDetail({ departmentId, stayId, client = db }) {
  const s = await client.roomBooking.findFirst({ where: { id: stayId || "-", departmentId }, select: { ...STAY_SELECT, createdBy: { select: { name: true } }, room: { select: { id: true, name: true, roomType: true } } } });
  if (!s) return null;
  const [money, audit] = await Promise.all([
    client.transaction.findMany({
      where: { stayId: s.id },
      select: { id: true, type: true, amount: true, paymentMethod: true, reference: true, referenceNo: true, description: true, receivedByName: true, date: true, status: true, voidReason: true, user: { select: { name: true } } },
      orderBy: { date: "asc" },
    }),
    client.auditEvent.findMany({ where: { entityType: "RoomBooking", entityId: s.id }, select: { id: true, action: true, afterJson: true, beforeJson: true, createdAt: true, userId: true }, orderBy: { createdAt: "asc" }, take: 100 }),
  ]);
  const [people, files] = await Promise.all([
    client.user.findMany({ where: { id: { in: [...new Set(audit.map((a) => a.userId).filter(Boolean))] } }, select: { id: true, name: true } }),
    money.length ? client.attachment.findMany({ where: { entityType: "Transaction", entityId: { in: money.map((t) => t.id) } }, select: { id: true, entityId: true, fileName: true, mimeType: true } }) : [],
  ]);
  const nameOf = Object.fromEntries(people.map((p) => [p.id, p.name]));
  const transactions = money.map((t) => ({ ...t, amount: Number(t.amount), proofs: files.filter((f) => f.entityId === t.id).map(({ entityId, ...f }) => f) }));
  return {
    ...shape(s),
    figures: bookingFigures({ agreedPrice: s.totalPrice, status: s.status, money: transactions }),
    transactions,
    history: audit.map((a) => ({ ...a, by: nameOf[a.userId] || null })),
  };
}

/**
 * What a receipt of a stay payment states: the stay, this payment, what was paid up to and
 * including it and the balance after it. Pure over stayDetail.
 */
export function stayReceiptOf(stay, transactionId) {
  const t = stay.transactions.find((x) => x.id === transactionId && ["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(x.type));
  if (!t) return null;
  const at = new Date(t.date).getTime();
  const upTo = stay.transactions.filter((x) => new Date(x.date).getTime() <= at && (x.id === t.id || x.status === "COMPLETED"));
  const figures = bookingFigures({ agreedPrice: stay.totalPrice, status: stay.status === "CANCELLED" && new Date(stay.cancelledAt).getTime() <= at ? "CANCELLED" : "CONFIRMED", money: upTo.map((x) => ({ type: x.type, amount: x.amount, status: x.id === t.id ? "COMPLETED" : x.status })) });
  return { transaction: t, figures, isRefund: t.type === "BOOKING_REFUND", voided: t.status === "VOIDED" };
}

/**
 * The apartments as their cards show them: state on `todayKey` (lib/rooms/stay-math →
 * apartmentState), the guest in it and the next booking.
 */
export async function apartmentsNow({ departmentId, todayKey, includeInactive = true, client = db }) {
  const [rooms, rows] = await Promise.all([
    roomsOf(departmentId, { includeInactive, client }),
    client.roomBooking.findMany({ where: { departmentId, status: { in: ["RESERVED", "CONFIRMED", "CHECKED_IN"] }, checkOut: { gt: dbDate(addDaysToKey(todayKey, -60)) } }, select: STAY_SELECT, orderBy: { checkIn: "asc" } }),
  ]);
  const stays = rows.map(shape);
  return rooms.map((room) => {
    const mine = stays.filter((s) => s.roomId === room.id);
    return {
      ...room,
      displayState: apartmentState(room, mine, todayKey),
      current: mine.find((s) => s.status === "CHECKED_IN") || null,
      next: mine.find((s) => s.status !== "CHECKED_IN" && s.checkOutKey > todayKey) || null,
    };
  });
}

/** Every booking of one apartment (newest first) with its money: the apartment's full history. */
export async function roomHistory({ departmentId, roomId, take = 300, client = db }) {
  const rows = await client.roomBooking.findMany({ where: { departmentId, roomId }, select: STAY_SELECT, orderBy: { checkIn: "desc" }, take });
  return withFigures(rows.map(shape), client);
}
