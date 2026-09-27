/**
 * Financial statements for any period and any set of departments:
 *   income statement (money in / money out / result), cash movement, stock movement, debts,
 *   plus a day-by-day series and a per-department breakdown.
 * Built from the live ledger — the same records the daily reports are made of — so the sum
 * of the daily reports always equals the statement. Coverage says how many of those days
 * the Boss has approved ("Final" when all are).
 */
import { db } from "@/lib/prisma";
import { rangeBounds, listDateKeys, toDateKey, startOfDateKey, previousRange, periodRange, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { summarizeMoney, sumHandovers, debtStatus, pctChange } from "@/lib/finance/money-math";
import { openingCashBefore } from "@/lib/finance/posting-service";
import { dayPositionsFromCurrent, valuePositions } from "@/lib/restaurant/stock-math";
import { roundMoney } from "@/lib/money";
import { categoryLabel } from "@/data/categories";

async function moneyFor(client, { organizationId, departmentIds, start, end }) {
  const transactions = await client.transaction.findMany({
    where: { organizationId, departmentId: { in: departmentIds }, date: { gte: start, lte: end } },
    select: { id: true, type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true, date: true, departmentId: true },
  });
  return transactions;
}

async function stockFor(client, { departmentIds, start, end }) {
  const dishes = await client.menuItem.findMany({
    where: { departmentId: { in: departmentIds }, createdAt: { lte: end } },
    select: { id: true, name: true, sellingPrice: true, costPrice: true, currentQuantity: true, isActive: true, archivedAt: true, lowStockLevel: true, departmentId: true, createdAt: true },
    orderBy: { name: "asc" },
  });
  const movements = await client.stockMovement.findMany({
    where: { menuItemId: { in: dishes.map((d) => d.id) }, date: { gte: start } },
    select: { menuItemId: true, type: true, quantity: true, date: true },
  });
  const positions = dayPositionsFromCurrent(dishes, movements, start, end).map((p, i) => ({ ...p, departmentId: dishes[i].departmentId }));
  const relevant = positions.filter((p) => p.isActive || p.opening || p.added || p.sold || p.closing);
  return valuePositions(relevant);
}

async function debtsFor(client, { organizationId, departmentIds, start, end, timeZone }) {
  const where = { organizationId, departmentId: { in: departmentIds } };
  const [owedBefore, paidBefore, created, payments, openAtEnd] = await Promise.all([
    client.debt.aggregate({ where: { ...where, date: { lt: start }, status: { not: "CANCELLED" } }, _sum: { amountOwed: true } }),
    client.debtPayment.aggregate({ where: { ...where, date: { lt: start }, voidedAt: null, debt: { status: { not: "CANCELLED" } } }, _sum: { amount: true } }),
    client.debt.findMany({ where: { ...where, date: { gte: start, lte: end }, status: { not: "CANCELLED" } }, select: { amountOwed: true, source: true } }),
    client.debtPayment.aggregate({ where: { ...where, date: { gte: start, lte: end }, voidedAt: null, debt: { status: { not: "CANCELLED" } } }, _sum: { amount: true } }),
    client.debt.findMany({
      where: { ...where, date: { lte: end }, status: { in: ["UNPAID", "PARTIALLY_PAID"] } },
      select: { id: true, referenceNo: true, debtorName: true, amountOwed: true, amountPaid: true, date: true, departmentId: true },
    }),
  ]);
  const opening = roundMoney(owedBefore._sum.amountOwed || 0) - roundMoney(paidBefore._sum.amount || 0);
  const given = created.filter((d) => d.source !== "OPENING_BALANCE").reduce((s, d) => s + roundMoney(d.amountOwed), 0);
  const oldAdded = created.filter((d) => d.source === "OPENING_BALANCE").reduce((s, d) => s + roundMoney(d.amountOwed), 0);
  const repaid = roundMoney(payments._sum.amount || 0);
  const endKey = toDateKey(end, timeZone);
  const buckets = { "0-7": 0, "8-30": 0, "31-60": 0, "60+": 0 };
  const byDebtor = new Map();
  for (const d of openAtEnd) {
    const bal = debtStatus(d.amountOwed, d.amountPaid).balance;
    if (bal <= 0) continue;
    const age = Math.round((startOfDateKey(endKey, timeZone) - startOfDateKey(toDateKey(d.date, timeZone), timeZone)) / 86400000);
    const b = age <= 7 ? "0-7" : age <= 30 ? "8-30" : age <= 60 ? "31-60" : "60+";
    buckets[b] += bal;
    byDebtor.set(d.debtorName, (byDebtor.get(d.debtorName) || 0) + bal);
  }
  return {
    opening,
    given,
    oldAdded,
    repaid,
    closing: opening + given + oldAdded - repaid,
    ageing: buckets,
    topDebtors: [...byDebtor.entries()].map(([name, balance]) => ({ name, balance })).sort((a, b) => b.balance - a.balance).slice(0, 10),
  };
}

async function coverageFor(client, { organizationId, departments, fromKey, toKey, timeZone }) {
  const restaurantIds = departments.filter((d) => d.domain === "RESTAURANT").map((d) => d.id);
  const today = toDateKey(new Date(), timeZone);
  const days = listDateKeys(fromKey, toKey < today ? toKey : today);
  const reports = await client.dailyReport.findMany({
    where: { organizationId, departmentId: { in: restaurantIds }, reportDate: { gte: startOfDateKey(fromKey, timeZone), lte: startOfDateKey(toKey, timeZone) } },
    select: { status: true, departmentId: true, reportDate: true },
  });
  const expected = days.length * restaurantIds.length;
  const approved = reports.filter((r) => r.status === "APPROVED").length;
  const sent = reports.filter((r) => ["SUBMITTED", "REVIEWED", "APPROVED"].includes(r.status)).length;
  return { expected, approved, sent, final: expected > 0 && approved === expected };
}

/** Builds every statement for `departments` (objects with id, name, domain) over [fromKey, toKey]. */
export async function buildStatements({ organizationId, departments, fromKey, toKey, timeZone = DEFAULT_TIMEZONE, compare = true, client = db }) {
  const departmentIds = departments.map((d) => d.id);
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [transactions, handovers, stock, debts, coverage, openingCashes] = await Promise.all([
    moneyFor(client, { organizationId, departmentIds, start, end }),
    client.cashHandover.findMany({ where: { organizationId, departmentId: { in: departmentIds }, date: { gte: start, lte: end } }, select: { amount: true, status: true, departmentId: true } }),
    stockFor(client, { departmentIds, start, end }),
    debtsFor(client, { organizationId, departmentIds, start, end, timeZone }),
    coverageFor(client, { organizationId, departments, fromKey, toKey, timeZone }),
    Promise.all(departmentIds.map((id) => openingCashBefore(client, id, start))),
  ]);

  const money = summarizeMoney(transactions);
  const openingCash = openingCashes.reduce((s, v) => s + v, 0);
  const handedOver = sumHandovers(handovers);
  const cash = {
    opening: openingCash,
    cashIn: money.cash.in,
    cashOut: money.cash.out,
    expected: openingCash + money.cash.in - money.cash.out,
    handedOver,
    confirmed: roundMoney(handovers.filter((h) => h.status === "CONFIRMED").reduce((s, h) => s + roundMoney(h.amount), 0)),
    pending: roundMoney(handovers.filter((h) => h.status === "RECORDED").reduce((s, h) => s + roundMoney(h.amount), 0)),
    disputed: roundMoney(handovers.filter((h) => h.status === "DISPUTED").reduce((s, h) => s + roundMoney(h.amount), 0)),
    closing: openingCash + money.cash.in - money.cash.out - handedOver,
    receivedByMethod: money.receivedByMethod,
    paidByMethod: money.paidByMethod,
  };

  // Day-by-day series (for charts) and per-department breakdown.
  const byDay = new Map(listDateKeys(fromKey, toKey).map((k) => [k, []]));
  const byDept = new Map(departmentIds.map((id) => [id, []]));
  for (const t of transactions) {
    byDay.get(toDateKey(t.date, timeZone))?.push(t);
    byDept.get(t.departmentId)?.push(t);
  }
  const series = [...byDay.entries()].map(([dateKey, list]) => {
    const m = summarizeMoney(list);
    return { dateKey, moneyIn: m.moneyIn, moneyOut: m.moneyOut, result: m.result, salesGross: m.salesGross };
  });
  const perDepartment = departments.map((d) => {
    const m = summarizeMoney(byDept.get(d.id) || []);
    const deptStock = stock.rows.filter((r) => r.departmentId === d.id);
    return {
      id: d.id,
      name: d.name,
      domain: d.domain,
      moneyIn: m.moneyIn,
      moneyOut: m.moneyOut,
      result: m.result,
      salesGross: m.salesGross,
      stockValue: deptStock.reduce((s, r) => s + r.value, 0),
      handedOver: sumHandovers(handovers.filter((h) => h.departmentId === d.id)),
    };
  });

  const topDishes = [...stock.rows].filter((r) => r.sold > 0).sort((a, b) => b.soldValue - a.soldValue).slice(0, 10);
  const unsold = stock.rows.filter((r) => r.isActive && r.sold === 0);

  let previous = null;
  if (compare) {
    const month = periodRange("month", fromKey);
    const fullMonth = month.fromKey === fromKey && month.toKey === toKey;
    const prevRange = previousRange(fromKey, toKey, fullMonth ? "month" : "span");
    const p = rangeBounds(prevRange.fromKey, prevRange.toKey, timeZone);
    const prevTx = await moneyFor(client, { organizationId, departmentIds, start: p.start, end: p.end });
    const pm = summarizeMoney(prevTx);
    previous = { fromKey: prevRange.fromKey, toKey: prevRange.toKey, money: pm };
  }

  const income = {
    salesGross: money.salesGross,
    rentIncome: money.rentIncome,
    otherIncome: money.otherIncome,
    moneyIn: money.moneyIn,
    discounts: money.discounts,
    purchases: money.purchases,
    expenses: money.expenses,
    otherExpenses: money.otherExpenses,
    moneyOut: money.moneyOut,
    result: money.result,
    netSales: money.netSales,
    margin: money.moneyIn ? Math.round((money.result / money.moneyIn) * 1000) / 10 : null,
    expensesByCategory: Object.entries(money.expensesByCategory).map(([k, v]) => ({ label: categoryLabel(k), amount: v })).sort((a, b) => b.amount - a.amount),
    otherExpensesByCategory: Object.entries(money.otherExpensesByCategory).map(([k, v]) => ({ label: categoryLabel(k), amount: v })).sort((a, b) => b.amount - a.amount),
  };
  if (previous) {
    const pm = previous.money;
    income.previous = {
      salesGross: pm.salesGross, rentIncome: pm.rentIncome, otherIncome: pm.otherIncome, moneyIn: pm.moneyIn,
      discounts: pm.discounts, purchases: pm.purchases, expenses: pm.expenses, otherExpenses: pm.otherExpenses,
      moneyOut: pm.moneyOut, result: pm.result, netSales: pm.netSales,
    };
    income.change = Object.fromEntries(Object.keys(income.previous).map((k) => [k, pctChange(income[k], income.previous[k])]));
  }

  return {
    fromKey,
    toKey,
    previous: previous ? { fromKey: previous.fromKey, toKey: previous.toKey } : null,
    coverage,
    income,
    cash,
    stock: { rows: stock.rows, totals: stock.totals, showSpoiled: stock.showSpoiled, showCorrected: stock.showCorrected, topDishes, unsold },
    debts,
    series,
    perDepartment,
    counts: { records: money.count, voided: money.voided },
  };
}
