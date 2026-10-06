/**
 * Event rental reports as pure functions over plain rows, so every figure has one definition and
 * is unit-tested (docs/EVENT_RENTAL_PLAN.md):
 *
 *   revenue        a booking's price is revenue of its event date (confirmed bookings); charges
 *                  (damages, extra days…) on their date; money kept from a cancelled booking on
 *                  the cancellation date; other income when received
 *   costs          expenses when recorded (repairs included), items written off (at cost),
 *                  depreciation of the assets
 *   event profit   its revenue (price + charges) − its expenses − its items written off
 *
 * Purchases of items and assets are investments (cash out, not costs); their cost reaches the
 * income statement through write-offs and depreciation.
 */
import { listDateKeys } from "@/lib/timezone";
import { bookingFigures } from "@/lib/finance/booking-money";

const int = (v) => Math.round(Number(v) || 0);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
export const REVENUE_STATUSES = ["CONFIRMED", "PREPARING", "DISPATCHED", "RETURNED", "CLOSED"];

/**
 * Profit of each event of the period. `orders`: [{ id, referenceNo, eventType, eventDateKey,
 * client, agreedPrice, status }]; `charges`: [{ orderId, amount, voidedAt }]; `expenses`:
 * [{ rentalOrderId, amount, category, categoryLabel }]; `writeOffs`: [{ orderId, value }].
 */
export function eventProfitability({ orders, charges = [], expenses = [], writeOffs = [] }) {
  const rows = orders
    .filter((o) => REVENUE_STATUSES.includes(o.status))
    .map((o) => {
      const charged = charges.filter((c) => c.orderId === o.id && !c.voidedAt).reduce((s, c) => s + int(c.amount), 0);
      const own = expenses.filter((e) => e.rentalOrderId === o.id);
      const byCategory = {};
      for (const e of own) byCategory[e.categoryLabel || e.category] = (byCategory[e.categoryLabel || e.category] || 0) + int(e.amount);
      const expenseTotal = own.reduce((s, e) => s + int(e.amount), 0);
      const losses = writeOffs.filter((w) => w.orderId === o.id).reduce((s, w) => s + int(w.value), 0);
      const revenue = int(o.agreedPrice) + charged;
      const costs = expenseTotal + losses;
      return { id: o.id, referenceNo: o.referenceNo, eventType: o.eventType, eventDateKey: o.eventDateKey, client: o.client?.name, price: int(o.agreedPrice), charges: charged, revenue, expenses: expenseTotal, byCategory, losses, costs, profit: revenue - costs, margin: pct(revenue - costs, revenue) };
    })
    .sort((a, b) => b.profit - a.profit);
  const byType = {};
  for (const r of rows) {
    const t = (byType[r.eventType] ||= { eventType: r.eventType, events: 0, revenue: 0, costs: 0, profit: 0 });
    t.events += 1;
    t.revenue += r.revenue;
    t.costs += r.costs;
    t.profit += r.profit;
  }
  return { rows, byType: Object.values(byType).map((t) => ({ ...t, margin: pct(t.profit, t.revenue) })).sort((a, b) => b.profit - a.profit), revenue: rows.reduce((s, r) => s + r.revenue, 0), profit: rows.reduce((s, r) => s + r.profit, 0) };
}

/**
 * Income statement of the period. `events`: revenue of events dated in it (price); `charges`:
 * charges dated in it; `kept`: money kept from bookings cancelled in it; `money`: summarizeMoney of
 * the period; `losses`: items written off; `depreciation` and `disposals` (gain + / loss −) of
 * the assets.
 */
export function rentalIncomeStatement({ eventsRevenue = 0, chargesRevenue = 0, kept = 0, money, repairs = 0, losses = 0, depreciation = 0, disposals = 0 }) {
  const otherIncome = int(money?.otherIncome);
  const gains = Math.max(0, int(disposals));
  const revenue = int(eventsRevenue) + int(chargesRevenue) + int(kept) + otherIncome + gains;
  const allExpenses = int(money?.expenses) + int(money?.otherExpenses);
  const expenses = allExpenses - int(repairs);
  const disposalLosses = Math.max(0, -int(disposals));
  const costs = allExpenses + int(losses) + int(depreciation) + disposalLosses;
  return { eventsRevenue: int(eventsRevenue), chargesRevenue: int(chargesRevenue), cancellationIncome: int(kept), otherIncome, assetGains: gains, revenue, expenses, repairs: int(repairs), losses: int(losses) + disposalLosses, depreciation: int(depreciation), costs, result: revenue - costs, margin: pct(revenue - costs, revenue) };
}

/** Cash flow of the period (money the day it moves), the drawer from opening to closing. */
export function rentalCashFlow({ opening = 0, money, handovers = [] }) {
  const counted = handovers.filter((h) => ["RECORDED", "CONFIRMED"].includes(h.status));
  const handedOver = counted.reduce((s, h) => s + int(h.amount), 0);
  const fromCustomers = int(money?.bookingPayments);
  const otherIncome = int(money?.otherIncome);
  const refunds = int(money?.bookingRefunds);
  const expenses = int(money?.expenses) + int(money?.otherExpenses);
  const operating = fromCustomers + otherIncome - refunds - expenses;
  const purchases = int(money?.assetPurchases);
  return {
    opening: int(opening),
    receivedFromClients: fromCustomers,
    otherIncome,
    refunds,
    expenses,
    operating,
    purchases,
    investing: -purchases,
    net: operating - purchases,
    byMethod: money?.receivedByMethod || { CASH: 0, MOMO: 0, BANK_TRANSFER: 0, OTHER: 0 },
    cashIn: int(money?.cash?.in),
    cashOut: int(money?.cash?.out),
    handedOver,
    handoverPending: handovers.filter((h) => h.status === "RECORDED").reduce((s, h) => s + int(h.amount), 0),
    disputed: handovers.filter((h) => h.status === "DISPUTED").reduce((s, h) => s + int(h.amount), 0),
    closingCash: int(opening) + int(money?.cash?.in) - int(money?.cash?.out) - handedOver,
  };
}

/**
 * What customers owe and have paid ahead on `asOfKey`: a booking whose event has taken place owes
 * its unpaid balance (receivable); money paid for events still to come is an advance.
 * `orders`: [{ status, eventDateKey, agreedPrice, charges, money: [{ type, status, amount, dateKey }] }].
 */
export function customerBalances(orders, asOfKey, todayKey) {
  let receivable = 0;
  let advances = 0;
  const rows = [];
  for (const o of orders) {
    if (o.status === "CANCELLED") continue;
    const money = (o.money || []).filter((m) => !m.dateKey || m.dateKey <= asOfKey);
    const confirmed = REVENUE_STATUSES.includes(o.status);
    const f = bookingFigures({ agreedPrice: o.agreedPrice, status: o.status, charges: o.charges || [], money });
    if (confirmed && o.eventDateKey <= asOfKey) receivable += Math.max(0, f.balance);
    else advances += Math.max(0, f.paid);
    const now = bookingFigures({ agreedPrice: o.agreedPrice, status: o.status, charges: o.charges || [], money: o.money || [] });
    if (confirmed && now.balance > 0) rows.push({ id: o.id, referenceNo: o.referenceNo, client: o.client?.name, phone: o.client?.phone, eventType: o.eventType, eventDateKey: o.eventDateKey, total: now.total, paid: now.paid, balance: now.balance, overdue: todayKey > (o.paymentDueDateKey || o.eventDateKey) });
  }
  rows.sort((a, b) => Number(b.overdue) - Number(a.overdue) || b.balance - a.balance);
  return { receivable, advances, rows, owedTotal: rows.reduce((s, r) => s + r.balance, 0), overdue: rows.filter((r) => r.overdue).reduce((s, r) => s + r.balance, 0) };
}

/** Value of the stock at cost on a date, from the ledger (movements up to that date). */
export function stockValueFromLedger(movements) {
  let v = 0;
  for (const m of movements) {
    if (int(m.dOwned) > 0) v += int(m.value);
    else if (int(m.dOwned) < 0) v -= int(m.value);
  }
  return v;
}

/**
 * Balance sheet at the end of the period: cash in the drawer, money owed by customers for
 * events held, rental stock at cost (without the units also in the asset register), assets at
 * book value − customers' advances for events to come = net position.
 */
export function rentalBalanceSheet({ cash, receivable, stockValue, assetsInStock = 0, assetsBookValue, advances }) {
  const stock = Math.max(0, int(stockValue) - int(assetsInStock));
  const totalAssets = int(cash) + int(receivable) + stock + int(assetsBookValue);
  return { cash: int(cash), receivable: int(receivable), stockValue: stock, assetsBookValue: int(assetsBookValue), totalAssets, advances: int(advances), totalLiabilities: int(advances), netPosition: totalAssets - int(advances) };
}

/**
 * Items of the period: units rented (issued), times rented, revenue (their booking lines of events
 * held in the period), losses and repairs, days out, utilization (units × days out ÷ units owned ×
 * days of the period). `lines`: item lines of events of the period [{ itemId, quantity, total,
 * dispatchDateKey, returnDateKey, orderId }].
 */
export function itemAnalysis({ items, lines, writeOffs = [], repairs = [], fromKey, toKey }) {
  const days = listDateKeys(fromKey, toKey);
  const period = days.length;
  const per = Object.fromEntries(items.map((i) => [i.id, { id: i.id, code: i.code, name: i.name, category: i.category, owned: int(i.owned), units: 0, times: 0, revenue: 0, losses: 0, repairs: 0, unitDays: 0 }]));
  const seen = new Set();
  for (const l of lines) {
    const r = per[l.itemId];
    if (!r) continue;
    r.units += int(l.quantity);
    r.revenue += int(l.total);
    if (!seen.has(`${l.orderId}:${l.itemId}`)) {
      r.times += 1;
      seen.add(`${l.orderId}:${l.itemId}`);
    }
    const from = l.dispatchDateKey > fromKey ? l.dispatchDateKey : fromKey;
    const to = l.returnDateKey < toKey ? l.returnDateKey : toKey;
    if (from <= to) r.unitDays += int(l.quantity) * listDateKeys(from, to).length;
  }
  for (const w of writeOffs) if (per[w.itemId]) per[w.itemId].losses += int(w.value);
  for (const x of repairs) if (per[x.itemId]) per[x.itemId].repairs += int(x.cost);
  const rows = Object.values(per).map((r) => ({ ...r, profit: r.revenue - r.losses - r.repairs, utilization: pct(r.unitDays, r.owned * period) ?? 0 }));
  const rented = rows.filter((r) => r.units > 0);
  return {
    rows: rows.sort((a, b) => b.units - a.units || b.revenue - a.revenue),
    mostRented: [...rented].sort((a, b) => b.units - a.units).slice(0, 10),
    leastRented: [...rows].filter((r) => r.owned > 0).sort((a, b) => a.utilization - b.utilization || a.units - b.units).slice(0, 10),
    mostProfitable: [...rented].sort((a, b) => b.profit - a.profit).slice(0, 10),
    utilization: pct(rows.reduce((s, r) => s + r.unitDays, 0), rows.reduce((s, r) => s + r.owned * period, 0)) ?? 0,
  };
}

/** Customers ranked by what they spent on events of the period. */
export function customerSpending(profitRows) {
  const by = {};
  for (const r of profitRows) {
    const c = (by[r.client] ||= { client: r.client, events: 0, revenue: 0 });
    c.events += 1;
    c.revenue += r.revenue;
  }
  return Object.values(by).sort((a, b) => b.revenue - a.revenue);
}
