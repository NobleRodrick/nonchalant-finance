/**
 * The automatic daily and weekly reports of guest houses (owner's decision: e-mail and in-app, to
 * the Boss and the department's heads). Every morning: yesterday; every Monday: last week (Monday
 * to Sunday). The summary is built from the same report as the Reports page (lib/rooms/reports),
 * and the notification opens that page with the period. Sending twice the same report (a retry of
 * the scheduled job) is skipped.
 */
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { addDaysToKey, formatDateKey, periodRange, toDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { staysReport } from "./reports";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

/** The figures the owner asked for in the daily and weekly reports (pure, from staysReport). */
export function reportDigest(r) {
  return {
    bookings: r.activity.newBookings,
    arrivals: r.activity.arrivals,
    occupied: r.now.occupied,
    available: r.rooms.filter((x) => x.isActive).length - r.now.occupied,
    apartments: r.rooms.filter((x) => x.isActive).length,
    checkIns: r.activity.checkIns,
    checkOuts: r.activity.checkOuts,
    occupancyRate: r.occupancy.rate,
    revenue: r.income.revenue,
    cashReceived: r.cashFlow.receivedFromClients + r.cashFlow.otherIncome,
    handedOver: r.cashFlow.handedOver,
    toHandOver: r.verification.toHandOver,
    outstanding: r.balances.owedTotal,
    expenses: r.income.expenses,
    maintenance: r.income.repairs,
    netIncome: r.income.result,
    byApartment: r.profitability.rows.map((x) => ({ name: x.name, revenue: x.revenue, profit: x.profit })),
    discrepancies: r.verification.discrepancies,
    pendingRepairs: r.repairs.openList.map((x) => ({ room: x.room.name, title: x.title, priority: x.priority })),
    unvalidated: r.unvalidated.count,
  };
}

/** The period of a report sent on `todayKey`: yesterday (daily) or last Monday–Sunday (weekly). */
export function reportPeriod(kind, todayKey) {
  if (kind === "weekly") return periodRange("week", addDaysToKey(periodRange("week", todayKey).fromKey, -1));
  const y = addDaysToKey(todayKey, -1);
  return { fromKey: y, toKey: y };
}

/**
 * Sends the daily or weekly report of every guest house of an organization. Returns how many
 * reports were sent (one per department).
 */
export async function sendStayReports({ organizationId, timeZone, kind = "daily", now = new Date(), client = db }) {
  const departments = await client.department.findMany({ where: { organizationId, domain: "ROOM_RENTAL", isActive: true }, select: { id: true, name: true } });
  if (!departments.length) return 0;
  const todayKey = toDateKey(now, timeZone);
  const { fromKey, toKey } = reportPeriod(kind, todayKey);
  const bosses = await client.user.findMany({ where: { organizationId, role: "ADMIN", isActive: true }, select: { id: true, name: true, email: true } });
  let sent = 0;
  for (const d of departments) {
    const href = `/d/${d.id}/reports?period=custom&from=${fromKey}&to=${toKey}`;
    const noticeKind = kind === "weekly" ? "STAY_WEEKLY_REPORT" : "STAY_DAILY_REPORT";
    if (await client.notification.findFirst({ where: { organizationId, departmentId: d.id, kind: noticeKind, href }, select: { id: true } })) continue;
    const heads = await client.user.findMany({ where: { organizationId, isActive: true, role: "HEAD", memberships: { some: { departmentId: d.id, isActive: true } } }, select: { id: true, name: true, email: true } });
    const people = [...bosses, ...heads];
    const report = await staysReport({ departmentId: d.id, organizationId, fromKey, toKey, timeZone, todayKey, client });
    const digest = reportDigest(report);
    const periodLabel = fromKey === toKey ? formatDateKey(fromKey) : `${formatDateKey(fromKey, { weekday: false })} – ${formatDateKey(toKey, { weekday: false })}`;
    const title = `${d.name}: ${kind === "weekly" ? "weekly" : "daily"} report of ${periodLabel}`;
    await client.notification.createMany({
      data: people.map((p) => ({ organizationId, userId: p.id, departmentId: d.id, kind: noticeKind, title, body: `Revenue ${formatMoney(digest.revenue)} · net income ${formatMoney(digest.netIncome)} · ${digest.occupied}/${digest.apartments} occupied${digest.discrepancies ? ` · cash discrepancies ${formatMoney(digest.discrepancies)}` : ""}${digest.pendingRepairs.length ? ` · ${digest.pendingRepairs.length} repair(s) pending` : ""}`, href })),
    });
    for (const p of people) {
      if (!p.email) continue;
      await sendEmail({ to: p.email, subject: title, react: EmailTemplate({ userName: p.name, type: "stay-report", data: { departmentName: d.name, kind, periodLabel, digest, url: `${APP_URL}${href}` } }) });
    }
    sent += 1;
  }
  return sent;
}
