/**
 * The daily report of a restaurant department (schema version 2). It is always available
 * live, printable at any time, and frozen as a snapshot when the department head sends it
 * to the Boss. Every figure comes from the shared money / stock arithmetic.
 */
import { db } from "@/lib/prisma";
import { dayBounds, startOfDateKey, formatTimeInZone, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { summarizeMoney, cashDrawer, debtMovement, debtStatus, TYPE_LABELS, METHOD_LABELS } from "@/lib/finance/money-math";
import { openingCashBefore } from "@/lib/finance/posting-service";
import { loadDayStock } from "@/lib/restaurant/stock-service";
import { roundMoney } from "@/lib/money";
import { categoryLabel } from "@/data/categories";

export const REPORT_SCHEMA_VERSION = 2;

const STOCK_LABELS = {
  OPENING: "New dish (opening plates)",
  STOCK_ADDED: "Stock added",
  PREPARATION: "Stock added",
  CORRECTION: "Count corrected",
  ADJUSTMENT: "Count corrected",
  SPOILED: "Spoiled",
  WASTE: "Spoiled",
  DAMAGE: "Spoiled",
  OPENING_CORRECTION: "Opening stock set",
  REVERSAL: "Reversal",
};
export const LOCKED_STATUSES = ["SUBMITTED", "REVIEWED", "APPROVED"];

/** Debts: outstanding before `start`, and the day's movements. Cancelled debts are excluded. */
async function debtSection(client, { organizationId, departmentId, start, end, timeZone }) {
  const [before, paymentsBefore, newDebts, repayments] = await Promise.all([
    client.debt.aggregate({ where: { organizationId, departmentId, date: { lt: start }, status: { not: "CANCELLED" } }, _sum: { amountOwed: true } }),
    client.debtPayment.aggregate({ where: { organizationId, departmentId, date: { lt: start }, voidedAt: null, debt: { status: { not: "CANCELLED" } } }, _sum: { amount: true } }),
    client.debt.findMany({ where: { organizationId, departmentId, date: { gte: start, lte: end }, status: { not: "CANCELLED" } }, orderBy: { date: "asc" }, include: { transaction: { select: { referenceNo: true } } } }),
    client.debtPayment.findMany({ where: { organizationId, departmentId, date: { gte: start, lte: end }, voidedAt: null }, orderBy: { date: "asc" }, include: { debt: { select: { debtorName: true, referenceNo: true } }, transaction: { select: { referenceNo: true } } } }),
  ]);
  const opening = roundMoney(before._sum.amountOwed || 0) - roundMoney(paymentsBefore._sum.amount || 0);
  const given = newDebts.filter((d) => d.source !== "OPENING_BALANCE").reduce((s, d) => s + roundMoney(d.amountOwed), 0);
  const oldAdded = newDebts.filter((d) => d.source === "OPENING_BALANCE").reduce((s, d) => s + roundMoney(d.amountOwed), 0);
  const repaid = repayments.filter((p) => p.debt).reduce((s, p) => s + roundMoney(p.amount), 0);
  return {
    ...debtMovement({ opening, given, oldAdded, repaid }),
    newDebts: newDebts.map((d) => ({
      id: d.id,
      referenceNo: d.referenceNo,
      saleReference: d.transaction?.referenceNo || null,
      time: formatTimeInZone(d.date, timeZone),
      debtor: d.debtorName,
      source: d.source,
      description: d.foodDescription,
      amount: roundMoney(d.amountOwed),
      balance: debtStatus(d.amountOwed, d.amountPaid).balance,
    })),
    repayments: repayments.map((p) => ({
      id: p.id,
      referenceNo: p.transaction?.referenceNo || null,
      debtReference: p.debt?.referenceNo || null,
      time: formatTimeInZone(p.date, timeZone),
      debtor: p.debt?.debtorName,
      method: METHOD_LABELS[p.paymentMethod] || p.paymentMethod,
      amount: roundMoney(p.amount),
    })),
  };
}

/**
 * Builds the complete report for one department and business day.
 * `countedCash` overrides the saved count (live preview of the close dialog).
 */
export async function buildDailyReport({ organizationId, departmentId, dateKey, timeZone = DEFAULT_TIMEZONE, countedCash, client = db }) {
  const { start, end } = dayBounds(startOfDateKey(dateKey, timeZone), timeZone);
  const [department, transactions, handovers, movements, report, openingCash, stock, debts] = await Promise.all([
    client.department.findUnique({ where: { id: departmentId }, include: { organization: { select: { name: true, currency: true } } } }),
    client.transaction.findMany({
      where: { organizationId, departmentId, date: { gte: start, lte: end } },
      include: { user: { select: { name: true } }, saleLines: { include: { menuItem: { select: { name: true } } } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    client.cashHandover.findMany({ where: { organizationId, departmentId, date: { gte: start, lte: end } }, orderBy: { date: "asc" }, include: { user: { select: { name: true } } } }),
    client.stockMovement.findMany({
      where: { organizationId, departmentId, date: { gte: start, lte: end }, transactionId: null, menuItemId: { not: null } },
      include: { menuItem: { select: { name: true } }, user: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { createdAt: "asc" }],
    }),
    client.dailyReport.findUnique({
      where: { departmentId_reportDate: { departmentId, reportDate: start } },
      include: { submittedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
    }),
    openingCashBefore(client, departmentId, start),
    loadDayStock({ departmentId, dateKey, timeZone, client }),
    debtSection(client, { organizationId, departmentId, start, end, timeZone }),
  ]);

  const money = summarizeMoney(transactions);
  const savedCount = report?.totalsJson?.countedCash ?? null;
  const counted = countedCash !== undefined ? countedCash : savedCount;
  const cash = cashDrawer({ openingCash, money, handovers, countedCash: counted });

  // Sales by dish (valid sales only).
  const byDish = new Map();
  let unlisted = 0;
  for (const t of transactions) {
    if (t.type !== "SALE" || t.status === "VOIDED") continue;
    if (!t.saleLines.length) unlisted += roundMoney(t.grossAmount ?? t.amount);
    for (const l of t.saleLines) {
      const k = l.menuItemId;
      const row = byDish.get(k) || { dishId: k, name: l.menuItem?.name || "Dish", plates: 0, gross: 0, unitPrice: roundMoney(l.unitPrice) };
      row.plates += Number(l.quantity);
      row.gross += roundMoney(l.totalAmount);
      byDish.set(k, row);
    }
  }
  const salesByDish = [...byDish.values()].sort((a, b) => b.gross - a.gross);

  // Every record of the day, in time order (money records + stock additions/corrections).
  const records = [
    ...transactions.map((t) => ({
      id: t.id,
      kind: "money",
      at: t.date,
      time: formatTimeInZone(t.date, timeZone),
      referenceNo: t.referenceNo,
      type: t.type,
      typeLabel: TYPE_LABELS[t.type] || t.type,
      description: t.description || categoryLabel(t.category),
      method: METHOD_LABELS[t.paymentMethod] || t.paymentMethod,
      amount: roundMoney(t.amount),
      by: t.user?.name,
      status: t.status,
      voidReason: t.voidReason,
    })),
    ...movements.map((m) => {
      const q = Number(m.quantity);
      const signed = ["CORRECTION", "OPENING_CORRECTION", "REVERSAL", "ADJUSTMENT"].includes(m.type);
      return {
        id: m.id,
        kind: "stock",
        at: m.date,
        time: formatTimeInZone(m.date, timeZone),
        referenceNo: m.referenceNo,
        type: m.type,
        typeLabel: STOCK_LABELS[m.type] || m.type,
        description: `${m.menuItem?.name || "Dish"}: ${signed && q > 0 ? "+" : ""}${q} plate(s)${m.reason ? ` — ${m.reason}` : ""}`,
        method: null,
        amount: null,
        plates: q,
        by: m.user?.name,
        status: m.voidedAt ? "VOIDED" : "COMPLETED",
      };
    }),
  ].sort((a, b) => new Date(a.at) - new Date(b.at));

  const status = report?.status || "DRAFT";
  return {
    schemaVersion: REPORT_SCHEMA_VERSION,
    dateKey,
    generatedAt: new Date().toISOString(),
    organization: { name: department.organization?.name, currency: department.organization?.currency || "FCFA" },
    department: { id: department.id, name: department.name, code: department.code, domain: department.domain },
    status,
    locked: LOCKED_STATUSES.includes(status),
    report: report
      ? {
          id: report.id,
          referenceNo: report.referenceNo,
          version: report.version,
          submittedAt: report.submittedAt,
          submittedBy: report.submittedBy?.name || null,
          reviewedAt: report.reviewedAt,
          reviewedBy: report.reviewedBy?.name || null,
          notes: report.notes,
          reviewNotes: report.reviewNotes,
        }
      : null,
    money: {
      salesGross: money.salesGross,
      saleDiscounts: money.saleDiscounts,
      standaloneDiscounts: money.standaloneDiscounts,
      netSales: money.netSales,
      salesByMethod: money.salesByMethod,
      unlistedSales: unlisted,
      rentIncome: money.rentIncome,
      otherIncome: money.otherIncome,
      moneyIn: money.moneyIn,
      discounts: money.discounts,
      purchases: money.purchases,
      purchasesOnCredit: money.purchasesOnCredit,
      expenses: money.expenses,
      otherExpenses: money.otherExpenses,
      moneyOut: money.moneyOut,
      result: money.result,
      debtRepayments: money.debtRepayments,
      expensesByCategory: Object.entries(money.expensesByCategory).map(([k, v]) => ({ label: categoryLabel(k), amount: v })),
      otherExpensesByCategory: Object.entries(money.otherExpensesByCategory).map(([k, v]) => ({ label: categoryLabel(k), amount: v })),
      salesCount: transactions.filter((t) => t.type === "SALE" && t.status !== "VOIDED").length,
    },
    sales: { byDish: salesByDish, plates: salesByDish.reduce((s, d) => s + d.plates, 0) },
    stock: { rows: stock.rows, totals: stock.totals, showSpoiled: stock.showSpoiled, showCorrected: stock.showCorrected },
    debts,
    cash,
    handovers: handovers.map((h) => ({
      id: h.id,
      referenceNo: h.referenceNo,
      time: formatTimeInZone(h.date, timeZone),
      amount: roundMoney(h.amount),
      recipient: h.recipientName,
      status: h.status,
      by: h.user?.name,
      reviewNote: h.reviewNote,
    })),
    records,
  };
}

/** Compact totals saved next to the snapshot (lists, calendars, statements). */
export function reportTotals(model) {
  return {
    moneyIn: model.money.moneyIn,
    moneyOut: model.money.moneyOut,
    result: model.money.result,
    salesGross: model.money.salesGross,
    netSales: model.money.netSales,
    rentIncome: model.money.rentIncome,
    otherIncome: model.money.otherIncome,
    discounts: model.money.discounts,
    purchases: model.money.purchases,
    expenses: model.money.expenses,
    otherExpenses: model.money.otherExpenses,
    debtRepayments: model.money.debtRepayments,
    platesSold: model.sales.plates,
    stockValue: model.stock.totals.value,
    openingStockValue: model.stock.totals.openingValue,
    debtsGiven: model.debts.given,
    debtsClosing: model.debts.closing,
    openingCash: model.cash.opening,
    cashExpected: model.cash.expected,
    handedOver: model.cash.handedOver,
    shouldRemain: model.cash.shouldRemain,
    countedCash: model.cash.counted,
    variance: model.cash.variance,
  };
}

/** The frozen report as the Boss received it (saved row + snapshot), with its current status. */
export function modelFromSaved(saved) {
  const snap = saved.snapshotJson || {};
  return {
    ...snap,
    status: saved.status,
    locked: LOCKED_STATUSES.includes(saved.status),
    notes: saved.notes ?? snap.notes ?? null,
    report: {
      id: saved.id,
      referenceNo: saved.referenceNo,
      version: saved.version,
      submittedAt: saved.submittedAt,
      submittedBy: saved.submittedBy?.name || snap.submittedBy?.name || null,
      reviewedAt: saved.reviewedAt,
      reviewedBy: saved.reviewedBy?.name || null,
      notes: saved.notes,
      reviewNotes: saved.reviewNotes,
    },
  };
}
