/**
 * Read side of pressings, car washes and jobs: the ticket board, one ticket with its payments, the
 * price list, washers with their earnings, customers (and vehicles), the dashboard with what needs
 * attention, the report of any period and the search.
 */
import { db } from "@/lib/prisma";
import { addDaysToKey, formatDateKey, formatTimeInZone, rangeBounds, toDateKey } from "@/lib/timezone";
import { buildStatements } from "@/lib/finance/statements";
import { isLate, isUnclaimed, priceOf, ticketMoney, STATUS_LABELS, CAR_WASH_LABELS } from "./ticket-math";
import { serviceSettings } from "./settings";
import { serviceWarnings } from "./alert-math";

export { serviceWarnings };

const int = (v) => Math.round(Number(v || 0));
const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const like = (q) => ({ contains: q, mode: "insensitive" });
const MONEY = { where: { type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, select: { id: true, type: true, status: true, amount: true, paymentMethod: true, referenceNo: true, date: true, reference: true, receivedByName: true, description: true, voidReason: true } };

export const statusLabels = (domain) => (domain === "CAR_WASH" ? CAR_WASH_LABELS : STATUS_LABELS);

/** A ticket as the pages show it (`t` with lines and records). */
export function shapeTicket(t, { timeZone, todayKey, now = new Date(), unclaimedDays = 30 }) {
  const money = ticketMoney(t, t.records || []);
  const readyKey = t.readyAt ? toDateKey(t.readyAt, timeZone) : null;
  return {
    id: t.id,
    referenceNo: t.referenceNo,
    customer: t.customerName || t.client?.name || null,
    phone: t.customerPhone || t.client?.phone || null,
    clientId: t.clientId,
    plate: t.vehiclePlate,
    vehicleType: t.vehicleType,
    status: t.status,
    express: t.express,
    surchargePct: t.surchargePct,
    discount: t.discount,
    discountReason: t.discountReason,
    subtotal: t.subtotal,
    total: t.total,
    paid: money.paid,
    balance: money.balance,
    kept: money.kept,
    tagNo: t.tagNo,
    notes: t.notes,
    receivedAt: t.receivedAt.toISOString(),
    receivedKey: toDateKey(t.receivedAt, timeZone),
    receivedTime: formatTimeInZone(t.receivedAt, timeZone),
    promisedAt: t.promisedAt ? t.promisedAt.toISOString() : null,
    promisedLabel: t.promisedAt ? `${formatDateKey(toDateKey(t.promisedAt, timeZone), { weekday: false })} ${formatTimeInZone(t.promisedAt, timeZone)}` : null,
    readyKey,
    collectedKey: t.collectedAt ? toDateKey(t.collectedAt, timeZone) : null,
    cancelReason: t.cancelReason,
    notified: Boolean(t.notifiedAt),
    late: isLate(t, now),
    unclaimed: isUnclaimed({ status: t.status, readyAt: readyKey }, todayKey, unclaimedDays),
    lines: (t.lines || []).map((l) => ({ id: l.id, itemId: l.itemId, variant: l.variant, label: l.label, quantity: Math.round(Number(l.quantity) * 1000) / 1000, unitPrice: l.unitPrice, total: l.total, workerId: l.workerId, worker: l.worker?.name || null, commission: l.commission, notes: l.notes })),
  };
}

const INCLUDE = { lines: { orderBy: { position: "asc" }, include: { worker: { select: { name: true } } } }, records: MONEY, client: { select: { name: true, phone: true } } };

/**
 * Tickets of a department: `view` open (received, in progress, ready) | ready | late | unclaimed |
 * owing | collected | cancelled | all; `q` reference, customer, phone, plate, tag; collected and
 * cancelled ones of [fromKey, toKey] (default the last 30 days).
 */
export async function ticketList({ department, view = "open", q, fromKey, toKey, timeZone, todayKey, now = new Date(), client = db }) {
  const settings = serviceSettings(department);
  const text = String(q || "").trim().slice(0, 60);
  const from = fromKey || addDaysToKey(todayKey, -30);
  const { start, end } = rangeBounds(from, toKey || todayKey, timeZone);
  const open = ["RECEIVED", "IN_PROGRESS", "READY"];
  const where = {
    departmentId: department.id,
    ...(text
      ? { OR: [{ referenceNo: like(text) }, { customerName: like(text) }, { customerPhone: like(text) }, { vehiclePlate: like(text.toUpperCase().replace(/[^A-Z0-9]/g, "") || text) }, { tagNo: like(text) }, { client: { name: like(text) } }] }
      : view === "collected" ? { status: "COLLECTED", collectedAt: { gte: start, lte: end } }
      : view === "cancelled" ? { status: "CANCELLED", cancelledAt: { gte: start, lte: end } }
      : view === "owing" ? { status: "COLLECTED" }
      : view === "all" ? { receivedAt: { gte: start, lte: end } }
      : view === "ready" || view === "unclaimed" ? { status: "READY" }
      : { status: { in: open } }),
  };
  const rows = await client.serviceTicket.findMany({ where, include: INCLUDE, orderBy: [{ express: "desc" }, { promisedAt: "asc" }, { receivedAt: "asc" }], take: 1000 });
  let out = rows.map((t) => shapeTicket(t, { timeZone, todayKey, now, unclaimedDays: settings.unclaimedDays }));
  if (!text) {
    if (view === "late") out = out.filter((t) => t.late);
    if (view === "unclaimed") out = out.filter((t) => t.unclaimed);
    if (view === "owing") out = out.filter((t) => t.balance > 0);
    if (["collected", "cancelled", "all"].includes(view)) out.reverse();
  }
  return out;
}

/** One ticket with its payments and refunds (and who recorded them). */
export async function ticketDetail({ department, ticketId, timeZone, todayKey, client = db }) {
  const t = await client.serviceTicket.findFirst({ where: { id: ticketId, departmentId: department.id }, include: { ...INCLUDE, records: { select: { ...MONEY.select, category: true, user: { select: { name: true } } }, orderBy: { date: "asc" } } } });
  if (!t) return null;
  const settings = serviceSettings(department);
  const shaped = shapeTicket({ ...t, records: t.records.filter((r) => ["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(r.type)) }, { timeZone, todayKey, unclaimedDays: settings.unclaimedDays });
  const by = await client.user.findFirst({ where: { id: t.createdById }, select: { name: true } });
  return {
    ticket: { ...shaped, createdBy: by?.name || "", startedKey: t.startedAt ? toDateKey(t.startedAt, timeZone) : null, readyTime: t.readyAt ? formatTimeInZone(t.readyAt, timeZone) : null, collectedTime: t.collectedAt ? formatTimeInZone(t.collectedAt, timeZone) : null },
    records: t.records.map((r) => ({ id: r.id, type: r.type, category: r.category, referenceNo: r.referenceNo, amount: int(r.amount), method: r.paymentMethod, reference: r.reference, dateKey: toDateKey(r.date, timeZone), time: formatTimeInZone(r.date, timeZone), by: r.user?.name || r.receivedByName, description: r.description, voided: r.status === "VOIDED", voidReason: r.voidReason })),
  };
}

/** The price list. */
export async function serviceCatalog({ departmentId, includeArchived = false, client = db }) {
  const rows = await client.serviceItem.findMany({ where: { departmentId, ...(includeArchived ? {} : { isActive: true }) }, orderBy: [{ sortOrder: "asc" }, { category: "asc" }, { name: "asc" }] });
  return rows.map((i) => ({ id: i.id, name: i.name, category: i.category, basePrice: i.basePrice, prices: i.prices && typeof i.prices === "object" ? i.prices : {}, unit: i.unit, commissionType: i.commissionType, commissionValue: i.commissionValue, minutes: i.minutes, sortOrder: i.sortOrder, isActive: i.isActive }));
}

/** The price of each service for each variant (the ticket form). */
export function priceMatrix(items, variants) {
  return items.map((i) => ({ ...i, matrix: Object.fromEntries(variants.map((v) => [v, priceOf(i, v)])) }));
}

/** Washers / workers with what they earned (collected tickets), were paid and are owed; and their work of the period. */
export async function workerBoard({ departmentId, fromKey, toKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [workers, earned, paid, period, payouts] = await Promise.all([
    client.serviceWorker.findMany({ where: { departmentId }, orderBy: [{ isActive: "desc" }, { name: "asc" }] }),
    client.serviceTicketLine.groupBy({ by: ["workerId"], where: { workerId: { not: null }, ticket: { departmentId, status: "COLLECTED" } }, _sum: { commission: true } }),
    client.transaction.groupBy({ by: ["serviceWorkerId"], where: { departmentId, serviceWorkerId: { not: null }, status: { not: "VOIDED" } }, _sum: { amount: true } }),
    client.serviceTicketLine.findMany({ where: { workerId: { not: null }, ticket: { departmentId, status: "COLLECTED", collectedAt: { gte: start, lte: end } } }, select: { workerId: true, ticketId: true, total: true, commission: true } }),
    client.transaction.findMany({ where: { departmentId, serviceWorkerId: { not: null }, date: { gte: start, lte: end } }, select: { id: true, referenceNo: true, amount: true, date: true, status: true, paymentMethod: true, serviceWorkerId: true }, orderBy: { date: "desc" } }),
  ]);
  return {
    workers: workers.map((w) => {
      const e = earned.find((x) => x.workerId === w.id)?._sum.commission || 0;
      const p = int(paid.find((x) => x.serviceWorkerId === w.id)?._sum.amount);
      const mine = period.filter((l) => l.workerId === w.id);
      return { id: w.id, name: w.name, phone: w.phone, isActive: w.isActive, earned: e, paid: p, owed: e - p, period: { tickets: new Set(mine.map((l) => l.ticketId)).size, revenue: sum(mine, (l) => l.total), commission: sum(mine, (l) => l.commission) } };
    }),
    payouts: payouts.map((t) => ({ id: t.id, referenceNo: t.referenceNo, amount: int(t.amount), dateKey: toDateKey(t.date, timeZone), method: t.paymentMethod, voided: t.status === "VOIDED", worker: workers.find((w) => w.id === t.serviceWorkerId)?.name })),
  };
}

/** Customers (and vehicles) from the tickets: visits, spent, owing, last visit. */
export async function serviceCustomers({ department, q, timeZone, todayKey, client = db }) {
  const text = String(q || "").trim().slice(0, 60);
  const rows = await client.serviceTicket.findMany({
    where: { departmentId: department.id, status: { not: "CANCELLED" }, ...(text ? { OR: [{ customerName: like(text) }, { customerPhone: like(text) }, { vehiclePlate: like(text.toUpperCase()) }, { client: { name: like(text) } }] } : {}) },
    include: { records: MONEY, client: { select: { id: true, name: true, phone: true } } },
    orderBy: { receivedAt: "desc" },
    take: 5000,
  });
  const map = new Map();
  for (const t of rows) {
    const key = t.clientId ? `c:${t.clientId}` : department.domain === "CAR_WASH" && t.vehiclePlate ? `p:${t.vehiclePlate}` : t.customerPhone ? `t:${t.customerPhone}` : t.customerName ? `n:${t.customerName.toLowerCase()}` : null;
    if (!key) continue;
    const m = ticketMoney(t, t.records);
    const c = map.get(key) || { key, clientId: t.clientId, name: t.client?.name || t.customerName || t.vehiclePlate, phone: t.client?.phone || t.customerPhone, plates: new Set(), visits: 0, spent: 0, owing: 0, lastKey: null };
    c.visits += 1;
    if (t.status === "COLLECTED") c.spent += t.total;
    if (m.balance > 0 && t.status === "COLLECTED") c.owing += m.balance;
    if (t.vehiclePlate) c.plates.add(t.vehiclePlate);
    const k = toDateKey(t.receivedAt, timeZone);
    if (!c.lastKey || k > c.lastKey) c.lastKey = k;
    map.set(key, c);
  }
  const settings = serviceSettings(department);
  return [...map.values()].map((c) => ({ ...c, plates: [...c.plates], nextFree: settings.loyaltyEvery > 1 ? settings.loyaltyEvery - (c.visits % settings.loyaltyEvery) : null })).sort((a, b) => (b.lastKey || "").localeCompare(a.lastKey || ""));
}

/** The dashboard of a pressing / car wash (and the jobs of an other activity). */
export async function serviceDashboard({ department, todayKey, timeZone, now = new Date(), client = db }) {
  const monthFrom = `${todayKey.slice(0, 7)}-01`;
  const { start, end } = rangeBounds(todayKey, todayKey, timeZone);
  const [tickets, owing, board, today, payments, month, days] = await Promise.all([
    ticketList({ department, view: "open", timeZone, todayKey, now, client }),
    ticketList({ department, view: "owing", timeZone, todayKey, now, client }),
    department.domain === "CAR_WASH" ? workerBoard({ departmentId: department.id, fromKey: todayKey, toKey: todayKey, timeZone, client }) : { workers: [] },
    client.serviceTicket.findMany({ where: { departmentId: department.id, OR: [{ receivedAt: { gte: start, lte: end } }, { collectedAt: { gte: start, lte: end } }] }, select: { receivedAt: true, collectedAt: true, status: true, total: true } }),
    client.transaction.findMany({ where: { departmentId: department.id, serviceTicketId: { not: null }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] }, status: { not: "VOIDED" }, date: { gte: start, lte: end } }, select: { type: true, amount: true } }),
    buildStatements({ organizationId: department.organizationId, departments: [department], fromKey: monthFrom, toKey: todayKey, timeZone, compare: false, client }),
    serviceRevenueByDay(client, department.id, addDaysToKey(todayKey, -13), todayKey, timeZone),
  ]);
  const inDay = (d) => d && d >= start && d <= end;
  const counts = { RECEIVED: 0, IN_PROGRESS: 0, READY: 0 };
  for (const t of tickets) counts[t.status] += 1;
  return {
    counts,
    tickets,
    queue: tickets.filter((t) => t.status !== "READY"),
    ready: tickets.filter((t) => t.status === "READY"),
    today: {
      received: today.filter((t) => inDay(t.receivedAt)).length,
      collected: today.filter((t) => t.status === "COLLECTED" && inDay(t.collectedAt)).length,
      revenue: sum(today.filter((t) => t.status === "COLLECTED" && inDay(t.collectedAt)), (t) => t.total),
      cashIn: sum(payments, (p) => (p.type === "BOOKING_PAYMENT" ? int(p.amount) : -int(p.amount))),
    },
    month: month.income,
    owing: { count: owing.length, amount: sum(owing, (t) => t.balance) },
    advances: sum(tickets, (t) => Math.max(0, t.paid)),
    toCollect: sum(tickets, (t) => Math.max(0, t.balance)),
    workers: board.workers,
    days,
    warnings: serviceWarnings({ tickets, owing, workers: board.workers, domain: department.domain }),
  };
}

async function serviceRevenueByDay(client, departmentId, fromKey, toKey, timeZone) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const rows = await client.serviceTicket.findMany({ where: { departmentId, status: "COLLECTED", collectedAt: { gte: start, lte: end } }, select: { total: true, collectedAt: true } });
  const by = {};
  for (const r of rows) {
    const k = toDateKey(r.collectedAt, timeZone);
    by[k] = (by[k] || 0) + r.total;
  }
  const n = Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / 86400000) + 1;
  return Array.from({ length: n }, (_, i) => addDaysToKey(fromKey, i)).map((k) => ({ dateKey: k, amount: by[k] || 0 }));
}

/** The report of any period. */
export async function serviceReport({ department, organizationId, fromKey, toKey, timeZone, todayKey, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const settings = serviceSettings(department);
  const [collected, received, cancelled, money, compensations, statements, board, owing, unclaimed] = await Promise.all([
    client.serviceTicket.findMany({ where: { departmentId: department.id, status: "COLLECTED", collectedAt: { gte: start, lte: end } }, include: { lines: { include: { item: { select: { name: true } }, worker: { select: { name: true } } } } } }),
    client.serviceTicket.count({ where: { departmentId: department.id, receivedAt: { gte: start, lte: end } } }),
    client.serviceTicket.findMany({ where: { departmentId: department.id, status: "CANCELLED", cancelledAt: { gte: start, lte: end } }, include: { records: MONEY } }),
    client.transaction.findMany({ where: { departmentId: department.id, serviceTicketId: { not: null }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] }, status: { not: "VOIDED" }, date: { gte: start, lte: end } }, select: { type: true, amount: true, paymentMethod: true } }),
    client.transaction.aggregate({ where: { departmentId: department.id, category: "pressing-compensation", status: { not: "VOIDED" }, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: true }),
    buildStatements({ organizationId, departments: [department], fromKey, toKey, timeZone, compare: true, client }),
    workerBoard({ departmentId: department.id, fromKey, toKey, timeZone, client }),
    ticketList({ department, view: "owing", timeZone, todayKey: todayKey || toKey, client }),
    ticketList({ department, view: "unclaimed", timeZone, todayKey: todayKey || toKey, client }),
  ]);
  const services = new Map();
  const variants = new Map();
  const bump = (map, key, l) => {
    const x = map.get(key) || { name: key, lines: 0, quantity: 0, revenue: 0 };
    x.lines += 1;
    x.quantity += Number(l.quantity);
    x.revenue += l.total;
    map.set(key, x);
  };
  let turnaround = 0;
  let timed = 0;
  for (const t of collected) {
    if (t.readyAt) {
      turnaround += (t.readyAt - t.receivedAt) / 3600000;
      timed += 1;
    }
    for (const l of t.lines) {
      bump(services, l.item?.name || l.label, l);
      if (l.variant) bump(variants, l.variant, l);
    }
  }
  const byMethod = {};
  for (const m of money) byMethod[m.paymentMethod] = (byMethod[m.paymentMethod] || 0) + (m.type === "BOOKING_PAYMENT" ? int(m.amount) : -int(m.amount));
  const kept = cancelled.map((t) => ticketMoney(t, t.records).kept);
  return {
    fromKey,
    toKey,
    settings,
    tickets: {
      received,
      collected: collected.length,
      revenue: sum(collected, (t) => t.total),
      average: collected.length ? Math.round(sum(collected, (t) => t.total) / collected.length) : 0,
      express: collected.filter((t) => t.express).length,
      surcharges: sum(collected, (t) => Math.round((t.subtotal * t.surchargePct) / 100)),
      discounts: sum(collected.filter((t) => !String(t.discountReason || "").startsWith("Loyalty")), (t) => t.discount),
      loyalty: { count: collected.filter((t) => String(t.discountReason || "").startsWith("Loyalty")).length, value: sum(collected.filter((t) => String(t.discountReason || "").startsWith("Loyalty")), (t) => t.discount) },
      turnaroundHours: timed ? Math.round((turnaround / timed) * 10) / 10 : null,
      cancelled: cancelled.length,
      kept: sum(kept, (k) => k),
    },
    byService: [...services.values()].sort((a, b) => b.revenue - a.revenue),
    byVariant: [...variants.values()].sort((a, b) => b.revenue - a.revenue),
    workers: board.workers.filter((w) => w.period.tickets || w.owed),
    payouts: board.payouts,
    money: { received: sum(money.filter((m) => m.type === "BOOKING_PAYMENT"), (m) => int(m.amount)), refunded: sum(money.filter((m) => m.type === "BOOKING_REFUND"), (m) => int(m.amount)), byMethod, compensations: int(compensations._sum.amount), compensationCount: compensations._count },
    owing: { rows: owing, amount: sum(owing, (t) => t.balance) },
    unclaimed,
    statements,
    income: statements.income,
  };
}

export async function serviceSearch({ department, q, timeZone, todayKey, client = db }) {
  const text = String(q || "").trim().slice(0, 60);
  if (text.length < 2) return null;
  const [tickets, items, money] = await Promise.all([
    ticketList({ department, q: text, timeZone, todayKey, client }),
    client.serviceItem.findMany({ where: { departmentId: department.id, OR: [{ name: like(text) }, { category: like(text) }] }, take: 20 }),
    client.transaction.findMany({ where: { departmentId: department.id, OR: [{ referenceNo: like(text) }, { counterparty: like(text) }, { description: like(text) }, { reference: like(text) }] }, orderBy: { date: "desc" }, take: 20 }),
  ]);
  const labels = statusLabels(department.domain);
  const groups = {
    tickets: tickets.slice(0, 20).map((t) => ({ id: t.id, title: `${t.referenceNo} · ${[t.customer, t.plate].filter(Boolean).join(" · ") || "walk-in"}`, detail: `${t.receivedKey} · ${labels[t.status]}${t.tagNo ? ` · tag ${t.tagNo}` : ""}${t.balance > 0 && t.status !== "CANCELLED" ? ` · owes ${t.balance}` : ""}`, amount: t.total, href: `/tickets/${t.id}` })),
    prices: items.map((i) => ({ id: i.id, title: i.name, detail: [i.category, i.isActive ? null : "archived"].filter(Boolean).join(" · ") || "Price list", amount: i.basePrice || undefined, href: "/prices" })),
    money: money.map((t) => ({ id: t.id, title: `${t.referenceNo} · ${t.counterparty || t.type.toLowerCase().replace("_", " ")}`, detail: `${toDateKey(t.date, timeZone)} · ${(t.description || "").slice(0, 80)}${t.status === "VOIDED" ? " · voided" : ""}`, amount: int(t.amount), href: t.serviceTicketId ? `/tickets/${t.serviceTicketId}` : `/money?ref=${t.referenceNo}` })),
  };
  return { q: text, groups, total: Object.values(groups).reduce((s, g) => s + g.length, 0) };
}
