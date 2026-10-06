/**
 * An event rental department's report for any period (a day, a week, a month …): the Reports
 * page, the dashboard, the automatic daily / weekly / monthly reports, the company statements and
 * the Boss's overview all read it, so they always agree. Definitions: lib/rental/report-math.js.
 */
import { db } from "@/lib/prisma";
import { summarizeMoney } from "@/lib/finance/money-math";
import { drawerNow, openingCashBefore } from "@/lib/finance/posting-service";
import { CAPITAL_CATEGORIES, categoryLabel } from "@/data/categories";
import { addDaysToKey, listDateKeys, rangeBounds, toDateKey } from "@/lib/timezone";
import { bookingFigures } from "@/lib/finance/booking-money";
import { cashVerification } from "@/lib/departments/cash-verification";
import { assetBookValue, assetRegister, depreciationOfPeriod, registerTotals } from "@/lib/assets/asset-queries";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { stockSheet, stockTotals } from "./item-queries";
import { REVENUE_STATUSES, customerBalances, customerSpending, eventProfitability, itemAnalysis, rentalBalanceSheet, rentalCashFlow, rentalIncomeStatement, stockValueFromLedger } from "./report-math";

const int = (v) => Math.round(Number(v) || 0);
const LOSS_MOVES = { OR: [{ kind: "WRITTEN_OFF" }, { kind: "ADJUSTED", dOwned: { lt: 0 }, purchaseId: null }] };

/** Revenue facts of [fromKey, toKey]: events held, charges, money kept from cancellations, items lost. */
async function accrualParts(client, departmentId, fromKey, toKey, timeZone) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [events, charges, cancelled, losses] = await Promise.all([
    client.rentalOrder.findMany({ where: { departmentId, status: { in: REVENUE_STATUSES }, eventDate: { gte: dbDate(fromKey), lte: dbDate(toKey) } }, select: { id: true, referenceNo: true, eventType: true, eventDate: true, dispatchDate: true, returnDate: true, agreedPrice: true, status: true, client: { select: { name: true } }, lines: { where: { kind: "ITEM" }, select: { itemId: true, quantity: true, total: true } } } }),
    client.rentalCharge.findMany({ where: { departmentId, voidedAt: null, date: { gte: start, lte: end }, order: { status: { not: "CANCELLED" } } }, select: { orderId: true, amount: true, date: true, kind: true } }),
    client.rentalOrder.findMany({ where: { departmentId, status: "CANCELLED", cancelledAt: { gte: start, lte: end } }, select: { id: true, referenceNo: true, cancelledAt: true, cancelReason: true, client: { select: { name: true } } } }),
    client.rentalMovement.findMany({ where: { departmentId, date: { gte: start, lte: end }, ...LOSS_MOVES }, select: { itemId: true, orderId: true, value: true, date: true } }),
  ]);
  const money = cancelled.length ? await client.transaction.groupBy({ by: ["rentalOrderId", "type", "status"], where: { rentalOrderId: { in: cancelled.map((c) => c.id) }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, _sum: { amount: true } }) : [];
  const keptOf = (id) => bookingFigures({ agreedPrice: 0, status: "CANCELLED", money: money.filter((m) => m.rentalOrderId === id).map((m) => ({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) })) }).paid;
  return {
    events: events.map((e) => ({ ...e, eventDateKey: dateKeyOf(e.eventDate), dispatchDateKey: dateKeyOf(e.dispatchDate), returnDateKey: dateKeyOf(e.returnDate) })),
    charges,
    cancelled: cancelled.map((c) => ({ ...c, kept: Math.max(0, keptOf(c.id)) })),
    losses,
  };
}

/**
 * The full report of a period: income statement, event profitability, cash flow and cash
 * verification, customers' balances, balance sheet, activity (bookings, items out and back,
 * damages, purchases), item and customer analysis, assets and depreciation.
 */
export async function rentalReport({ departmentId, organizationId, fromKey, toKey, timeZone, todayKey = toDateKey(new Date(), timeZone), client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const asOfKey = toKey < todayKey ? toKey : todayKey;
  const asOfEnd = rangeBounds(asOfKey, asOfKey, timeZone).end;
  const [parts, transactions, handovers, receipts, counts, opening, drawer, dep, created, moves, incidents, balanceOrders, ledger, assets, items, unvalidated] = await Promise.all([
    accrualParts(client, departmentId, fromKey, toKey, timeZone),
    client.transaction.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true, rentalOrderId: true } }),
    client.cashHandover.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { amount: true, status: true } }),
    client.transaction.groupBy({ by: ["receivedByName", "paymentMethod"], where: { departmentId, type: "BOOKING_PAYMENT", status: { not: "VOIDED" }, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } }),
    client.venueCashCount.findMany({ where: { departmentId, date: { gte: dbDate(fromKey), lte: dbDate(toKey) } }, orderBy: { date: "asc" } }),
    openingCashBefore(client, departmentId, start),
    drawerNow(client, { organizationId, departmentId, timeZone }),
    depreciationOfPeriod({ departmentId, fromKey, toKey, client }),
    client.rentalOrder.findMany({ where: { departmentId, createdAt: { gte: start, lte: end } }, select: { status: true, agreedPrice: true, clientId: true } }),
    client.rentalMovement.groupBy({ by: ["kind"], where: { departmentId, date: { gte: start, lte: end }, kind: { in: ["ISSUED", "RETURNED", "PURCHASED"] } }, _sum: { quantity: true, value: true } }),
    client.rentalIncident.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { kind: true, quantity: true, estimatedLoss: true, repairCost: true, status: true, itemId: true, item: { select: { name: true } } } }),
    client.rentalOrder.findMany({ where: { departmentId, status: { not: "CANCELLED" }, eventDate: { gte: dbDate(addDaysToKey(asOfKey, -400)) } }, select: { id: true, referenceNo: true, status: true, eventType: true, eventDate: true, paymentDueDate: true, agreedPrice: true, client: { select: { name: true, phone: true } } }, take: 5000 }),
    client.rentalMovement.findMany({ where: { departmentId, date: { lte: asOfEnd }, dOwned: { not: 0 } }, select: { dOwned: true, value: true } }),
    assetRegister({ departmentId, asOfKey, status: "all", client }),
    stockSheet({ departmentId, status: "all", client }),
    client.transaction.aggregate({ where: { departmentId, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" }, validatedAt: null, NOT: { category: "rental-stock" } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);

  // Money, charges and expenses of the events of the period (whenever they were recorded).
  const eventIds = parts.events.map((e) => e.id);
  const balanceIds = balanceOrders.map((o) => o.id);
  const [eventCharges, eventExpenses, eventLosses, orderMoney, orderCharges] = await Promise.all([
    eventIds.length ? client.rentalCharge.findMany({ where: { orderId: { in: eventIds } }, select: { orderId: true, amount: true, voidedAt: true } }) : [],
    eventIds.length ? client.transaction.findMany({ where: { rentalOrderId: { in: eventIds }, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" }, NOT: { category: "rental-stock" } }, select: { rentalOrderId: true, amount: true, category: true } }) : [],
    eventIds.length ? client.rentalMovement.findMany({ where: { orderId: { in: eventIds }, kind: "WRITTEN_OFF" }, select: { orderId: true, value: true } }) : [],
    balanceIds.length ? client.transaction.findMany({ where: { rentalOrderId: { in: balanceIds }, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, select: { rentalOrderId: true, type: true, status: true, amount: true, date: true } }) : [],
    balanceIds.length ? client.rentalCharge.findMany({ where: { orderId: { in: balanceIds }, voidedAt: null }, select: { orderId: true, amount: true } }) : [],
  ]);

  const money = summarizeMoney(transactions);
  const repairs = transactions.filter((t) => t.status !== "VOIDED" && t.category === "rental-repairs").reduce((s, t) => s + int(t.amount), 0);
  const eventsRevenue = parts.events.reduce((s, e) => s + e.agreedPrice, 0);
  const chargesRevenue = parts.charges.reduce((s, c) => s + c.amount, 0);
  const kept = parts.cancelled.reduce((s, c) => s + c.kept, 0);
  const losses = parts.losses.reduce((s, m) => s + m.value, 0);
  const income = rentalIncomeStatement({ eventsRevenue, chargesRevenue, kept, money, repairs, losses, depreciation: dep.depreciation, disposals: dep.disposals });

  const profitability = eventProfitability({
    orders: parts.events,
    charges: eventCharges,
    expenses: eventExpenses.map((e) => ({ ...e, amount: Number(e.amount), categoryLabel: categoryLabel(e.category) })),
    writeOffs: eventLosses,
  });

  const cashFlow = rentalCashFlow({ opening, money, handovers });
  const verification = cashVerification({
    receipts: receipts.map((r) => ({ receivedBy: r.receivedByName, method: r.paymentMethod, amount: r._sum.amount, count: r._count._all })),
    counts: counts.map((c) => ({ dateKey: dateKeyOf(c.date), countedCash: c.countedCash, expectedCash: c.expectedCash, variance: c.variance, notes: c.notes })),
    cashFlow,
    drawerNow: drawer,
  });

  const balances = customerBalances(
    balanceOrders.map((o) => ({
      ...o,
      eventDateKey: dateKeyOf(o.eventDate),
      paymentDueDateKey: dateKeyOf(o.paymentDueDate),
      charges: orderCharges.filter((c) => c.orderId === o.id),
      money: orderMoney.filter((m) => m.rentalOrderId === o.id).map((m) => ({ type: m.type, status: m.status, amount: Number(m.amount), dateKey: toDateKey(m.date, timeZone) })),
    })),
    asOfKey,
    todayKey
  );

  const regTotals = registerTotals(assets.filter((a) => !a.disposedOnKey || a.disposedOnKey > asOfKey));
  const assetsInStock = assets.filter((a) => a.rentalItemId && (!a.disposedOnKey || a.disposedOnKey > asOfKey) && a.purchaseDateKey <= asOfKey).reduce((s, a) => s + a.cost, 0);
  const assetsBookValue = await assetBookValue({ departmentId, asOfKey, client });
  const stockValue = stockValueFromLedger(ledger);
  const balanceSheet = rentalBalanceSheet({ cash: toKey < todayKey ? cashFlow.closingCash : Math.round(drawer.shouldRemain), receivable: balances.receivable, stockValue, assetsInStock, assetsBookValue, advances: balances.advances });

  const moved = Object.fromEntries(moves.map((m) => [m.kind, { units: int(m._sum.quantity), value: int(m._sum.value) }]));
  const incidentTotals = { DAMAGED: 0, BROKEN: 0, MISSING: 0, value: 0, repairCost: 0, open: 0 };
  for (const i of incidents) {
    incidentTotals[i.kind] += i.quantity;
    incidentTotals.value += i.estimatedLoss;
    incidentTotals.repairCost += i.repairCost;
    if (i.status === "OPEN") incidentTotals.open += 1;
  }
  const expenseCats = {};
  for (const t of transactions) {
    if (t.status === "VOIDED" || !["EXPENSE", "OTHER_EXPENSE"].includes(t.type) || CAPITAL_CATEGORIES.has(t.category)) continue;
    expenseCats[t.category] = (expenseCats[t.category] || 0) + Number(t.amount);
  }
  const lines = parts.events.flatMap((e) => e.lines.map((l) => ({ ...l, orderId: e.id, dispatchDateKey: e.dispatchDateKey, returnDateKey: e.returnDateKey })));
  const analysis = itemAnalysis({
    items: items.filter((i) => !i.archivedAt),
    lines,
    writeOffs: parts.losses,
    repairs: incidents.filter((i) => i.repairCost).map((i) => ({ itemId: i.itemId, cost: i.repairCost })),
    fromKey,
    toKey,
  });
  const revenueByDay = Object.fromEntries(listDateKeys(fromKey, toKey).map((k) => [k, 0]));
  for (const e of parts.events) if (e.eventDateKey in revenueByDay) revenueByDay[e.eventDateKey] += e.agreedPrice;
  for (const c of parts.charges) {
    const k = toDateKey(c.date, timeZone);
    if (k in revenueByDay) revenueByDay[k] += c.amount;
  }
  for (const c of parts.cancelled) {
    const k = toDateKey(c.cancelledAt, timeZone);
    if (k in revenueByDay) revenueByDay[k] += c.kept;
  }
  const stock = stockTotals(items.filter((i) => !i.archivedAt));

  return {
    fromKey,
    toKey,
    todayKey,
    asOfKey,
    income,
    profitability,
    cashFlow,
    verification,
    balances,
    balanceSheet,
    activity: {
      newBookings: created.length,
      newBookingsValue: created.filter((o) => o.status !== "CANCELLED").reduce((s, o) => s + o.agreedPrice, 0),
      confirmed: created.filter((o) => REVENUE_STATUSES.includes(o.status)).length,
      events: parts.events.length,
      cancelled: parts.cancelled.length,
      customers: new Set(created.map((o) => o.clientId)).size,
      unitsOut: moved.ISSUED?.units || 0,
      unitsBack: moved.RETURNED?.units || 0,
      unitsBought: moved.PURCHASED?.units || 0,
      purchases: money.assetPurchases,
    },
    incidents: incidentTotals,
    incidentList: incidents,
    cancellations: parts.cancelled,
    expensesByCategory: Object.entries(expenseCats).map(([category, amount]) => ({ category, label: categoryLabel(category) || "Uncategorized", amount })).sort((a, b) => b.amount - a.amount),
    items: analysis,
    customers: customerSpending(profitability.rows),
    revenueByDay: Object.entries(revenueByDay).map(([dateKey, revenue]) => ({ dateKey, revenue })),
    stock,
    assets: { ...regTotals, depreciation: dep.depreciation, disposals: dep.disposals },
    unvalidated: { count: unvalidated._count._all, amount: int(unvalidated._sum.amount) },
    drawer,
  };
}

/**
 * Revenue, kept cancellations, losses and depreciation per event rental department (company
 * statements); `days`: by date key (charts of the Boss's overview).
 */
export async function rentalStatementFigures({ departments, fromKey, toKey, timeZone, client = db }) {
  const out = {};
  await Promise.all(
    departments
      .filter((d) => d.domain === "MATERIAL_RENTAL")
      .map(async (d) => {
        const [p, dep] = await Promise.all([accrualParts(client, d.id, fromKey, toKey, timeZone), depreciationOfPeriod({ departmentId: d.id, fromKey, toKey, client })]);
        const days = {};
        const day = (k) => (days[k] ||= { revenue: 0, assetLosses: 0 });
        for (const e of p.events) day(e.eventDateKey).revenue += e.agreedPrice;
        for (const c of p.charges) day(toDateKey(c.date, timeZone)).revenue += c.amount;
        for (const c of p.cancelled) day(toDateKey(c.cancelledAt, timeZone)).revenue += c.kept;
        for (const m of p.losses) day(toDateKey(m.date, timeZone)).assetLosses += m.value;
        out[d.id] = {
          eventsRevenue: p.events.reduce((s, e) => s + e.agreedPrice, 0) + p.charges.reduce((s, c) => s + c.amount, 0),
          cancellationIncome: p.cancelled.reduce((s, c) => s + c.kept, 0),
          assetLosses: p.losses.reduce((s, m) => s + m.value, 0) + Math.max(0, -dep.disposals),
          depreciation: dep.depreciation,
          assetGains: Math.max(0, dep.disposals),
          days,
        };
      })
  );
  return out;
}

/** The key figures of an event rental department for a period (the Boss's overview). */
export async function rentalSummary({ department, organizationId, fromKey, toKey, timeZone, client = db }) {
  const r = await rentalReport({ departmentId: department.id, organizationId, fromKey, toKey, timeZone, client });
  return {
    revenue: r.income.revenue,
    costs: r.income.costs,
    result: r.income.result,
    events: r.activity.events,
    receivedFromClients: r.cashFlow.receivedFromClients,
    handedOver: r.cashFlow.handedOver,
    toHandOver: r.verification.toHandOver,
    outstanding: r.balances.owedTotal,
    overdue: r.balances.overdue,
    discrepancies: r.verification.discrepancies,
    unitsOut: r.stock.out,
    openIncidents: r.incidents.open,
    unvalidated: r.unvalidated.count,
    best: r.profitability.rows[0] ? { name: `${r.profitability.rows[0].referenceNo} · ${r.profitability.rows[0].client}`, revenue: r.profitability.rows[0].profit } : null,
  };
}

/** Month by month over the last `months` months to `toKey`: revenue, expenses, profit, events. */
export async function rentalTrends({ department, toKey, months = 12, timeZone, client = db }) {
  let [y, m] = toKey.split("-").map(Number);
  const keys = [];
  for (let i = 0; i < months; i++) {
    keys.unshift(`${y}-${String(m).padStart(2, "0")}`);
    m -= 1;
    if (m === 0) {
      m = 12;
      y -= 1;
    }
  }
  return Promise.all(
    keys.map(async (mk) => {
      const fromKey = `${mk}-01`;
      const last = new Date(Date.UTC(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0)).getUTCDate();
      const end = `${mk}-${String(last).padStart(2, "0")}`;
      const { start, end: endAt } = rangeBounds(fromKey, end, timeZone);
      const [p, tx, dep] = await Promise.all([
        accrualParts(client, department.id, fromKey, end, timeZone),
        client.transaction.findMany({ where: { departmentId: department.id, date: { gte: start, lte: endAt } }, select: { type: true, amount: true, status: true, category: true, paymentMethod: true } }),
        depreciationOfPeriod({ departmentId: department.id, fromKey, toKey: end, client }),
      ]);
      const money = summarizeMoney(tx);
      const inc = rentalIncomeStatement({ eventsRevenue: p.events.reduce((s, e) => s + e.agreedPrice, 0), chargesRevenue: p.charges.reduce((s, c) => s + c.amount, 0), kept: p.cancelled.reduce((s, c) => s + c.kept, 0), money, losses: p.losses.reduce((s, x) => s + x.value, 0), depreciation: dep.depreciation, disposals: dep.disposals });
      return { monthKey: mk, revenue: inc.revenue, costs: inc.costs, expenses: inc.expenses + inc.repairs, result: inc.result, events: p.events.length };
    })
  );
}
