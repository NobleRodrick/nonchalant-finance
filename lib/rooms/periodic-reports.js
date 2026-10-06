/**
 * The automatic daily and weekly reports of guest houses (owner's decision: e-mail and in-app, to
 * the Boss and the department's heads). Every morning: yesterday; every Monday: last week (Monday
 * to Sunday). The summary is built from the same report as the Reports page (lib/rooms/reports),
 * and the notification opens that page with the period. Sending twice the same report (a retry of
 * the scheduled job) is skipped.
 */
import { db } from "@/lib/prisma";
import { formatMoney } from "@/lib/format";
import { reportPeriod, sendDepartmentReports } from "@/lib/reports/periodic";
import { staysReport } from "./reports";

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

export { reportPeriod };

/** Sends the daily or weekly report of every guest house of an organization (lib/reports/periodic). */
export async function sendStayReports({ organizationId, timeZone, kind = "daily", now = new Date(), client = db }) {
  return sendDepartmentReports({
    organizationId,
    timeZone,
    kind,
    now,
    client,
    domain: "ROOM_RENTAL",
    noticeKind: kind === "weekly" ? "STAY_WEEKLY_REPORT" : "STAY_DAILY_REPORT",
    build: async ({ department, fromKey, toKey, todayKey }) => {
      const digest = reportDigest(await staysReport({ departmentId: department.id, organizationId, fromKey, toKey, timeZone, todayKey, client }));
      return {
        body: `Revenue ${formatMoney(digest.revenue)} · net income ${formatMoney(digest.netIncome)} · ${digest.occupied}/${digest.apartments} occupied${digest.discrepancies ? ` · cash discrepancies ${formatMoney(digest.discrepancies)}` : ""}${digest.pendingRepairs.length ? ` · ${digest.pendingRepairs.length} repair(s) pending` : ""}`,
        email: { type: "stay-report", data: { digest } },
      };
    },
  });
}
