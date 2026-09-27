/**
 * The Boss's view of the whole business: today's figures per department, report status,
 * cash received, debts, stock value, alerts, a report calendar and a 30-day trend.
 */
import { db } from "@/lib/prisma";
import { addDaysToKey, dayBounds, listDateKeys, rangeBounds, startOfDateKey, toDateKey, formatDateKey, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { summarizeMoney, sumHandovers, debtStatus, pctChange } from "@/lib/finance/money-math";
import { loadDayStock } from "@/lib/restaurant/stock-service";
import { roundMoney } from "@/lib/money";

export const REPORT_CELL = {
  APPROVED: { label: "Approved", tone: "ok" },
  SUBMITTED: { label: "Sent, waiting for you", tone: "info" },
  REVIEWED: { label: "Sent, waiting for you", tone: "info" },
  RETURNED: { label: "Returned", tone: "warn" },
  DRAFT: { label: "Not sent", tone: "muted" },
  MISSING: { label: "Not sent", tone: "muted" },
  LATE: { label: "Missing", tone: "bad" },
  FUTURE: { label: "", tone: "none" },
};

/** Report status of each department for each day of [fromKey, toKey]. */
export async function reportCalendar({ organizationId, departments, fromKey, toKey, timeZone = DEFAULT_TIMEZONE, client = db }) {
  const ids = departments.filter((d) => d.domain === "RESTAURANT").map((d) => d.id);
  const reports = await client.dailyReport.findMany({
    where: { organizationId, departmentId: { in: ids }, reportDate: { gte: startOfDateKey(fromKey, timeZone), lte: startOfDateKey(toKey, timeZone) } },
    select: { id: true, departmentId: true, reportDate: true, status: true, version: true, totalsJson: true },
  });
  const today = toDateKey(new Date(), timeZone);
  const key = (d, k) => `${d}:${k}`;
  const map = new Map(reports.map((r) => [key(r.departmentId, toDateKey(r.reportDate, timeZone)), r]));
  const days = listDateKeys(fromKey, toKey);
  return {
    days,
    rows: departments
      .filter((d) => d.domain === "RESTAURANT")
      .map((d) => ({
        departmentId: d.id,
        name: d.name,
        cells: days.map((k) => {
          const r = map.get(key(d.id, k));
          let status = r?.status || "MISSING";
          const created = d.createdAt ? toDateKey(d.createdAt, timeZone) : null;
          if (!r && (k > today || (created && k < created))) status = "FUTURE";
          else if ((!r || r.status === "DRAFT") && k < today) status = "LATE";
          return { dateKey: k, status, reportId: r?.id || null, version: r?.version || null, totals: r?.totalsJson || null };
        }),
      })),
  };
}

/** Everything the Boss overview shows for `dateKey` (default today). */
export async function bossOverview({ organizationId, departments, dateKey, timeZone = DEFAULT_TIMEZONE, client = db }) {
  const ids = departments.map((d) => d.id);
  const { start, end } = dayBounds(startOfDateKey(dateKey, timeZone), timeZone);
  const yesterday = addDaysToKey(dateKey, -1);
  const y = dayBounds(startOfDateKey(yesterday, timeZone), timeZone);
  const monthFrom = `${dateKey.slice(0, 8)}01`;
  const month = rangeBounds(monthFrom, dateKey, timeZone);
  const trendFrom = addDaysToKey(dateKey, -29);
  const trend = rangeBounds(trendFrom, dateKey, timeZone);

  const [dayTx, yTx, monthTx, trendTx, handoversToday, pendingHandovers, openDebts, sentReports, returnedReports, openRequests, members] = await Promise.all([
    client.transaction.findMany({ where: { organizationId, departmentId: { in: ids }, date: { gte: start, lte: end } } }),
    client.transaction.findMany({ where: { organizationId, departmentId: { in: ids }, date: { gte: y.start, lte: y.end } } }),
    client.transaction.findMany({ where: { organizationId, departmentId: { in: ids }, date: { gte: month.start, lte: month.end } } }),
    client.transaction.findMany({ where: { organizationId, departmentId: { in: ids }, date: { gte: trend.start, lte: trend.end } }, select: { type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, date: true, category: true, operationCategory: true } }),
    client.cashHandover.findMany({ where: { organizationId, departmentId: { in: ids }, date: { gte: start, lte: end } } }),
    client.cashHandover.findMany({ where: { organizationId, departmentId: { in: ids }, status: "RECORDED" }, include: { department: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { date: "asc" } }),
    client.debt.findMany({ where: { organizationId, departmentId: { in: ids }, status: { in: ["UNPAID", "PARTIALLY_PAID"] } }, select: { amountOwed: true, amountPaid: true, departmentId: true } }),
    client.dailyReport.findMany({
      where: { organizationId, departmentId: { in: ids }, status: { in: ["SUBMITTED", "REVIEWED"] } },
      include: { department: { select: { name: true } }, submittedBy: { select: { name: true } } },
      orderBy: { reportDate: "desc" },
      take: 50,
    }),
    client.dailyReport.findMany({ where: { organizationId, departmentId: { in: ids }, status: "RETURNED" }, include: { department: { select: { name: true } } } }),
    client.cashRequest.findMany({ where: { organizationId, departmentId: { in: ids }, status: "OPEN" }, include: { department: { select: { name: true } } } }),
    client.userDepartment.findMany({ where: { departmentId: { in: ids }, isActive: true, user: { isActive: true } }, select: { departmentId: true, user: { select: { name: true, title: true, role: true } } } }),
  ]);
  // Everyone assigned to a department is one of its heads.
  const headsOf = (id) => members.filter((m) => m.departmentId === id && m.user.role === "HEAD").map((m) => (m.user.title ? `${m.user.name} (${m.user.title})` : m.user.name));

  const stockByDept = new Map();
  await Promise.all(
    departments
      .filter((d) => d.domain === "RESTAURANT")
      .map(async (d) => stockByDept.set(d.id, await loadDayStock({ departmentId: d.id, dateKey, timeZone, client })))
  );

  const debtsByDept = new Map();
  for (const debt of openDebts) debtsByDept.set(debt.departmentId, (debtsByDept.get(debt.departmentId) || 0) + debtStatus(debt.amountOwed, debt.amountPaid).balance);

  const today = summarizeMoney(dayTx);
  const prev = summarizeMoney(yTx);
  const monthMoney = summarizeMoney(monthTx);
  const stockValue = [...stockByDept.values()].reduce((s, st) => s + st.totals.value, 0);
  const debtsOwed = [...debtsByDept.values()].reduce((s, v) => s + v, 0);

  const calendar = await reportCalendar({ organizationId, departments, fromKey: addDaysToKey(dateKey, -6), toKey: dateKey, timeZone, client });
  const statusToday = new Map(calendar.rows.map((r) => [r.departmentId, r.cells[r.cells.length - 1]]));

  const cards = departments.map((d) => {
    const m = summarizeMoney(dayTx.filter((t) => t.departmentId === d.id));
    const st = stockByDept.get(d.id);
    return {
      id: d.id,
      name: d.name,
      domain: d.domain,
      code: d.code,
      moneyIn: m.moneyIn,
      moneyOut: m.moneyOut,
      result: m.result,
      stockValue: st?.totals.value ?? null,
      plates: st?.totals.closing ?? null,
      outOfStock: st ? st.rows.filter((r) => r.isActive && r.closing <= 0).length : 0,
      debts: debtsByDept.get(d.id) || 0,
      handedOver: sumHandovers(handoversToday.filter((h) => h.departmentId === d.id)),
      handoverPending: roundMoney(pendingHandovers.filter((h) => h.departmentId === d.id).reduce((s, h) => s + roundMoney(h.amount), 0)),
      report: statusToday.get(d.id) || null,
      heads: headsOf(d.id),
      people: members.filter((m) => m.departmentId === d.id).length,
    };
  });

  // Alerts
  const alerts = [];
  for (const row of calendar.rows) {
    const late = row.cells.filter((c) => c.status === "LATE");
    if (late.length) {
      alerts.push({ tone: "bad", text: `${row.name} has not sent the report of ${late.map((c) => formatDateKey(c.dateKey)).join(", ")}.`, href: `/boss/daily-reports?dept=${row.departmentId}` });
    }
    for (const c of row.cells) {
      const v = c.totals?.variance;
      if (v && ["SUBMITTED", "REVIEWED", "APPROVED"].includes(c.status)) {
        alerts.push({ tone: "warn", text: `${row.name}: cash ${v < 0 ? "short" : "over"} by ${Math.abs(v).toLocaleString("fr-FR")} FCFA on ${formatDateKey(c.dateKey)}.`, href: c.reportId ? `/boss/daily-reports/${c.reportId}` : "/boss/daily-reports" });
      }
      const disc = c.totals?.discounts || 0;
      const sales = c.totals?.salesGross || 0;
      if (sales > 0 && disc / sales > 0.1) {
        alerts.push({ tone: "warn", text: `${row.name}: discounts were ${Math.round((disc / sales) * 100)}% of sales on ${formatDateKey(c.dateKey)}.`, href: c.reportId ? `/boss/daily-reports/${c.reportId}` : "/boss/daily-reports" });
      }
    }
  }
  for (const c of cards) {
    if (!c.heads.length && (d => d?.isActive !== false)(departments.find((d) => d.id === c.id))) {
      alerts.push({ tone: "warn", text: `${c.name} has no department head: nobody runs its day.`, href: `/boss/people?dept=${c.id}` });
    }
    if (c.outOfStock) alerts.push({ tone: "info", text: `${c.name}: ${c.outOfStock === 1 ? "1 dish is" : `${c.outOfStock} dishes are`} out of stock.`, href: `/d/${c.id}/menu-stock` });
  }
  const oldPending = pendingHandovers.filter((h) => Date.now() - new Date(h.date).getTime() > 24 * 3600 * 1000);
  if (pendingHandovers.length) {
    alerts.push({ tone: oldPending.length ? "warn" : "info", text: `${pendingHandovers.length === 1 ? "1 cash handover is" : `${pendingHandovers.length} cash handovers are`} waiting for your confirmation.`, href: "/boss/cash" });
  }
  if (openRequests.length) {
    const names = [...new Set(openRequests.map((q) => q.department.name))].join(", ");
    alerts.push({ tone: "info", text: `${openRequests.length === 1 ? "1 cash request is" : `${openRequests.length} cash requests are`} waiting for the department head (${names}).`, href: "/boss/cash" });
  }
  for (const r of returnedReports) {
    alerts.push({ tone: "info", text: `${r.department.name}: the report of ${formatDateKey(toDateKey(r.reportDate, timeZone))} you returned has not been sent again.`, href: `/boss/daily-reports/${r.id}` });
  }

  const series = listDateKeys(trendFrom, dateKey).map((k) => {
    const m = summarizeMoney(trendTx.filter((t) => toDateKey(t.date, timeZone) === k));
    return { dateKey: k, moneyIn: m.moneyIn, moneyOut: m.moneyOut, result: m.result };
  });

  return {
    dateKey,
    kpis: {
      moneyIn: today.moneyIn,
      moneyOut: today.moneyOut,
      result: today.result,
      moneyInChange: pctChange(today.moneyIn, prev.moneyIn),
      resultChange: pctChange(today.result, prev.result),
      handedOver: sumHandovers(handoversToday),
      pendingHandovers: roundMoney(pendingHandovers.reduce((s, h) => s + roundMoney(h.amount), 0)),
      pendingHandoverCount: pendingHandovers.length,
      debtsOwed,
      stockValue,
      month: { moneyIn: monthMoney.moneyIn, moneyOut: monthMoney.moneyOut, result: monthMoney.result },
    },
    cards,
    alerts,
    calendar,
    toReview: sentReports.map((r) => ({ id: r.id, department: r.department.name, dateKey: toDateKey(r.reportDate, timeZone), submittedBy: r.submittedBy?.name, submittedAt: r.submittedAt, version: r.version, totals: r.totalsJson })),
    pendingHandovers: pendingHandovers.map((h) => ({ id: h.id, department: h.department.name, amount: roundMoney(h.amount), referenceNo: h.referenceNo, by: h.user?.name, date: h.date })),
    series,
  };
}
