/**
 * Venue reports as pure functions over plain rows, so every figure has one definition and is
 * unit-tested. Accounting basis (owner's decision): a booking is revenue on its EVENT DATE once
 * the event took place (Completed); money received before is the client's advance; a cancelled
 * booking's money kept (received − refunded) is income of its cancellation day. Cash reports show
 * money the day it moves.
 *
 *   event revenue      = agreed price + charges (not voided) of completed events
 *   event profit       = event revenue − expenses naming the event − asset losses of the event
 *   result of a period = event revenue + cancellation income + other income
 *                        − expenses − other expenses − asset losses
 */
import { WEEKDAYS, dateKeyOf, weekdayOf } from "./dates";

// Shared by every department type that hands cash over (lib/departments).
export { cashVerification } from "@/lib/departments/cash-verification";

const int = (v) => Math.round(Number(v) || 0);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/** Revenue of a completed event: agreed price + its charges. */
export function eventRevenue({ agreedPrice = 0, charges = 0 }) {
  return int(agreedPrice) + int(charges);
}

/**
 * Profitability of each completed event. `events`: [{ id, referenceNo, eventDateKey, eventType,
 * clientName, agreedPrice, charges, expenses, losses }] → sorted by profit (best first).
 */
export function eventProfitability(events = []) {
  return events
    .map((e) => {
      const revenue = eventRevenue(e);
      const costs = int(e.expenses) + int(e.losses);
      const profit = revenue - costs;
      return { ...e, revenue, costs, profit, margin: pct(profit, revenue) };
    })
    .sort((a, b) => b.profit - a.profit || String(a.eventDateKey).localeCompare(String(b.eventDateKey)));
}

/** Revenue (and events) by month "YYYY-MM" over `monthKeys`, from profitable rows. */
export function revenueByMonth(rows = [], monthKeys = []) {
  const m = new Map(monthKeys.map((k) => [k, { monthKey: k, revenue: 0, profit: 0, events: 0 }]));
  for (const r of rows) {
    const k = String(r.eventDateKey).slice(0, 7);
    if (!m.has(k)) continue;
    const g = m.get(k);
    g.revenue += int(r.revenue);
    g.profit += int(r.profit);
    g.events += 1;
  }
  return [...m.values()];
}

/** Revenue (and events) by day of the week, Monday first. */
export function revenueByWeekday(rows = []) {
  const order = [1, 2, 3, 4, 5, 6, 0];
  const w = new Map(order.map((d) => [d, { weekday: d, label: WEEKDAYS[d], revenue: 0, profit: 0, events: 0 }]));
  for (const r of rows) {
    const g = w.get(weekdayOf(r.eventDateKey));
    g.revenue += int(r.revenue);
    g.profit += int(r.profit);
    g.events += 1;
  }
  return order.map((d) => ({ ...w.get(d), average: w.get(d).events ? Math.round(w.get(d).revenue / w.get(d).events) : 0 }));
}

/** The most profitable periods: the best months and the best days of the week (with events). */
export function bestPeriods(byMonth = [], byWeekday = [], take = 3) {
  const top = (list) => [...list].filter((x) => x.events).sort((a, b) => b.profit - a.profit || b.revenue - a.revenue).slice(0, take);
  return { months: top(byMonth), weekdays: top(byWeekday) };
}

/**
 * The income statement of the venue for a period (accrual: events on their date).
 * `money`: summarizeMoney of the period's records; `events`: profitability rows;
 * `cancellations`: [{ kept }]; `losses`: asset losses of the period.
 */
export function venueIncomeStatement({ events = [], cancellations = [], money, losses = 0 }) {
  const eventsRevenue = events.reduce((s, e) => s + int(e.revenue), 0);
  const cancellationIncome = cancellations.reduce((s, c) => s + Math.max(0, int(c.kept)), 0);
  const otherIncome = int(money?.otherIncome);
  const revenue = eventsRevenue + cancellationIncome + otherIncome;
  const expenses = int(money?.expenses);
  const otherExpenses = int(money?.otherExpenses);
  const assetLosses = int(losses);
  const costs = expenses + otherExpenses + assetLosses;
  const result = revenue - costs;
  return { eventsRevenue, cancellationIncome, otherIncome, revenue, expenses, otherExpenses, assetLosses, costs, result, margin: pct(result, revenue) };
}

/**
 * Cash flow of the period (money the day it moves). `money`: summarizeMoney of the period;
 * `opening`: cash in the drawer before; `handovers`: [{ amount, status }] of the period.
 */
export function venueCashFlow({ opening = 0, money, handovers = [] }) {
  const counted = handovers.filter((h) => ["RECORDED", "CONFIRMED"].includes(h.status));
  const handedOver = counted.reduce((s, h) => s + int(h.amount), 0);
  const received = int(money?.bookingPayments) + int(money?.otherIncome);
  const paidOut = int(money?.bookingRefunds) + int(money?.expenses) + int(money?.otherExpenses);
  return {
    opening: int(opening),
    receivedFromClients: int(money?.bookingPayments),
    otherIncome: int(money?.otherIncome),
    refunds: int(money?.bookingRefunds),
    expenses: int(money?.expenses) + int(money?.otherExpenses),
    received,
    paidOut,
    net: received - paidOut,
    byMethod: money?.receivedByMethod || { CASH: 0, MOMO: 0, BANK_TRANSFER: 0 },
    cashIn: int(money?.cash?.in),
    cashOut: int(money?.cash?.out),
    handedOver,
    handoverConfirmed: handovers.filter((h) => h.status === "CONFIRMED").reduce((s, h) => s + int(h.amount), 0),
    handoverPending: handovers.filter((h) => h.status === "RECORDED").reduce((s, h) => s + int(h.amount), 0),
    disputed: handovers.filter((h) => h.status === "DISPUTED").reduce((s, h) => s + int(h.amount), 0),
    closingCash: int(opening) + int(money?.cash?.in) - int(money?.cash?.out) - handedOver,
  };
}

/** Balances still owed by clients: active bookings with a positive balance (biggest first). */
export function outstandingBalances(bookings = []) {
  const rows = bookings.filter((b) => b.status !== "CANCELLED" && b.figures.balance > 0).sort((a, b) => b.figures.balance - a.figures.balance);
  return { rows, total: rows.reduce((s, b) => s + b.figures.balance, 0), advances: bookings.filter((b) => ["RESERVED", "CONFIRMED"].includes(b.status)).reduce((s, b) => s + Math.max(0, b.figures.paid), 0) };
}

/** Dates without an active booking among the next `days` days from `fromKey` (inclusive). */
export function availableDates(heldKeys = [], fromKey, days) {
  const held = new Set(heldKeys.map(dateKeyOf));
  let free = 0;
  const start = Date.parse(`${fromKey}T00:00:00Z`);
  for (let i = 0; i < days; i += 1) {
    const k = new Date(start + i * 86400000).toISOString().slice(0, 10);
    if (!held.has(k)) free += 1;
  }
  return free;
}

/**
 * The expense report: expenses and other expenses of the period (not voided) by category, biggest
 * first, with the part spent on named events. `labelOf(category)` names a category.
 */
export function expensesByCategory(transactions = [], labelOf = (c) => c || "Uncategorized") {
  const m = new Map();
  for (const t of transactions) {
    if (t.status === "VOIDED" || !["EXPENSE", "OTHER_EXPENSE"].includes(t.type)) continue;
    const k = t.category || "";
    if (!m.has(k)) m.set(k, { category: k, label: labelOf(k), amount: 0, forEvents: 0, count: 0 });
    const g = m.get(k);
    g.amount += int(t.amount);
    if (t.bookingId) g.forEvents += int(t.amount);
    g.count += 1;
  }
  return [...m.values()].sort((a, b) => b.amount - a.amount);
}

/** The revenue report by type of event (completed events of the period), biggest first. */
export function revenueByEventType(events = []) {
  const m = new Map();
  for (const e of events) {
    const k = e.eventType || "Other";
    if (!m.has(k)) m.set(k, { eventType: k, events: 0, revenue: 0, profit: 0 });
    const g = m.get(k);
    g.events += 1;
    g.revenue += int(e.revenue);
    g.profit += int(e.profit);
  }
  return [...m.values()].map((g) => ({ ...g, average: Math.round(g.revenue / g.events) })).sort((a, b) => b.revenue - a.revenue);
}
