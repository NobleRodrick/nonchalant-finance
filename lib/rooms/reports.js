/**
 * A guest house's report for any period (a day, a week, a month …): the dashboard, the Reports
 * page, the automatic daily and weekly reports, the company statements and the Boss's overview
 * all read it, so they always agree. Queries are scoped to the department and bounded (a guest
 * house has a few apartments). Definitions: lib/rooms/report-math.js.
 */
import { db } from "@/lib/prisma";
import { summarizeMoney } from "@/lib/finance/money-math";
import { drawerNow, openingCashBefore } from "@/lib/finance/posting-service";
import { CAPITAL_CATEGORIES } from "@/data/categories";
import { categoryLabel } from "@/data/categories";
import { addDaysToKey, rangeBounds, toDateKey } from "@/lib/timezone";
import { bookingFigures } from "@/lib/finance/booking-money";
import { cashVerification } from "@/lib/departments/cash-verification";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { nightsOf, stayRevenueBetween } from "./stay-math";
import { assetRegister, movementTotals, registerTotals } from "./asset-queries";
import { listRepairs, repairTotals } from "./repair-queries";
import {
  apartmentProfitability, bookingActivity, cancellationsByRoom, guestBalances, moneyByRoom, nightsRevenue, occupancy, registerValueAt, stayBalanceSheet, stayCashFlow, stayIncomeStatement,
} from "./report-math";

const STAY_FIELDS = { id: true, referenceNo: true, roomId: true, guestName: true, guestPhone: true, checkIn: true, checkOut: true, status: true, totalPrice: true, complimentary: true, createdAt: true, checkedInAt: true, checkedOutAt: true, cancelledAt: true, room: { select: { name: true } } };

function shapeStay(s) {
  const checkInKey = dateKeyOf(s.checkIn);
  const checkOutKey = dateKeyOf(s.checkOut);
  return { ...s, checkIn: undefined, checkOut: undefined, checkInKey, checkOutKey, nights: nightsOf(checkInKey, checkOutKey) };
}

/** Accrual figures of a period (what the company statements add for a guest house). */
async function accrualParts(client, departmentId, fromKey, toKey, timeZone) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [stays, cancelled, movements] = await Promise.all([
    client.roomBooking.findMany({ where: { departmentId, status: { in: ["CHECKED_IN", "CHECKED_OUT"] }, complimentary: false, checkIn: { lte: dbDate(toKey) }, checkOut: { gt: dbDate(fromKey) } }, select: STAY_FIELDS }),
    client.roomBooking.findMany({ where: { departmentId, status: "CANCELLED", cancelledAt: { gte: start, lte: end } }, select: { id: true, roomId: true, referenceNo: true, guestName: true, cancelReason: true, cancelledAt: true } }),
    client.roomAssetMovement.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { kind: true, quantity: true, value: true, loss: true, cost: true, date: true, asset: { select: { roomId: true } } } }),
  ]);
  const money = cancelled.length ? await client.transaction.groupBy({ by: ["stayId", "type", "status"], where: { stayId: { in: cancelled.map((c) => c.id) }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, _sum: { amount: true } }) : [];
  const keptOf = (id) => bookingFigures({ agreedPrice: 0, status: "CANCELLED", money: money.filter((m) => m.stayId === id).map((m) => ({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) })) }).paid;
  const losses = {};
  for (const m of movements) losses[m.asset.roomId || ""] = (losses[m.asset.roomId || ""] || 0) + m.loss;
  return {
    stays: stays.map(shapeStay),
    cancelled: cancelled.map((c) => ({ ...c, kept: Math.max(0, keptOf(c.id)) })),
    losses,
    movements,
  };
}

/** Everything about the guest house for [fromKey, toKey] (`todayKey`: the business day now). */
export async function staysReport({ departmentId, organizationId, fromKey, toKey, timeZone, todayKey = toDateKey(new Date(), timeZone), client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const asOfKey = toKey < todayKey ? toKey : todayKey;
  const [rooms, parts, periodStays, transactions, handovers, receipts, counts, opening, drawer, register, movementsAfter, openRepairs, doneRepairs, balanceStays, unvalidated] = await Promise.all([
    client.room.findMany({ where: { departmentId }, orderBy: { name: "asc" } }),
    accrualParts(client, departmentId, fromKey, toKey, timeZone),
    // Bookings touching the period (any status) and those made, checked in/out or cancelled in it.
    client.roomBooking.findMany({
      where: { departmentId, OR: [{ checkIn: { lte: dbDate(toKey) }, checkOut: { gt: dbDate(fromKey) } }, { createdAt: { gte: start, lte: end } }, { checkedInAt: { gte: start, lte: end } }, { checkedOutAt: { gte: start, lte: end } }, { cancelledAt: { gte: start, lte: end } }] },
      select: STAY_FIELDS,
    }),
    client.transaction.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true, roomId: true, stayId: true, validatedAt: true } }),
    client.cashHandover.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { amount: true, status: true } }),
    client.transaction.groupBy({ by: ["receivedByName", "paymentMethod"], where: { departmentId, type: "BOOKING_PAYMENT", status: { not: "VOIDED" }, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } }),
    client.venueCashCount.findMany({ where: { departmentId, date: { gte: dbDate(fromKey), lte: dbDate(toKey) } }, orderBy: { date: "asc" } }),
    openingCashBefore(client, departmentId, start),
    drawerNow(client, { organizationId, departmentId, timeZone }),
    assetRegister({ departmentId, client }),
    client.roomAssetMovement.findMany({ where: { departmentId, date: { gt: rangeBounds(asOfKey, asOfKey, timeZone).end } }, select: { kind: true, value: true, loss: true } }),
    listRepairs({ departmentId, view: "open", client }),
    listRepairs({ departmentId, view: "done", fromKey, toKey, client }),
    // Bookings whose money may be owed or held ahead on asOfKey (not cancelled, not free, from the last 400 days).
    client.roomBooking.findMany({ where: { departmentId, status: { not: "CANCELLED" }, complimentary: false, checkIn: { lte: dbDate(addDaysToKey(asOfKey, 730)) }, checkOut: { gt: dbDate(addDaysToKey(asOfKey, -400)) } }, select: STAY_FIELDS, take: 3000 }),
    client.transaction.aggregate({ where: { departmentId, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" }, validatedAt: null }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  // Money of the bookings that may be owed, dated (what was paid by asOfKey).
  const balanceShaped = balanceStays.map(shapeStay);
  const bookingMoney = balanceShaped.length
    ? await client.transaction.findMany({ where: { stayId: { in: balanceShaped.map((s) => s.id) }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, select: { stayId: true, type: true, status: true, amount: true, date: true } })
    : [];
  const withMoney = balanceShaped.map((s) => ({ ...s, money: bookingMoney.filter((m) => m.stayId === s.id).map((m) => ({ type: m.type, status: m.status, amount: Number(m.amount), dateKey: toDateKey(m.date, timeZone) })) }));

  const money = summarizeMoney(transactions);
  const stays = periodStays.map(shapeStay);
  const nights = nightsRevenue(parts.stays, fromKey, toKey);
  const occ = occupancy(rooms.filter((r) => r.isActive), stays, fromKey, toKey, todayKey);
  const byRoom = moneyByRoom(transactions, CAPITAL_CATEGORIES);
  const profitability = apartmentProfitability({ rooms, nights, money: byRoom, cancellations: cancellationsByRoom(parts.cancelled), losses: parts.losses, occupancy: occ });
  // Apartments taken out of use with nothing in the period are not shown.
  profitability.rows = profitability.rows.filter((r) => rooms.find((x) => x.id === r.roomId)?.isActive || r.revenue || r.costs);
  const income = stayIncomeStatement({ profitability });
  const cashFlow = stayCashFlow({ opening, money, handovers });
  const verification = cashVerification({
    receipts: receipts.map((r) => ({ receivedBy: r.receivedByName, method: r.paymentMethod, amount: r._sum.amount, count: r._count._all })),
    counts: counts.map((c) => ({ dateKey: dateKeyOf(c.date), countedCash: c.countedCash, expectedCash: c.expectedCash, variance: c.variance, notes: c.notes })),
    cashFlow,
    drawerNow: drawer,
  });
  const balances = guestBalances(withMoney, asOfKey);
  const regTotals = registerTotals(register);
  const assetsValue = registerValueAt(regTotals.total.value, movementsAfter);
  const balanceSheet = stayBalanceSheet({ cash: toKey < todayKey ? cashFlow.closingCash : Math.round(drawer.shouldRemain), receivable: balances.receivable, assetsValue, advances: balances.advances });
  const keyOf = (v) => (v ? toDateKey(v, timeZone) : null);
  const activity = bookingActivity(stays, fromKey, toKey, keyOf);
  const nowStays = withMoney.filter((s) => s.checkInKey <= todayKey && todayKey < s.checkOutKey);
  const expenseCats = {};
  for (const t of transactions) {
    if (t.status === "VOIDED" || !["EXPENSE", "OTHER_EXPENSE"].includes(t.type) || CAPITAL_CATEGORIES.has(t.category)) continue;
    expenseCats[t.category] = (expenseCats[t.category] || 0) + Number(t.amount);
  }

  return {
    fromKey,
    toKey,
    todayKey,
    asOfKey,
    rooms: rooms.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive, state: r.state })),
    income,
    profitability,
    occupancy: occ,
    nightsByDay: Object.entries(nights.byDay).map(([dateKey, revenue]) => ({ dateKey, revenue })),
    nightsSold: nights.nights,
    cashFlow,
    verification,
    balances,
    balanceSheet,
    activity,
    cancellations: parts.cancelled,
    expensesByCategory: Object.entries(expenseCats).map(([category, amount]) => ({ category, label: categoryLabel(category) || "Uncategorized", amount })).sort((a, b) => b.amount - a.amount),
    assets: { register: regTotals, movements: movementTotals(parts.movements) },
    repairs: { ...repairTotals(openRepairs, doneRepairs), openList: openRepairs, doneList: doneRepairs },
    unvalidated: { count: unvalidated._count._all, amount: Math.round(Number(unvalidated._sum.amount || 0)) },
    now: {
      occupied: nowStays.filter((s) => s.status === "CHECKED_IN").length,
      arrivalsToday: withMoney.filter((s) => s.checkInKey === todayKey && ["RESERVED", "CONFIRMED"].includes(s.status)).length,
      departuresToday: withMoney.filter((s) => s.checkOutKey === todayKey && s.status === "CHECKED_IN").length,
      upcoming: withMoney.filter((s) => s.checkInKey > todayKey && ["RESERVED", "CONFIRMED"].includes(s.status)).length,
    },
    drawer,
  };
}

/**
 * Revenue, kept cancellations and losses per guest house department (company statements);
 * `days`: the same by date key (charts of the Boss's overview).
 */
export async function stayStatementFigures({ departments, fromKey, toKey, timeZone, client = db }) {
  const out = {};
  await Promise.all(
    departments
      .filter((d) => d.domain === "ROOM_RENTAL")
      .map(async (d) => {
        const p = await accrualParts(client, d.id, fromKey, toKey, timeZone);
        const nights = nightsRevenue(p.stays, fromKey, toKey);
        const days = {};
        const day = (k) => (days[k] ||= { revenue: 0, assetLosses: 0 });
        for (const [k, v] of Object.entries(nights.byDay)) if (v) day(k).revenue += v;
        for (const c of p.cancelled) day(toDateKey(c.cancelledAt, timeZone)).revenue += c.kept;
        for (const m of p.movements) if (m.loss) day(toDateKey(m.date, timeZone)).assetLosses += m.loss;
        out[d.id] = {
          staysRevenue: nights.total,
          cancellationIncome: p.cancelled.reduce((s, c) => s + c.kept, 0),
          assetLosses: Object.values(p.losses).reduce((s, v) => s + v, 0),
          days,
        };
      })
  );
  return out;
}

/** The key figures of a guest house for a period (the Boss's overview of every department). */
export async function staySummary({ department, organizationId, fromKey, toKey, timeZone, client = db }) {
  const r = await staysReport({ departmentId: department.id, organizationId, fromKey, toKey, timeZone, client });
  return {
    revenue: r.income.revenue,
    costs: r.income.costs,
    result: r.income.result,
    nightsRevenue: r.income.nightsRevenue,
    cancellationIncome: r.income.cancellationIncome,
    assetLosses: r.income.assetLosses,
    receivedFromClients: r.cashFlow.receivedFromClients,
    handedOver: r.cashFlow.handedOver,
    toHandOver: r.verification.toHandOver,
    outstanding: r.balances.owedTotal,
    discrepancies: r.verification.discrepancies,
    occupied: r.now.occupied,
    apartments: r.rooms.filter((x) => x.isActive).length,
    pendingRepairs: r.repairs.pending,
    unvalidated: r.unvalidated.count,
    best: r.profitability.best ? { name: r.profitability.best.name, revenue: r.profitability.best.revenue } : null,
  };
}

/**
 * What the ledger recognizes for [fromKey, toKey] (lib/accounting): the nights of each stay in the
 * period (dated on its last night in it), the money kept from each cancelled booking, each asset
 * lost. Same sources as stayStatementFigures, one fact per stay or movement.
 */
export async function stayRecognitions({ department, fromKey, toKey, timeZone, client = db }) {
  const p = await accrualParts(client, department.id, fromKey, toKey, timeZone);
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const lost = await client.roomAssetMovement.findMany({ where: { departmentId: department.id, date: { gte: start, lte: end }, loss: { gt: 0 } }, select: { id: true, loss: true, date: true, asset: { select: { name: true } } } });
  const departmentId = department.id;
  const out = [];
  for (const s of p.stays) {
    const r = stayRevenueBetween(s, fromKey, toKey);
    if (!r.revenue) continue;
    const lastNight = addDaysToKey(s.checkOutKey, -1);
    out.push({ sourceKey: `stay-nights:${s.id}:${fromKey.slice(0, 7)}`, kind: "revenue", role: "NIGHTS", dateKey: lastNight < toKey ? lastNight : toKey, amount: r.revenue, partner: { key: `stay:${s.id}`, name: s.guestName }, label: `${r.nights} night(s) · ${s.room?.name || ""} · ${s.guestName}`, reference: s.referenceNo, departmentId });
  }
  for (const c of p.cancelled) if (c.kept > 0) out.push({ sourceKey: `stay-kept:${c.id}`, kind: "revenue", role: "KEPT", dateKey: toDateKey(c.cancelledAt, timeZone), amount: c.kept, partner: { key: `stay:${c.id}`, name: c.guestName }, label: `Kept on cancellation · ${c.guestName}`, reference: c.referenceNo, departmentId });
  for (const m of lost) out.push({ sourceKey: `stay-loss:${m.id}`, kind: "loss", assetRole: "FURNITURE", dateKey: toDateKey(m.date, timeZone), amount: m.loss, label: `Asset lost · ${m.asset?.name || ""}`, departmentId });
  return out;
}
