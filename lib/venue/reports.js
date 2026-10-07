/**
 * The venue's report for any period (a day, a week, a month, a year …): the dashboard, the daily /
 * weekly / monthly reports and the financial statements all read it, so they always agree. Every
 * query is scoped to the department, aggregated by the database where possible and bounded
 * (a hall has at most one event a day). Definitions: lib/venue/report-math.js.
 */
import { db } from "@/lib/prisma";
import { summarizeMoney } from "@/lib/finance/money-math";
import { drawerNow, openingCashBefore } from "@/lib/finance/posting-service";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { dbDate, dateKeyOf, monthKeyOf, shiftMonth } from "./dates";
import { bookingFigures } from "./booking-math";
import { bookingMoney, upcomingBookings, heldDates } from "./booking-queries";
import { leadStats } from "./lead-math";
import { incidentTotals } from "./asset-math";
import { categoryLabel } from "@/data/categories";
import {
  availableDates, bestPeriods, cashVerification, eventProfitability, expensesByCategory, outstandingBalances, revenueByEventType, revenueByMonth, revenueByWeekday, venueCashFlow, venueIncomeStatement,
} from "./report-math";

const int = (v) => Math.round(Number(v) || 0);

/** Completed events with their date in [fromKey, toKey]: revenue, expenses and losses of each. */
async function completedEvents(client, departmentId, fromKey, toKey) {
  const rows = await client.venueBooking.findMany({
    where: { departmentId, status: "COMPLETED", eventDate: { gte: dbDate(fromKey), lte: dbDate(toKey) } },
    select: { id: true, referenceNo: true, eventDate: true, eventType: true, agreedPrice: true, guests: true, client: { select: { name: true } } },
    orderBy: { eventDate: "asc" },
  });
  const ids = rows.map((r) => r.id);
  if (!ids.length) return [];
  const [charges, expenses, losses] = await Promise.all([
    client.venueBookingCharge.groupBy({ by: ["bookingId"], where: { bookingId: { in: ids }, voidedAt: null }, _sum: { amount: true } }),
    client.transaction.groupBy({ by: ["bookingId"], where: { bookingId: { in: ids }, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" } }, _sum: { amount: true } }),
    client.venueAssetIncident.groupBy({ by: ["bookingId"], where: { bookingId: { in: ids }, status: "LOSS" }, _sum: { cost: true } }),
  ]);
  const sum = (list, id, field = "amount") => int(list.find((x) => x.bookingId === id)?._sum[field]);
  return eventProfitability(
    rows.map((r) => ({
      id: r.id,
      referenceNo: r.referenceNo,
      eventDateKey: dateKeyOf(r.eventDate),
      eventType: r.eventType,
      clientName: r.client.name,
      guests: r.guests,
      agreedPrice: r.agreedPrice,
      charges: sum(charges, r.id),
      expenses: sum(expenses, r.id),
      losses: sum(losses, r.id, "cost"),
    }))
  );
}

/** Bookings cancelled in the period and the money they kept (received − refunded). */
async function cancellations(client, departmentId, start, end) {
  const rows = await client.venueBooking.findMany({ where: { departmentId, status: "CANCELLED", cancelledAt: { gte: start, lte: end } }, select: { id: true, referenceNo: true, cancelReason: true, cancelledAt: true, client: { select: { name: true } } } });
  const money = await bookingMoney(rows.map((r) => r.id), client);
  return rows.map((r) => {
    const f = bookingFigures({ agreedPrice: 0, status: "CANCELLED", ...money[r.id] });
    return { ...r, kept: f.paid };
  });
}

/** Active bookings (any date) with their money: balances owed and advances held. */
async function activeBookings(client, departmentId) {
  const rows = await client.venueBooking.findMany({
    where: { departmentId, status: { in: ["RESERVED", "CONFIRMED", "COMPLETED"] } },
    select: { id: true, referenceNo: true, status: true, eventDate: true, eventType: true, agreedPrice: true, client: { select: { name: true, phone: true } } },
    orderBy: { eventDate: "asc" },
    take: 3000,
  });
  const money = await bookingMoney(rows.map((r) => r.id), client);
  return rows.map((r) => ({ ...r, eventDate: undefined, eventDateKey: dateKeyOf(r.eventDate), figures: bookingFigures({ agreedPrice: r.agreedPrice, status: r.status, ...money[r.id] }) }));
}

/**
 * Everything about the venue for [fromKey, toKey]. `history` (default 12): the months of the
 * revenue-by-month series ending with the period's last month.
 */
export async function venueReport({ departmentId, organizationId, fromKey, toKey, timeZone, todayKey = toDateKey(new Date(), timeZone), history = 12, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const historyFrom = `${shiftMonth(monthKeyOf(toKey), -(history - 1))}-01`;
  const [events, historyEvents, cancelled, transactions, handovers, receipts, active, statusCounts, leads, incidents, settled, counts, opening, drawer, upcoming, held] = await Promise.all([
    completedEvents(client, departmentId, fromKey, toKey),
    completedEvents(client, departmentId, historyFrom < fromKey ? historyFrom : fromKey, toKey),
    cancellations(client, departmentId, start, end),
    client.transaction.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true, bookingId: true } }),
    client.cashHandover.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { amount: true, status: true } }),
    client.transaction.groupBy({ by: ["receivedByName", "paymentMethod"], where: { departmentId, type: "BOOKING_PAYMENT", status: { not: "VOIDED" }, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } }),
    activeBookings(client, departmentId),
    client.venueBooking.groupBy({ by: ["status"], where: { departmentId, eventDate: { gte: dbDate(fromKey), lte: dbDate(toKey) } }, _count: { _all: true } }),
    client.venueLead.findMany({ where: { departmentId, enquiryDate: { gte: dbDate(fromKey), lte: dbDate(toKey) } }, select: { status: true, source: true } }),
    client.venueAssetIncident.findMany({ where: { departmentId, createdAt: { gte: start, lte: end } }, select: { status: true, cost: true, quantity: true, kind: true } }),
    client.venueAssetIncident.aggregate({ where: { departmentId, status: "LOSS", settledAt: { gte: start, lte: end } }, _sum: { cost: true } }),
    client.venueCashCount.findMany({ where: { departmentId, date: { gte: dbDate(fromKey), lte: dbDate(toKey) } }, orderBy: { date: "asc" } }),
    openingCashBefore(client, departmentId, start),
    drawerNow(client, { organizationId, departmentId, timeZone }),
    upcomingBookings({ departmentId, todayKey, take: 6, client }),
    heldDates({ departmentId, fromKey: todayKey, client }),
  ]);

  const money = summarizeMoney(transactions);
  const eventExpenses = transactions.filter((t) => t.bookingId && t.status !== "VOIDED" && ["EXPENSE", "OTHER_EXPENSE"].includes(t.type)).reduce((s, t) => s + int(t.amount), 0);
  const losses = int(settled._sum.cost);
  const income = venueIncomeStatement({ events, cancellations: cancelled, money, losses });
  const cashFlow = venueCashFlow({ opening, money, handovers });
  const verification = cashVerification({
    receipts: receipts.map((r) => ({ receivedBy: r.receivedByName, method: r.paymentMethod, amount: r._sum.amount, count: r._count._all })),
    counts: counts.map((c) => ({ dateKey: dateKeyOf(c.date), countedCash: c.countedCash, expectedCash: c.expectedCash, variance: c.variance, notes: c.notes })),
    cashFlow,
    drawerNow: drawer,
  });
  const monthKeys = [];
  for (let k = monthKeyOf(historyFrom); k <= monthKeyOf(toKey); k = shiftMonth(k, 1)) monthKeys.push(k);
  const byMonth = revenueByMonth(historyEvents, monthKeys);
  const byWeekday = revenueByWeekday(historyEvents);
  const bookingsByStatus = Object.fromEntries(["RESERVED", "CONFIRMED", "COMPLETED", "CANCELLED"].map((s) => [s, statusCounts.find((x) => x.status === s)?._count._all || 0]));
  const lead = leadStats(leads);

  return {
    fromKey,
    toKey,
    todayKey,
    income,
    cashFlow,
    verification,
    events,
    eventExpenses,
    expensesByCategory: expensesByCategory(transactions, (c) => categoryLabel(c) || "Uncategorized"),
    revenueByEventType: revenueByEventType(events),
    cancellations: cancelled,
    bookings: { ...bookingsByStatus, total: bookingsByStatus.RESERVED + bookingsByStatus.CONFIRMED + bookingsByStatus.COMPLETED },
    outstanding: outstandingBalances(active),
    upcomingCount: active.filter((b) => b.status !== "COMPLETED" && b.eventDateKey >= todayKey).length,
    leads: lead,
    assets: { ...incidentTotals(incidents), lossesSettled: losses },
    byMonth,
    byWeekday,
    best: bestPeriods(byMonth, byWeekday),
    upcoming,
    available: { next30: availableDates(held, todayKey, 30), next90: availableDates(held, todayKey, 90) },
    drawer,
  };
}

/** The key figures of a venue department for a period (the Boss's overview of every department). */
export async function venueSummary({ department, organizationId, fromKey, toKey, timeZone, client = db }) {
  const r = await venueReport({ departmentId: department.id, organizationId, fromKey, toKey, timeZone, history: 1, client });
  return {
    eventsRevenue: r.income.eventsRevenue,
    cancellationIncome: r.income.cancellationIncome,
    assetLosses: r.income.assetLosses,
    revenue: r.income.revenue,
    costs: r.income.costs,
    result: r.income.result,
    received: r.cashFlow.receivedFromClients + r.cashFlow.otherIncome,
    receivedFromClients: r.cashFlow.receivedFromClients,
    handedOver: r.cashFlow.handedOver,
    toHandOver: r.verification.toHandOver,
    outstanding: r.outstanding.total,
    discrepancies: r.verification.discrepancies,
    events: r.events.length,
    upcoming: r.upcomingCount,
    leads: r.leads,
    nextEvent: r.upcoming[0] ? { dateKey: r.upcoming[0].eventDateKey, referenceNo: r.upcoming[0].referenceNo, client: r.upcoming[0].client?.name } : null,
  };
}

/**
 * Revenue, losses and kept cancellations per venue department (company statements); `days`: the
 * same by date key (charts of the Boss's overview).
 */
export async function venueStatementFigures({ departments, fromKey, toKey, timeZone, client = db }) {
  const venues = departments.filter((d) => d.domain === "EVENT_VENUE");
  const out = {};
  await Promise.all(
    venues.map(async (d) => {
      const { start, end } = rangeBounds(fromKey, toKey, timeZone);
      const [events, cancelled, settled] = await Promise.all([
        completedEvents(client, d.id, fromKey, toKey),
        cancellations(client, d.id, start, end),
        client.venueAssetIncident.findMany({ where: { departmentId: d.id, status: "LOSS", settledAt: { gte: start, lte: end } }, select: { cost: true, settledAt: true } }),
      ]);
      const days = {};
      const day = (k) => (days[k] ||= { revenue: 0, assetLosses: 0 });
      for (const e of events) day(e.eventDateKey).revenue += e.revenue;
      for (const c of cancelled) day(toDateKey(c.cancelledAt, timeZone)).revenue += Math.max(0, c.kept);
      for (const l of settled) day(toDateKey(l.settledAt, timeZone)).assetLosses += int(l.cost);
      out[d.id] = {
        eventsRevenue: events.reduce((s, e) => s + e.revenue, 0),
        cancellationIncome: cancelled.reduce((s, c) => s + Math.max(0, c.kept), 0),
        assetLosses: settled.reduce((s, l) => s + int(l.cost), 0),
        days,
      };
    })
  );
  return out;
}

/**
 * What the ledger recognizes for [fromKey, toKey] (lib/accounting): each event held (revenue of its
 * date), the money kept from each cancelled booking, each asset loss settled. Same sources as
 * venueStatementFigures, one fact per booking or incident.
 */
export async function venueRecognitions({ department, fromKey, toKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [events, cancelled, settled] = await Promise.all([
    completedEvents(client, department.id, fromKey, toKey),
    cancellations(client, department.id, start, end),
    client.venueAssetIncident.findMany({ where: { departmentId: department.id, status: "LOSS", settledAt: { gte: start, lte: end } }, select: { id: true, cost: true, settledAt: true, asset: { select: { name: true } } } }),
  ]);
  const departmentId = department.id;
  return [
    ...events.map((e) => ({ sourceKey: `venue-event:${e.id}`, kind: "revenue", role: "EVENTS", dateKey: e.eventDateKey, amount: e.revenue, partner: { key: `booking:${e.id}`, name: e.clientName }, label: `Event ${e.eventType || ""} · ${e.clientName}`.replace("  ", " "), reference: e.referenceNo, departmentId })),
    ...cancelled.filter((c) => c.kept > 0).map((c) => ({ sourceKey: `venue-kept:${c.id}`, kind: "revenue", role: "KEPT", dateKey: toDateKey(c.cancelledAt, timeZone), amount: c.kept, partner: { key: `booking:${c.id}`, name: c.client.name }, label: `Kept on cancellation · ${c.client.name}`, reference: c.referenceNo, departmentId })),
    ...settled.map((l) => ({ sourceKey: `venue-loss:${l.id}`, kind: "loss", assetRole: "FURNITURE", dateKey: toDateKey(l.settledAt, timeZone), amount: int(l.cost), label: `Asset lost · ${l.asset?.name || ""}`, departmentId })),
  ];
}
