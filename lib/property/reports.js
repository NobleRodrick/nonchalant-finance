/**
 * A property rental department's report for any period (a day, a week, a month …): the Reports
 * page, the dashboard, the automatic daily / weekly / monthly reports, the company statements and
 * the Boss's overview all read it, so they always agree. Definitions: lib/property/report-math.js.
 */
import { db } from "@/lib/prisma";
import { summarizeMoney } from "@/lib/finance/money-math";
import { drawerNow, openingCashBefore } from "@/lib/finance/posting-service";
import { cashVerification } from "@/lib/departments/cash-verification";
import { categoryLabel } from "@/data/categories";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";
import { billsRent, leaseTerms, loadAccounts } from "./accounts";
import { addMonths, monthOf, rentSchedule } from "./rent-schedule";
import { chargeTotals, occupancyRate, performanceBy, propertyIncome, rentInPeriod } from "./report-math";
import { statusCounts, unitStatus } from "./unit-math";

const int = (v) => Math.round(Number(v) || 0);
const sum = (rows, f = (x) => x.amount) => rows.reduce((s, r) => s + int(f(r)), 0);

/** Rent revenue, charges and waivers of [fromKey, toKey], per contract (the accrual part). */
async function accrual(client, departmentId, fromKey, toKey, timeZone) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [leases, charges, waivers] = await Promise.all([
    client.propertyLease.findMany({ where: { departmentId, status: { in: ["ACTIVE", "ENDED"] }, startDate: { lte: new Date(`${toKey}T00:00:00Z`) }, OR: [{ moveOutDate: null }, { moveOutDate: { gte: new Date(`${fromKey}T00:00:00Z`) } }] }, include: { rates: { select: { fromMonth: true, amount: true } }, client: { select: { id: true, name: true } }, unit: { select: { id: true, name: true, buildingId: true, building: { select: { name: true } } } } } }),
    client.propertyCharge.findMany({ where: { departmentId, voidedAt: null, date: { gte: start, lte: end } }, select: { leaseId: true, unitId: true, kind: true, amount: true, date: true } }),
    client.propertyAllocation.findMany({ where: { departmentId, voidedAt: null, source: "WAIVER", date: { gte: start, lte: end } }, select: { leaseId: true, amount: true, date: true } }),
  ]);
  const rows = leases.map((l) => {
    const terms = leaseTerms(l, l.rates);
    const items = billsRent(l.status) ? rentSchedule(terms, monthOf(toKey)) : [];
    const rent = rentInPeriod(items, terms.startKey, terms.moveOutKey, fromKey, toKey);
    const own = charges.filter((c) => c.leaseId === l.id);
    const waived = sum(waivers.filter((w) => w.leaseId === l.id));
    return { leaseId: l.id, referenceNo: l.referenceNo, buildingId: l.unit.buildingId, building: l.unit.building.name, unitId: l.unit.id, unit: l.unit.name, tenantId: l.client.id, tenant: l.client.name, rent: rent - waived, rentGross: rent, waived, charges: sum(own), chargeList: own, items, startKey: terms.startKey, moveOutKey: terms.moveOutKey, status: l.status };
  });
  return { rows, charges, waivers };
}

/**
 * The full report of a period: income statement (by building, office, tenant), cash flow and
 * cash verification, rent expected / collected / outstanding, arrears and deposits held now,
 * occupancy, activity (new tenants, move-outs, maintenance, deposits), expenses by category.
 */
export async function propertyReport({ departmentId, organizationId, fromKey, toKey, timeZone, todayKey = toDateKey(new Date(), timeZone), client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [acc, transactions, units, buildings, allLeases, handovers, receipts, counts, opening, drawer, maintenance, deposits, unvalidated] = await Promise.all([
    accrual(client, departmentId, fromKey, toKey, timeZone),
    client.transaction.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true, buildingId: true, propertyUnitId: true, leaseId: true } }),
    client.propertyUnit.findMany({ where: { departmentId, isActive: true }, select: { id: true, name: true, buildingId: true, state: true, building: { select: { name: true } }, leases: { where: { status: { in: ["ACTIVE", "RESERVED"] } }, select: { status: true } } } }),
    client.propertyBuilding.findMany({ where: { departmentId, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    client.propertyLease.findMany({ where: { departmentId, status: { not: "CANCELLED" } }, include: { client: { select: { id: true, name: true } }, unit: { select: { id: true, name: true, buildingId: true } } } }),
    client.cashHandover.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { amount: true, status: true } }),
    client.transaction.groupBy({ by: ["receivedByName", "paymentMethod"], where: { departmentId, type: "BOOKING_PAYMENT", status: { not: "VOIDED" }, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: { _all: true } }),
    client.venueCashCount.findMany({ where: { departmentId, date: { gte: new Date(`${fromKey}T00:00:00Z`), lte: new Date(`${toKey}T00:00:00Z`) } }, orderBy: { date: "asc" } }),
    openingCashBefore(client, departmentId, start),
    drawerNow(client, { organizationId, departmentId, timeZone }),
    client.propertyMaintenance.findMany({ where: { departmentId }, select: { status: true, reportedAt: true, completedAt: true, cost: true, priority: true } }),
    client.propertyDeposit.findMany({ where: { departmentId, voidedAt: null }, select: { kind: true, amount: true, date: true } }),
    client.transaction.aggregate({ where: { departmentId, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" }, validatedAt: null }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const live = transactions.filter((t) => t.status !== "VOIDED");
  const money = summarizeMoney(live);
  const exp = live.filter((t) => ["EXPENSE", "OTHER_EXPENSE"].includes(t.type));
  const byCat = {};
  for (const t of exp) byCat[t.category] = (byCat[t.category] || 0) + int(t.amount);
  const charges = chargeTotals(acc.charges);
  const rentGross = sum(acc.rows, (r) => r.rentGross);
  const waived = sum(acc.waivers);
  const income = propertyIncome({ rent: rentGross, waived, charges, otherIncome: money.otherIncome, expenses: sum(exp), expensesByCategory: Object.entries(byCat).map(([category, amount]) => ({ category, label: categoryLabel(category), amount })).sort((a, b) => b.amount - a.amount) });
  const by = performanceBy({ rows: acc.rows, expenses: exp.map((t) => ({ buildingId: t.buildingId, unitId: t.propertyUnitId, amount: t.amount })), buildings, units: units.map((u) => ({ id: u.id, name: u.name, buildingId: u.buildingId, building: u.building.name })) });

  // Money of the period
  const cat = (c) => sum(live.filter((t) => t.category === c));
  const rentCollected = cat("lease-payment") - cat("lease-refund");
  const cashFlow = {
    opening,
    tenantPayments: cat("lease-payment"),
    refunds: cat("lease-refund"),
    depositsIn: cat("lease-deposit"),
    depositsOut: cat("lease-deposit-refund"),
    otherIncome: money.otherIncome,
    expenses: sum(exp),
    net: rentCollected + cat("lease-deposit") - cat("lease-deposit-refund") + money.otherIncome - sum(exp),
    byMethod: money.receivedByMethod,
    cashIn: money.cash.in,
    cashOut: money.cash.out,
    handedOver: handovers.filter((h) => ["RECORDED", "CONFIRMED"].includes(h.status)).reduce((s, h) => s + int(h.amount), 0),
    handoverPending: handovers.filter((h) => h.status === "RECORDED").reduce((s, h) => s + int(h.amount), 0),
    bankAndMomo: int(money.receivedByMethod.MOMO) + int(money.receivedByMethod.BANK_TRANSFER) + int(money.receivedByMethod.OTHER),
  };
  cashFlow.closingCash = int(opening) + cashFlow.cashIn - cashFlow.cashOut - cashFlow.handedOver;
  const verification = cashVerification({
    receipts: receipts.map((r) => ({ receivedBy: r.receivedByName, method: r.paymentMethod, amount: r._sum.amount, count: r._count._all })),
    counts: counts.map((c) => ({ dateKey: dateKeyOf(c.date), countedCash: c.countedCash, expectedCash: c.expectedCash, variance: c.variance, notes: c.notes })),
    cashFlow: { ...cashFlow, receivedFromClients: cashFlow.tenantPayments + cashFlow.depositsIn, disputed: 0 },
    drawerNow: drawer,
  });

  // Now: arrears, deposits held, occupancy
  const accounts = await loadAccounts({ leases: allLeases.filter((l) => l.status !== "RESERVED"), todayKey, client });
  let owed = 0;
  let overdue = 0;
  const owing = [];
  for (const l of allLeases) {
    const a = accounts.get(l.id);
    if (!a) continue;
    owed += a.outstanding;
    overdue += a.overdue;
    if (a.outstanding > 0) owing.push({ id: l.id, referenceNo: l.referenceNo, tenant: l.client.name, unit: l.unit.name, balance: a.outstanding, monthsOwed: a.monthsOwed, daysOverdue: a.daysOverdue, byKind: a.byKind });
  }
  owing.sort((a, b) => b.daysOverdue - a.daysOverdue || b.balance - a.balance);
  const depositsHeld = deposits.reduce((s, d) => s + (d.kind === "RECEIVED" ? 1 : -1) * d.amount, 0);
  const counts_ = statusCounts(units.map((u) => ({ status: unitStatus(u, u.leases) })));
  const leasesShaped = allLeases.map((l) => ({ status: l.status, startKey: dateKeyOf(l.startDate), moveOutKey: dateKeyOf(l.moveOutDate) }));
  const inPeriod = (d) => d && dateKeyOf(d) >= fromKey && dateKeyOf(d) <= toKey;
  const at = (d) => d && toDateKey(d, timeZone) >= fromKey && toDateKey(d, timeZone) <= toKey;

  return {
    fromKey,
    toKey,
    todayKey,
    income,
    by,
    cashFlow,
    verification,
    drawer,
    rent: { expected: rentGross, collected: rentCollected, outstanding: owed, overdue },
    arrears: { owed, overdue, tenants: new Set(owing.map((o) => o.tenant)).size, rows: owing },
    deposits: { held: depositsHeld, received: cashFlow.depositsIn, refunded: cashFlow.depositsOut, applied: sum(deposits.filter((d) => d.kind.startsWith("APPLIED") && at(d.date))) },
    occupancy: { ...counts_, periodRate: occupancyRate(units, leasesShaped, fromKey, toKey) },
    activity: {
      newTenants: allLeases.filter((l) => inPeriod(l.moveInDate)).map((l) => ({ id: l.id, tenant: l.client.name, unit: l.unit.name })),
      vacated: allLeases.filter((l) => l.status === "ENDED" && inPeriod(l.moveOutDate)).map((l) => ({ id: l.id, tenant: l.client.name, unit: l.unit.name })),
      newReservations: allLeases.filter((l) => at(l.createdAt) && l.status === "RESERVED").length,
      payments: live.filter((t) => t.category === "lease-payment").length,
      maintenanceOpened: maintenance.filter((m) => at(m.reportedAt)).length,
      maintenanceDone: maintenance.filter((m) => m.status === "COMPLETED" && at(m.completedAt)).length,
      maintenanceOpen: maintenance.filter((m) => ["REPORTED", "APPROVED", "IN_PROGRESS"].includes(m.status)).length,
      maintenanceCost: sum(maintenance.filter((m) => m.status === "COMPLETED" && at(m.completedAt)), (m) => m.cost),
    },
    unvalidated: { count: unvalidated._count._all, amount: int(unvalidated._sum.amount) },
  };
}

/**
 * Accrual figures per property rental department (company statements, Boss overview): rent and
 * tenant charges on their dates (`rentRevenue`), by date key in `days`.
 */
export async function propertyStatementFigures({ departments, fromKey, toKey, timeZone, client = db }) {
  const out = {};
  await Promise.all(
    departments
      .filter((d) => d.domain === "PROPERTY_RENTAL")
      .map(async (d) => {
        const acc = await accrual(client, d.id, fromKey, toKey, timeZone);
        const days = {};
        const day = (k) => (days[k] ||= { revenue: 0, assetLosses: 0 });
        // Rent by day: each lease's rent spread over the days of each month it covers.
        for (const r of acc.rows) {
          for (let k = fromKey; k <= toKey; k = nextDay(k)) {
            const v = rentInPeriod(r.items, r.startKey, r.moveOutKey, k, k);
            if (v) day(k).revenue += v;
          }
        }
        for (const c of acc.charges) day(toDateKey(c.date, timeZone)).revenue += c.amount;
        for (const w of acc.waivers) day(toDateKey(w.date, timeZone)).revenue -= w.amount;
        out[d.id] = { rentRevenue: sum(acc.rows, (r) => r.rentGross) - sum(acc.waivers) + sum(acc.charges), days };
      })
  );
  return out;
}

function nextDay(k) {
  return new Date(Date.parse(`${k}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
}

/** The key figures of a property rental department for a period (the Boss's overview). */
export async function propertySummary({ department, organizationId, fromKey, toKey, timeZone, client = db }) {
  const r = await propertyReport({ departmentId: department.id, organizationId, fromKey, toKey, timeZone, client });
  return {
    revenue: r.income.revenue,
    net: r.income.net,
    collected: r.rent.collected,
    owed: r.arrears.owed,
    overdue: r.arrears.overdue,
    tenantsOwing: r.arrears.tenants,
    occupied: r.occupancy.OCCUPIED,
    offices: r.occupancy.total,
    vacant: r.occupancy.vacant,
    depositsHeld: r.deposits.held,
    toHandOver: r.verification.toHandOver,
    discrepancies: r.verification.discrepancies,
    maintenanceOpen: r.activity.maintenanceOpen,
    unvalidated: r.unvalidated.count,
  };
}

/** Month by month over the last `months` months to `toKey`: rent, utilities, other, expenses, net, collected. */
export async function propertyTrends({ department, toKey, months = 12, timeZone, client = db }) {
  const keys = [];
  for (let i = months - 1; i >= 0; i -= 1) keys.push(addMonths(monthOf(toKey), -i));
  return Promise.all(
    keys.map(async (mk) => {
      const fromKey = `${mk}-01`;
      const end = new Date(Date.UTC(Number(mk.slice(0, 4)), Number(mk.slice(5, 7)), 0)).toISOString().slice(0, 10);
      const { start, end: endAt } = rangeBounds(fromKey, end, timeZone);
      const [acc, tx] = await Promise.all([accrual(client, department.id, fromKey, end, timeZone), client.transaction.findMany({ where: { departmentId: department.id, status: { not: "VOIDED" }, date: { gte: start, lte: endAt } }, select: { type: true, amount: true, category: true } })]);
      const charges = chargeTotals(acc.charges);
      const expenses = sum(tx.filter((t) => ["EXPENSE", "OTHER_EXPENSE"].includes(t.type)));
      const inc = propertyIncome({ rent: sum(acc.rows, (r) => r.rentGross), waived: sum(acc.waivers), charges, otherIncome: sum(tx.filter((t) => t.type === "OTHER_INCOME")), expenses });
      return { monthKey: mk, rent: inc.rentNet, utilities: inc.utilities, other: inc.otherCharges + inc.otherIncome, revenue: inc.revenue, expenses, net: inc.net, collected: sum(tx.filter((t) => t.category === "lease-payment")) - sum(tx.filter((t) => t.category === "lease-refund")) };
    })
  );
}
