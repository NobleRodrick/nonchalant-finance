/**
 * Reading event rental bookings for pages: the list (filtered), one booking with everything about
 * it, the calendar of a month, a day's agenda, availability of items, customers. Money of bookings
 * is summed by the database in grouped queries. Every query is scoped to the department.
 */
import { db } from "@/lib/prisma";
import { bookingFigures } from "@/lib/finance/booking-money";
import { attachmentUrl } from "@/lib/attachments";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { monthGrid } from "@/lib/venue/calendar";
import { HOLDING_STATUSES, OPEN_STATUSES, availability, orderStage } from "./booking-math";

const ORDER_SELECT = {
  id: true,
  referenceNo: true,
  status: true,
  eventType: true,
  eventDate: true,
  eventLocation: true,
  dispatchDate: true,
  returnDate: true,
  guests: true,
  itemsTotal: true,
  servicesTotal: true,
  discount: true,
  agreedPrice: true,
  priceNote: true,
  depositDue: true,
  paymentDueDate: true,
  specialInstructions: true,
  notes: true,
  staffNames: true,
  createdAt: true,
  quotedAt: true,
  confirmedAt: true,
  preparingAt: true,
  dispatchedAt: true,
  returnedAt: true,
  closedAt: true,
  cancelledAt: true,
  cancelReason: true,
  client: { select: { id: true, name: true, phone: true, email: true, address: true, company: true } },
  handledBy: { select: { id: true, name: true } },
  createdBy: { select: { id: true, name: true } },
};

/** Money of bookings by id: { [orderId]: { charges, money } } in two grouped queries. */
export async function orderMoney(orderIds, client = db) {
  const out = Object.fromEntries(orderIds.map((id) => [id, { charges: [], money: [] }]));
  if (!orderIds.length) return out;
  const [money, charges] = await Promise.all([
    client.transaction.groupBy({ by: ["rentalOrderId", "type", "status"], where: { rentalOrderId: { in: orderIds }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, _sum: { amount: true } }),
    client.rentalCharge.groupBy({ by: ["orderId"], where: { orderId: { in: orderIds }, voidedAt: null }, _sum: { amount: true } }),
  ]);
  for (const m of money) out[m.rentalOrderId].money.push({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) });
  for (const c of charges) out[c.orderId].charges.push({ amount: Number(c._sum.amount || 0), voidedAt: null });
  return out;
}

/** A booking row for pages: keys of its dates, its money, its stage. */
export function shapeOrder(o, money, todayKey) {
  const eventDateKey = dateKeyOf(o.eventDate);
  const figures = bookingFigures({ agreedPrice: o.agreedPrice, status: o.status, charges: money?.charges || [], money: money?.money || [] });
  const paymentDueDateKey = dateKeyOf(o.paymentDueDate);
  const dueKey = paymentDueDateKey || eventDateKey;
  return {
    ...o,
    eventDateKey,
    dispatchDateKey: dateKeyOf(o.dispatchDate),
    returnDateKey: dateKeyOf(o.returnDate),
    paymentDueDateKey,
    figures,
    stage: orderStage({ status: o.status, eventDateKey }, figures, todayKey),
    // A balance still owed after its deadline (the payment date, or the event when none was set).
    overdue: o.status !== "CANCELLED" && o.status !== "INQUIRY" && o.status !== "QUOTED" && figures.balance > 0 && todayKey > dueKey,
    lateReturn: o.status === "DISPATCHED" && todayKey > dateKeyOf(o.returnDate),
  };
}

/**
 * Bookings, newest event first. Filters: q (reference, customer, phone, place, event type), status
 * ("open", "holding", a status, "all"), fromKey/toKey (event date), clientId, eventType, payment
 * ("unpaid", "partly", "paid", "overdue"), handledById, itemId.
 */
export async function listOrders({ departmentId, todayKey, q = "", status = "open", fromKey, toKey, clientId, eventType, payment, handledById, itemId, take = 300, client = db }) {
  const term = String(q || "").trim();
  const where = {
    departmentId,
    ...(status === "open" ? { status: { in: OPEN_STATUSES } } : status === "holding" ? { status: { in: HOLDING_STATUSES } } : status && status !== "all" ? { status } : {}),
    ...(fromKey || toKey ? { eventDate: { ...(fromKey ? { gte: dbDate(fromKey) } : {}), ...(toKey ? { lte: dbDate(toKey) } : {}) } } : {}),
    ...(clientId ? { clientId } : {}),
    ...(eventType ? { eventType } : {}),
    ...(handledById ? { handledById } : {}),
    ...(itemId ? { lines: { some: { itemId } } } : {}),
    ...(term
      ? { OR: [{ referenceNo: { contains: term, mode: "insensitive" } }, { eventType: { contains: term, mode: "insensitive" } }, { eventLocation: { contains: term, mode: "insensitive" } }, { client: { name: { contains: term, mode: "insensitive" } } }, { client: { phone: { contains: term } } }] }
      : {}),
  };
  const rows = await client.rentalOrder.findMany({ where, select: ORDER_SELECT, orderBy: [{ eventDate: "desc" }, { createdAt: "desc" }], take });
  const money = await orderMoney(rows.map((r) => r.id), client);
  let out = rows.map((r) => shapeOrder(r, money[r.id], todayKey));
  if (payment === "overdue") out = out.filter((o) => o.overdue);
  else if (payment === "unpaid") out = out.filter((o) => o.figures.paymentStatus === "UNPAID" && o.status !== "CANCELLED");
  else if (payment === "partly") out = out.filter((o) => o.figures.paymentStatus === "PARTLY_PAID");
  else if (payment === "paid") out = out.filter((o) => ["PAID", "OVERPAID"].includes(o.figures.paymentStatus));
  return out;
}

/** Totals of a list: amount booked, paid, balance owed, overdue. */
export function listTotals(orders) {
  const t = { count: 0, amount: 0, paid: 0, balance: 0, overdue: 0, overdueCount: 0 };
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    t.count += 1;
    t.amount += o.figures.total;
    t.paid += o.figures.paid;
    t.balance += Math.max(0, o.figures.balance);
    if (o.overdue) {
      t.overdue += o.figures.balance;
      t.overdueCount += 1;
    }
  }
  return t;
}

/** One booking with its lines (and each item's photo and stock), checks, incidents, charges and money. */
export async function orderDetail({ departmentId, orderId, todayKey, client = db }) {
  const o = await client.rentalOrder.findFirst({ where: { id: orderId, departmentId }, select: { ...ORDER_SELECT, lines: { orderBy: { sortOrder: "asc" }, include: { item: { select: { id: true, code: true, name: true, unit: true, photoId: true, replacementValue: true, purchasePrice: true } } } } } });
  if (!o) return null;
  const [money, transactions, charges, checks, incidents] = await Promise.all([
    orderMoney([o.id], client),
    client.transaction.findMany({ where: { rentalOrderId: o.id }, include: { user: { select: { name: true } } }, orderBy: { date: "asc" } }),
    client.rentalCharge.findMany({ where: { orderId: o.id }, orderBy: { date: "asc" } }),
    client.rentalCheck.findMany({ where: { orderId: o.id }, include: { checkedBy: { select: { name: true } }, lines: true }, orderBy: { date: "asc" } }),
    client.rentalIncident.findMany({ where: { orderId: o.id }, include: { item: { select: { id: true, name: true, code: true, purchasePrice: true, replacementValue: true } } }, orderBy: { date: "asc" } }),
  ]);
  const order = shapeOrder(o, money[o.id], todayKey);
  order.lines = o.lines.map((l) => ({ ...l, item: l.item ? { ...l.item, photoUrl: l.item.photoId ? attachmentUrl(l.item.photoId) : null } : null }));
  return { order, transactions, charges, checks, incidents };
}

/** Bookings that touch [fromKey, toKey] (dispatch to return, the event, or the payment deadline). */
async function ordersInRange(departmentId, fromKey, toKey, client) {
  return client.rentalOrder.findMany({
    where: {
      departmentId,
      status: { not: "CANCELLED" },
      OR: [
        { dispatchDate: { lte: dbDate(toKey) }, returnDate: { gte: dbDate(fromKey) } },
        { paymentDueDate: { gte: dbDate(fromKey), lte: dbDate(toKey) } },
        { status: "DISPATCHED", returnDate: { lt: dbDate(fromKey) } }, // late returns stay on the calendar
      ],
    },
    select: { ...ORDER_SELECT, lines: { where: { kind: "ITEM" }, select: { itemId: true, label: true, quantity: true, issued: true, returned: true, damaged: true, broken: true, missing: true } } },
    orderBy: { eventDate: "asc" },
  });
}

/**
 * The calendar of a month: for each day of the grid, its events, items leaving, items coming
 * back, payment deadlines (each booking with its stage, for colours and words).
 */
export async function rentalCalendar({ departmentId, monthKey, todayKey, client = db }) {
  const grid = monthGrid(monthKey);
  const rows = await ordersInRange(departmentId, grid.start, grid.end, client);
  const money = await orderMoney(rows.map((r) => r.id), client);
  const orders = rows.map((r) => shapeOrder(r, money[r.id], todayKey));
  const days = grid.keys.map((dateKey) => ({
    dateKey,
    events: orders.filter((o) => o.eventDateKey === dateKey),
    dispatch: orders.filter((o) => o.dispatchDateKey === dateKey && ["CONFIRMED", "PREPARING"].includes(o.status)),
    returns: orders.filter((o) => o.returnDateKey === dateKey && o.status === "DISPATCHED"),
    payments: orders.filter((o) => o.paymentDueDateKey === dateKey && o.figures.balance > 0 && o.status !== "CANCELLED"),
    out: orders.filter((o) => o.status !== "INQUIRY" && o.status !== "QUOTED" && o.dispatchDateKey <= dateKey && dateKey <= o.returnDateKey).length,
  }));
  return { grid, days, orders };
}

/** Everything of one day: bookings whose event, dispatch, return or payment deadline is that day. */
export async function dayAgenda({ departmentId, dateKey, todayKey, client = db }) {
  const rows = await ordersInRange(departmentId, dateKey, dateKey, client);
  const money = await orderMoney(rows.map((r) => r.id), client);
  return rows.map((r) => shapeOrder(r, money[r.id], todayKey)).map((o) => ({
    ...o,
    roles: [o.eventDateKey === dateKey && "Event", o.dispatchDateKey === dateKey && "Dispatch", o.returnDateKey === dateKey && "Return", o.paymentDueDateKey === dateKey && "Payment due", o.dispatchDateKey < dateKey && dateKey < o.returnDateKey && o.eventDateKey !== dateKey && "Items out"].filter(Boolean),
  }));
}

/**
 * Availability of every active item over [fromKey, toKey] (the booking `excludeOrderId` left out):
 * [{ id, code, name, category, rentalPrice, usable, reserved, available, busiestDay }].
 */
export async function itemAvailability({ departmentId, fromKey, toKey, excludeOrderId = null, todayKey = null, client = db }) {
  const [items, rows] = await Promise.all([
    client.rentalItem.findMany({ where: { departmentId, archivedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    client.rentalOrder.findMany({
      where: { departmentId, status: { in: HOLDING_STATUSES }, dispatchDate: { lte: dbDate(toKey) }, ...(excludeOrderId ? { id: { not: excludeOrderId } } : {}) },
      select: { id: true, status: true, dispatchDate: true, returnDate: true, lines: { where: { kind: "ITEM" }, select: { itemId: true, quantity: true, issued: true, returned: true, damaged: true, broken: true, missing: true } } },
    }),
  ]);
  const orders = rows.map((o) => ({ ...o, dispatchDateKey: dateKeyOf(o.dispatchDate), returnDateKey: dateKeyOf(o.returnDate) }));
  const avail = availability(items, orders, fromKey, toKey, todayKey);
  return items.map((i) => ({ id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, rentalPrice: i.rentalPrice, photoUrl: i.photoId ? attachmentUrl(i.photoId) : null, ...avail[i.id] }));
}

/** Per item and day: units reserved and available over the next days (the availability board). */
export async function availabilityBoard({ departmentId, fromKey, days = 14, todayKey, client = db }) {
  const keys = Array.from({ length: days }, (_, i) => new Date(Date.parse(`${fromKey}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
  const toKey = keys[keys.length - 1];
  const [items, rows] = await Promise.all([
    client.rentalItem.findMany({ where: { departmentId, archivedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    client.rentalOrder.findMany({
      where: { departmentId, status: { in: HOLDING_STATUSES }, dispatchDate: { lte: dbDate(toKey) } },
      select: { id: true, status: true, dispatchDate: true, returnDate: true, lines: { where: { kind: "ITEM" }, select: { itemId: true, quantity: true, issued: true, returned: true, damaged: true, broken: true, missing: true } } },
    }),
  ]);
  const orders = rows.map((o) => ({ ...o, dispatchDateKey: dateKeyOf(o.dispatchDate), returnDateKey: dateKeyOf(o.returnDate) }));
  const perDay = keys.map((k) => availability(items, orders, k, k, todayKey));
  return {
    days: keys,
    items: items.map((i) => ({ id: i.id, code: i.code, name: i.name, category: i.category, usable: perDay[0][i.id].usable, byDay: perDay.map((d) => ({ reserved: d[i.id].reserved, available: d[i.id].available })) })),
  };
}

// ─── Customers ───────────────────────────────────────────────────────────────

/**
 * Customers with their bookings, total spent (booked, not cancelled), paid, balance owed. `q`
 * searches name, phone, e-mail, company.
 */
export async function customerList({ departmentId, q = "", todayKey, client = db }) {
  const term = String(q || "").trim();
  const clients = await client.venueClient.findMany({
    where: { departmentId, ...(term ? { OR: ["name", "phone", "email", "company", "address"].map((f) => ({ [f]: { contains: term, mode: "insensitive" } })) } : {}) },
    orderBy: { name: "asc" },
    take: 500,
  });
  const orders = clients.length
    ? await client.rentalOrder.findMany({ where: { departmentId, clientId: { in: clients.map((c) => c.id) } }, select: { id: true, clientId: true, status: true, agreedPrice: true, eventDate: true, paymentDueDate: true, returnDate: true } })
    : [];
  const money = await orderMoney(orders.map((o) => o.id), client);
  const byClient = {};
  for (const o of orders) {
    const s = shapeOrder(o, money[o.id], todayKey);
    const t = (byClient[o.clientId] ||= { bookings: 0, spent: 0, paid: 0, balance: 0, overdue: 0, lastEventKey: null });
    if (o.status !== "CANCELLED") {
      t.bookings += 1;
      t.spent += s.figures.total;
      t.balance += Math.max(0, s.figures.balance);
      if (s.overdue) t.overdue += s.figures.balance;
    }
    t.paid += s.figures.paid;
    if (!t.lastEventKey || s.eventDateKey > t.lastEventKey) t.lastEventKey = s.eventDateKey;
  }
  return clients.map((c) => ({ ...c, ...(byClient[c.id] || { bookings: 0, spent: 0, paid: 0, balance: 0, overdue: 0, lastEventKey: null }) }));
}

/** One customer: details, every booking (with its money), every payment and refund. */
export async function customerDetail({ departmentId, clientId, todayKey, client = db }) {
  const c = await client.venueClient.findFirst({ where: { id: clientId, departmentId } });
  if (!c) return null;
  const [orders, payments] = await Promise.all([
    listOrders({ departmentId, todayKey, clientId: c.id, status: "all", client }),
    client.transaction.findMany({ where: { departmentId, rentalOrder: { clientId: c.id }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, include: { rentalOrder: { select: { id: true, referenceNo: true } }, user: { select: { name: true } } }, orderBy: { date: "desc" } }),
  ]);
  const totals = listTotals(orders);
  return { client: c, orders, payments, totals, eventTypes: [...new Set(orders.map((o) => o.eventType))] };
}
