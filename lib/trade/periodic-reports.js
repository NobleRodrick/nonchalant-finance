/**
 * Shops, bars, pressings, car washes and other activities: the automatic daily, weekly and monthly
 * reports (in the app and by e-mail, to the Boss and the department's heads; from the same report
 * as the Reports page), and the morning alert of what needs attention (low stock, tabs left open,
 * debts and supplier bills due, tickets late, ready or unclaimed, customers who left owing).
 */
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { reportRecipients, sendDepartmentReports } from "@/lib/reports/periodic";
import { TRADE_DOMAINS, SERVICE_DOMAINS } from "@/lib/domains/trade";
import { tradeDashboard, tradeReport } from "./queries";
import { serviceDashboard, serviceReport } from "@/lib/services/queries";
import { tradeDigest } from "./digest";
import { farmBoard, farmWarnings, lastEventKeys } from "@/lib/farm/queries";
import { salonDashboard } from "@/lib/salon/queries";

export { tradeDigest };

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
export const TRADE_REPORT_DOMAINS = ["SHOP", "BAR", "PRESSING", "CAR_WASH", "OTHER", "PRODUCTION", "FARM", "SALON"];
const NOTICE_KINDS = { daily: "TRADE_DAILY_REPORT", weekly: "TRADE_WEEKLY_REPORT", monthly: "TRADE_MONTHLY_REPORT" };

async function reportOf(department, organizationId, fromKey, toKey, timeZone, todayKey, client) {
  const args = { department, organizationId, fromKey, toKey, timeZone, todayKey, client };
  const [trade, services] = await Promise.all([TRADE_DOMAINS.includes(department.domain) ? tradeReport(args) : null, SERVICE_DOMAINS.includes(department.domain) ? serviceReport(args) : null]);
  return { trade, services };
}

export async function sendTradeReports({ organizationId, timeZone, kind = "daily", now = new Date(), client = db }) {
  let sent = 0;
  for (const domain of TRADE_REPORT_DOMAINS) {
    sent += await sendDepartmentReports({
      organizationId,
      timeZone,
      kind,
      now,
      client,
      domain,
      noticeKind: NOTICE_KINDS[kind],
      build: async ({ department, fromKey, toKey, todayKey }) => {
        const full = await client.department.findUnique({ where: { id: department.id } });
        const d = tradeDigest(await reportOf(full, organizationId, fromKey, toKey, timeZone, todayKey, client), kind);
        return { body: d.line, email: { type: "period-report", data: { sections: d.sections, lists: d.lists } } };
      },
    });
  }
  return sent;
}

/** What needs attention this morning in a department (the dashboard's alerts). */
export async function tradeAttention({ department, todayKey, timeZone, now = new Date(), client = db }) {
  const [t, s, farm, salon] = await Promise.all([
    TRADE_DOMAINS.includes(department.domain) ? tradeDashboard({ department, todayKey, timeZone, now, client }) : null,
    SERVICE_DOMAINS.includes(department.domain) ? serviceDashboard({ department, todayKey, timeZone, now, client }) : null,
    department.domain === "FARM" ? Promise.all([farmBoard({ departmentId: department.id, todayKey, timeZone, status: "ACTIVE", client }), lastEventKeys({ departmentId: department.id, timeZone, client })]).then(([b, last]) => farmWarnings(b.batches, todayKey, last)) : [],
    department.domain === "SALON" ? salonDashboard({ department, todayKey, timeZone, now, client }).then((x) => x.warnings) : [],
  ]);
  return [...farm, ...salon, ...(t?.warnings || []), ...(s?.warnings || [])];
}

/** The morning alert of each department of these types: in the app; by e-mail when something is urgent. Once a day. */
export async function sendTradeAlerts({ organizationId, timeZone, now = new Date(), client = db }) {
  const departments = await client.department.findMany({ where: { organizationId, domain: { in: TRADE_REPORT_DOMAINS }, isActive: true } });
  const todayKey = toDateKey(now, timeZone);
  const { start } = rangeBounds(todayKey, todayKey, timeZone);
  let sent = 0;
  for (const d of departments) {
    if (await client.notification.findFirst({ where: { organizationId, departmentId: d.id, kind: "TRADE_ALERTS", createdAt: { gte: start } }, select: { id: true } })) continue;
    const warnings = await tradeAttention({ department: d, todayKey, timeZone, now, client });
    if (!warnings.length) continue;
    const people = await reportRecipients(client, organizationId, d.id);
    const href = `/d/${d.id}`;
    const title = `${d.name}: ${warnings.length} point(s) need attention today`;
    const body = warnings.map((w) => `${w.title}${w.amount ? ` (${formatMoney(w.amount)})` : ""}`).join(" · ");
    await client.notification.createMany({ data: people.map((p) => ({ organizationId, userId: p.id, departmentId: d.id, kind: "TRADE_ALERTS", title, body: body.slice(0, 1000), href })) });
    if (warnings.some((w) => w.tone === "bad")) {
      for (const p of people) {
        if (!p.email) continue;
        await sendEmail({ to: p.email, subject: title, react: EmailTemplate({ userName: p.name, type: "period-report", data: { departmentName: d.name, heading: title, intro: "here is what needs attention today.", button: "Open the dashboard", lists: warnings.map((w) => ({ title: w.title, items: (w.rows || []).slice(0, 5).map((x) => `${x.label}${x.amount ? `: ${formatMoney(x.amount)}` : x.note ? ` (${x.note})` : ""}`) })), url: `${APP_URL}${href}` } }) });
      }
    }
    sent += 1;
  }
  return sent;
}
