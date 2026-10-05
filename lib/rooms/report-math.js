/**
 * Guest house reports as pure functions over plain rows, so every figure has one definition and
 * is unit-tested. Owner's decisions: revenue per night stayed (a night counts once the guest has
 * checked in), expenses count when recorded, assets at purchase value (no depreciation), assets
 * bought are an investment (not a cost). Cash reports show money the day it moves.
 *
 *   revenue of an apartment = its nights' revenue + money kept from its cancelled bookings
 *                             + its other income
 *   profit of an apartment  = its revenue − its expenses (repairs included) − its asset losses
 *   result of the house     = Σ apartments' profit + shared income − shared costs
 */
import { listDateKeys } from "@/lib/timezone";
import { bookingFigures } from "@/lib/finance/booking-money";
import { nightlyRevenue, stayRevenueBetween } from "./stay-math";

const int = (v) => Math.round(Number(v) || 0);
const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);
const SHARED = "";

/** Nights' revenue in [fromKey, toKey] of each apartment and of each day. `stays`: shaped stays (keys). */
export function nightsRevenue(stays, fromKey, toKey) {
  const byRoom = {};
  const byDay = Object.fromEntries(listDateKeys(fromKey, toKey).map((k) => [k, 0]));
  let total = 0;
  let nights = 0;
  for (const s of stays) {
    const r = stayRevenueBetween(s, fromKey, toKey);
    if (!r.nights) continue;
    byRoom[s.roomId] ||= { revenue: 0, nights: 0 };
    byRoom[s.roomId].revenue += r.revenue;
    byRoom[s.roomId].nights += r.nights;
    total += r.revenue;
    nights += r.nights;
    for (const n of nightlyRevenue(s)) if (n.dateKey in byDay) byDay[n.dateKey] += n.amount;
  }
  return { total, nights, byRoom, byDay };
}

/**
 * Occupancy of [fromKey, toKey]: nights occupied per apartment (a past night counts when the guest
 * came; from `todayKey` on, a booked night counts), free nights, rate. Complimentary (venue
 * package) nights occupy the apartment and are counted apart.
 */
export function occupancy(rooms, stays, fromKey, toKey, todayKey) {
  const days = listDateKeys(fromKey, toKey);
  const per = {};
  for (const room of rooms) per[room.id] = { occupied: 0, complimentary: 0, available: days.length };
  for (const s of stays) {
    if (!per[s.roomId] || s.status === "CANCELLED") continue;
    for (const k of days) {
      if (!(s.checkInKey <= k && k < s.checkOutKey)) continue;
      const counts = k < todayKey ? ["CHECKED_IN", "CHECKED_OUT"].includes(s.status) : true;
      if (!counts) continue;
      per[s.roomId].occupied += 1;
      if (s.complimentary) per[s.roomId].complimentary += 1;
    }
  }
  const occupied = Object.values(per).reduce((a, r) => a + r.occupied, 0);
  const available = Object.values(per).reduce((a, r) => a + r.available, 0);
  return { byRoom: Object.fromEntries(Object.entries(per).map(([id, r]) => [id, { ...r, rate: pct(r.occupied, r.available) ?? 0 }])), occupied, available, rate: pct(occupied, available) ?? 0 };
}

/**
 * Money records of the period by apartment ("" = shared by the house): other income, expenses
 * (repairs apart), assets bought (investment). `transactions`: [{ type, amount, status, category, roomId }].
 */
export function moneyByRoom(transactions, capitalCategories = new Set()) {
  const out = {};
  const g = (k) => (out[k] ||= { otherIncome: 0, expenses: 0, repairs: 0, assetPurchases: 0, received: 0 });
  for (const t of transactions) {
    if (t.status === "VOIDED") continue;
    const r = g(t.roomId || SHARED);
    const a = int(t.amount);
    if (t.type === "OTHER_INCOME") r.otherIncome += a;
    if (t.type === "BOOKING_PAYMENT") r.received += a;
    if (t.type === "BOOKING_REFUND") r.received -= a;
    if (t.type === "EXPENSE" || t.type === "OTHER_EXPENSE") {
      if (capitalCategories.has(t.category)) r.assetPurchases += a;
      else {
        r.expenses += a;
        if (t.category === "stay-repairs") r.repairs += a;
      }
    }
  }
  return out;
}

/** Money kept from bookings cancelled in the period (received − refunded), by apartment. `cancelled`: [{ roomId, kept }]. */
export function cancellationsByRoom(cancelled) {
  const out = {};
  for (const c of cancelled) out[c.roomId] = (out[c.roomId] || 0) + Math.max(0, int(c.kept));
  return out;
}

/**
 * Profitability of every apartment and of the house. `rooms`: [{ id, name }]; the maps are by
 * apartment id ("" = shared). Ranked best first; ADR = revenue ÷ nights sold, RevPAR = revenue ÷
 * nights available.
 */
export function apartmentProfitability({ rooms, nights, money, cancellations, losses, occupancy: occ }) {
  const rows = rooms.map((room) => {
    const n = nights.byRoom[room.id] || { revenue: 0, nights: 0 };
    const m = money[room.id] || {};
    const revenue = n.revenue + int(cancellations[room.id]) + int(m.otherIncome);
    const costs = int(m.expenses) + int(losses[room.id]);
    const o = occ?.byRoom?.[room.id];
    return {
      roomId: room.id,
      name: room.name,
      nightsRevenue: n.revenue,
      nightsSold: n.nights,
      cancellationIncome: int(cancellations[room.id]),
      otherIncome: int(m.otherIncome),
      revenue,
      expenses: int(m.expenses),
      repairs: int(m.repairs),
      assetLosses: int(losses[room.id]),
      costs,
      profit: revenue - costs,
      margin: pct(revenue - costs, revenue),
      occupancyRate: o?.rate ?? null,
      adr: n.nights ? Math.round(n.revenue / n.nights) : 0,
      revpar: o?.available ? Math.round(n.revenue / o.available) : 0,
      assetPurchases: int(m.assetPurchases),
    };
  });
  rows.sort((a, b) => b.revenue - a.revenue || b.profit - a.profit || a.name.localeCompare(b.name));
  const s = money[SHARED] || {};
  const shared = { otherIncome: int(s.otherIncome), expenses: int(s.expenses), repairs: int(s.repairs), assetLosses: int(losses[SHARED]), assetPurchases: int(s.assetPurchases) };
  return {
    rows,
    shared,
    best: rows.length && rows[0].revenue > 0 ? rows[0] : null,
    worst: rows.length > 1 ? rows[rows.length - 1] : null,
  };
}

/** The income statement (profit & loss) of the house for the period. */
export function stayIncomeStatement({ profitability: p }) {
  const sum = (k) => p.rows.reduce((s, r) => s + r[k], 0);
  const nightsRevenue = sum("nightsRevenue");
  const cancellationIncome = sum("cancellationIncome");
  const otherIncome = sum("otherIncome") + p.shared.otherIncome;
  const revenue = nightsRevenue + cancellationIncome + otherIncome;
  const repairs = sum("repairs") + p.shared.repairs;
  const expenses = sum("expenses") + p.shared.expenses - repairs;
  const assetLosses = sum("assetLosses") + p.shared.assetLosses;
  const costs = expenses + repairs + assetLosses;
  return { nightsRevenue, cancellationIncome, otherIncome, revenue, expenses, repairs, assetLosses, costs, result: revenue - costs, margin: pct(revenue - costs, revenue), sharedCosts: p.shared.expenses + p.shared.assetLosses };
}

/**
 * Cash flow statement (money the day it moves): operating (guests, other income, refunds,
 * expenses), investing (assets bought), handed over to the Boss; the cash drawer from opening to
 * closing. `money`: summarizeMoney of the period.
 */
export function stayCashFlow({ opening = 0, money, handovers = [] }) {
  const counted = handovers.filter((h) => ["RECORDED", "CONFIRMED"].includes(h.status));
  const handedOver = counted.reduce((s, h) => s + int(h.amount), 0);
  const fromGuests = int(money?.bookingPayments);
  const otherIncome = int(money?.otherIncome);
  const refunds = int(money?.bookingRefunds);
  const expenses = int(money?.expenses) + int(money?.otherExpenses);
  const operating = fromGuests + otherIncome - refunds - expenses;
  const investing = -int(money?.assetPurchases);
  return {
    opening: int(opening),
    receivedFromClients: fromGuests,
    otherIncome,
    refunds,
    expenses,
    operating,
    assetPurchases: int(money?.assetPurchases),
    investing,
    net: operating + investing,
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

/**
 * What guests owe and have paid ahead on `asOfKey`: for each booking not cancelled (and not
 * free), earned = revenue of its nights up to asOfKey (guest checked in), paid = its money up to
 * then. Owed for nights stayed = receivable; paid for nights not stayed = advance. Also the
 * balance of each booking (price − paid), what the bookings list shows.
 * `stays`: [{ …stay keys, money: [{ type, status, amount, dateKey }] }].
 */
export function guestBalances(stays, asOfKey) {
  let receivable = 0;
  let advances = 0;
  const rows = [];
  for (const s of stays) {
    if (s.status === "CANCELLED" || s.complimentary) continue;
    const earned = stayRevenueBetween(s, "0000-01-01", asOfKey).revenue;
    const paid = bookingFigures({ agreedPrice: s.totalPrice, status: s.status, money: (s.money || []).filter((m) => !m.dateKey || m.dateKey <= asOfKey) }).paid;
    const f = bookingFigures({ agreedPrice: s.totalPrice, status: s.status, money: s.money || [] });
    receivable += Math.max(0, earned - paid);
    advances += Math.max(0, paid - earned);
    if (f.balance > 0) rows.push({ id: s.id, referenceNo: s.referenceNo, roomId: s.roomId, roomName: s.room?.name, guestName: s.guestName, guestPhone: s.guestPhone, checkInKey: s.checkInKey, checkOutKey: s.checkOutKey, status: s.status, total: f.total, paid: f.paid, balance: f.balance, earned, owedForNightsStayed: Math.max(0, earned - paid) });
  }
  rows.sort((a, b) => b.owedForNightsStayed - a.owedForNightsStayed || b.balance - a.balance);
  return { receivable, advances, rows, owedTotal: rows.reduce((s, r) => s + r.balance, 0) };
}

/** Register value on `asOfKey` from today's register and the movements after that day. */
export function registerValueAt(currentValue, movementsAfter) {
  let v = int(currentValue);
  for (const m of movementsAfter) {
    if (m.kind === "BOUGHT") v -= int(m.value);
    v += int(m.loss);
  }
  return v;
}

/**
 * Balance sheet of the department at the end of the period: what it holds (cash in the drawer,
 * money owed by guests for nights stayed, furniture and equipment) and what it owes (guests'
 * advances for nights not stayed yet); the difference is its net position.
 */
export function stayBalanceSheet({ cash, receivable, assetsValue, advances }) {
  const assets = int(cash) + int(receivable) + int(assetsValue);
  const liabilities = int(advances);
  return { cash: int(cash), receivable: int(receivable), assetsValue: int(assetsValue), totalAssets: assets, advances: int(advances), totalLiabilities: liabilities, netPosition: assets - liabilities };
}

/** Bookings activity of the period: new bookings, arrivals, departures, check-ins, check-outs, cancellations. */
export function bookingActivity(stays, fromKey, toKey, keyOf) {
  const inP = (k) => Boolean(k) && k >= fromKey && k <= toKey;
  const live = stays.filter((s) => s.status !== "CANCELLED");
  return {
    newBookings: stays.filter((s) => inP(keyOf(s.createdAt))).length,
    arrivals: live.filter((s) => inP(s.checkInKey)).length,
    departures: live.filter((s) => inP(s.checkOutKey)).length,
    checkIns: stays.filter((s) => inP(keyOf(s.checkedInAt))).length,
    checkOuts: stays.filter((s) => inP(keyOf(s.checkedOutAt))).length,
    cancellations: stays.filter((s) => s.status === "CANCELLED" && inP(keyOf(s.cancelledAt))).length,
    complimentary: live.filter((s) => s.complimentary && (inP(s.checkInKey) || (s.checkInKey < fromKey && s.checkOutKey > fromKey))).length,
  };
}
