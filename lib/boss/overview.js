/**
 * The Boss's view of the whole business: today's figures per department, report status,
 * cash received, debts, stock value, alerts, a report calendar and a 30-day trend.
 */
import { db } from "@/lib/prisma";
import { addDaysToKey, dayBounds, listDateKeys, rangeBounds, startOfDateKey, toDateKey, formatDateKey, DEFAULT_TIMEZONE } from "@/lib/timezone";
import { summarizeMoney, sumHandovers, debtStatus, pctChange } from "@/lib/finance/money-math";
import { loadDayStock } from "@/lib/restaurant/stock-service";
import { roundMoney } from "@/lib/money";
import { formatMoney } from "@/lib/format";
import { venueSummary } from "@/lib/venue/reports";
import { staySummary } from "@/lib/rooms/reports";
import { rentalSummary } from "@/lib/rental/reports";
import { rentalAttention } from "@/lib/rental/dashboard";
import { propertySummary } from "@/lib/property/reports";
import { propertyAttention } from "@/lib/property/dashboard";
import { roomsSummary } from "@/lib/rooms/room-queries";
import { accrualByDay, accrualFigures } from "@/lib/departments/accrual";
import { tradeCardSummary } from "@/lib/trade/card-summary";
import { TRADE_DOMAINS, SERVICE_DOMAINS } from "@/lib/domains/trade";

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

  // One ledger read covers today, yesterday, the month and the 30-day trend (filtered below);
  // stock, the report calendar and the rest load at the same time.
  const from = month.start < trend.start ? month.start : trend.start;
  const inRange = (t, a, b) => t.date >= a && t.date <= b;
  const restaurants = departments.filter((d) => d.domain === "RESTAURANT");
  const venues = departments.filter((d) => d.domain === "EVENT_VENUE");
  const roomDepts = departments.filter((d) => d.domain === "ROOM_RENTAL");
  const rentalDepts = departments.filter((d) => d.domain === "MATERIAL_RENTAL");
  const propertyDepts = departments.filter((d) => d.domain === "PROPERTY_RENTAL");
  const tradeDepts = departments.filter((d) => TRADE_DOMAINS.includes(d.domain) || SERVICE_DOMAINS.includes(d.domain));
  const [tradeDay, [ledger, handoversToday, pendingHandovers, openDebts, sentReports, returnedReports, openRequests, members], stocks, calendar, venueDay, accrual, roomsDay, stayDay, rentalDay, propertyDay] = await Promise.all([
    Promise.all(tradeDepts.map((d) => tradeCardSummary({ department: d, dateKey, timeZone, client }))),
    Promise.all([
      client.transaction.findMany({ where: { organizationId, departmentId: { in: ids }, date: { gte: from, lte: end } } }),
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
    ]),
    Promise.all(restaurants.map((d) => loadDayStock({ departmentId: d.id, dateKey, timeZone, client }))),
    reportCalendar({ organizationId, departments, fromKey: addDaysToKey(dateKey, -6), toKey: dateKey, timeZone, client }),
    // Department types with their own figures (lib/domains): an event venue's events and a guest
    // house's nights are revenue on their date, so their cards and the totals add those figures
    // (lib/departments/accrual) to the day's ledger, as the statements do.
    Promise.all(venues.map((d) => venueSummary({ department: d, organizationId, fromKey: dateKey, toKey: dateKey, timeZone, client }))),
    // One read covers the month, yesterday, today and the 30-day trend (by date key).
    accrualFigures({ departments, fromKey: monthFrom < trendFrom ? monthFrom : trendFrom, toKey: dateKey, timeZone, client }),
    Promise.all(roomDepts.map((d) => roomsSummary({ departmentId: d.id, dateKey, client }))),
    Promise.all(roomDepts.map((d) => staySummary({ department: d, organizationId, fromKey: dateKey, toKey: dateKey, timeZone, client }))),
    Promise.all(
      rentalDepts.map(async (d) => {
        const [summary, attention] = await Promise.all([rentalSummary({ department: d, organizationId, fromKey: dateKey, toKey: dateKey, timeZone, client }), rentalAttention({ departmentId: d.id, todayKey: dateKey, timeZone, client })]);
        return { ...summary, warnings: attention.warnings.map(({ rows: _rows, ...w }) => w) };
      })
    ),
    Promise.all(
      propertyDepts.map(async (d) => {
        const [summary, attention] = await Promise.all([propertySummary({ department: d, organizationId, fromKey: dateKey, toKey: dateKey, timeZone, client }), propertyAttention({ departmentId: d.id, todayKey: dateKey, timeZone, client })]);
        return { ...summary, warnings: attention.warnings.map(({ rows: _rows, ...w }) => w) };
      })
    ),
  ]);
  const venueById = new Map(venues.map((d, i) => [d.id, venueDay[i]]));
  const roomsById = new Map(roomDepts.map((d, i) => [d.id, { ...roomsDay[i], ...stayDay[i] }]));
  const rentalById = new Map(rentalDepts.map((d, i) => [d.id, rentalDay[i]]));
  const propertyById = new Map(propertyDepts.map((d, i) => [d.id, propertyDay[i]]));
  const tradeById = new Map(tradeDepts.map((d, i) => [d.id, tradeDay[i]]));
  // Accrual revenue and losses of [a, b] for every department, or for one.
  const allDays = accrualByDay(accrual);
  const extraOf = (a, b, departmentId = null) => {
    const days = departmentId ? accrualByDay(accrual[departmentId] ? { x: accrual[departmentId] } : {}) : allDays;
    let moneyIn = 0;
    let moneyOut = 0;
    for (const [k, v] of Object.entries(days)) if (k >= a && k <= b) { moneyIn += v.revenue; moneyOut += v.assetLosses; }
    return { moneyIn, moneyOut };
  };
  const withAccrual = (m, extra) => ({ ...m, moneyIn: m.moneyIn + extra.moneyIn, moneyOut: m.moneyOut + extra.moneyOut, result: m.result + extra.moneyIn - extra.moneyOut });
  const dayTx = ledger.filter((t) => inRange(t, start, end));
  const yTx = ledger.filter((t) => inRange(t, y.start, y.end));
  const monthTx = ledger.filter((t) => inRange(t, month.start, month.end));
  const trendTx = ledger.filter((t) => inRange(t, trend.start, trend.end));
  // Everyone assigned to a department is one of its heads.
  const headsOf = (id) => members.filter((m) => m.departmentId === id && m.user.role === "HEAD").map((m) => (m.user.title ? `${m.user.name} (${m.user.title})` : m.user.name));

  const stockByDept = new Map(restaurants.map((d, i) => [d.id, stocks[i]]));

  const debtsByDept = new Map();
  for (const debt of openDebts) debtsByDept.set(debt.departmentId, (debtsByDept.get(debt.departmentId) || 0) + debtStatus(debt.amountOwed, debt.amountPaid).balance);

  const today = withAccrual(summarizeMoney(dayTx), extraOf(dateKey, dateKey));
  const prev = withAccrual(summarizeMoney(yTx), extraOf(yesterday, yesterday));
  const monthMoney = withAccrual(summarizeMoney(monthTx), extraOf(monthFrom, dateKey));
  const stockValue = [...stockByDept.values()].reduce((s, st) => s + st.totals.value, 0);
  // Customers' debts (restaurants) and balances owed by venue clients.
  const debtsOwed = [...debtsByDept.values()].reduce((s, v) => s + v, 0) + venueDay.reduce((s, v) => s + v.outstanding, 0) + stayDay.reduce((s, v) => s + v.outstanding, 0) + rentalDay.reduce((s, v) => s + v.outstanding, 0) + propertyDay.reduce((s, v) => s + v.owed, 0) + tradeDay.reduce((s, v) => s + (v.services?.owing || 0), 0);

  const statusToday = new Map(calendar.rows.map((r) => [r.departmentId, r.cells[r.cells.length - 1]]));

  const cards = departments.map((d) => {
    const v = venueById.get(d.id) || null;
    const m = withAccrual(summarizeMoney(dayTx.filter((t) => t.departmentId === d.id)), extraOf(dateKey, dateKey, d.id));
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
      venue: v,
      rooms: roomsById.get(d.id) || null,
      rental: rentalById.get(d.id) || null,
      property: propertyById.get(d.id) || null,
      trade: tradeById.get(d.id)?.trade || null,
      services: tradeById.get(d.id)?.services || null,
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
        alerts.push({ tone: "warn", text: `${row.name}: cash ${v < 0 ? "short" : "over"} by ${formatMoney(Math.abs(v))} on ${formatDateKey(c.dateKey)}.`, href: c.reportId ? `/boss/daily-reports/${c.reportId}` : "/boss/daily-reports" });
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
      alerts.push({ tone: "info", text: `${c.name} has no department head: you run it yourself (record its day there), or assign a head.`, href: `/d/${c.id}` });
    }
    if (c.rooms?.discrepancies) alerts.push({ tone: "warn", text: `${c.name}: ${formatMoney(c.rooms.discrepancies)} in cash discrepancies on ${formatDateKey(dateKey)}.`, href: `/d/${c.id}/reports?period=custom&from=${dateKey}&to=${dateKey}#cash` });
    if (c.rooms?.unvalidated) alerts.push({ tone: "info", text: `${c.name}: ${c.rooms.unvalidated === 1 ? "1 expense is" : `${c.rooms.unvalidated} expenses are`} waiting for your validation.`, href: `/d/${c.id}/money?pending=1&period=year` });
    if (c.venue?.discrepancies) alerts.push({ tone: "warn", text: `${c.name}: ${formatMoney(c.venue.discrepancies)} in cash discrepancies on ${formatDateKey(dateKey)}.`, href: `/d/${c.id}/reports?period=custom&from=${dateKey}&to=${dateKey}#cash` });
    if (c.rental?.discrepancies) alerts.push({ tone: "warn", text: `${c.name}: ${formatMoney(c.rental.discrepancies)} in cash discrepancies on ${formatDateKey(dateKey)}.`, href: `/d/${c.id}/reports?period=custom&from=${dateKey}&to=${dateKey}#cash` });
    if (c.rental?.unvalidated) alerts.push({ tone: "info", text: `${c.name}: ${c.rental.unvalidated === 1 ? "1 expense is" : `${c.rental.unvalidated} expenses are`} waiting for approval.`, href: `/d/${c.id}/money?pending=1` });
    for (const w of (c.rental?.warnings || []).filter((x) => x.tone === "bad")) alerts.push({ tone: "warn", text: `${c.name}: ${w.title}${w.amount ? ` (${formatMoney(w.amount)})` : ""}.`, href: `/d/${c.id}${w.href}` });
    if (c.property?.discrepancies) alerts.push({ tone: "warn", text: `${c.name}: ${formatMoney(c.property.discrepancies)} in cash discrepancies on ${formatDateKey(dateKey)}.`, href: `/d/${c.id}/reports?period=custom&from=${dateKey}&to=${dateKey}#cash` });
    if (c.property?.unvalidated) alerts.push({ tone: "info", text: `${c.name}: ${c.property.unvalidated === 1 ? "1 expense is" : `${c.property.unvalidated} expenses are`} waiting for approval.`, href: `/d/${c.id}/money?pending=1` });
    for (const w of (c.property?.warnings || []).filter((x) => x.tone === "bad")) alerts.push({ tone: "warn", text: `${c.name}: ${w.title}${w.amount ? ` (${formatMoney(w.amount)})` : ""}.`, href: `/d/${c.id}${w.href}` });
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
    const m = withAccrual(summarizeMoney(trendTx.filter((t) => toDateKey(t.date, timeZone) === k)), extraOf(k, k));
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
