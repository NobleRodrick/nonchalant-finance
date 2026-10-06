/**
 * Property rental: the automatic daily, weekly and monthly reports (e-mail and in-app, to the Boss
 * and the department's heads — manager and accountant; from the same report as the Reports page),
 * the morning alert of what needs attention, and the tenants' reminders (e-mail to tenants with an
 * address whose rent is due within 5 days or overdue; at most once a day each).
 */
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { formatMoney } from "@/lib/format";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { reportRecipients, sendDepartmentReports } from "@/lib/reports/periodic";
import { CHARGE_KIND_LABELS } from "./account";
import { propertyReport } from "./reports";
import { propertyAttention } from "./dashboard";
import { warningsLine } from "./alert-math";
import { emailTenantReminders } from "./reminders";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const NOTICE_KINDS = { daily: "PROPERTY_DAILY_REPORT", weekly: "PROPERTY_WEEKLY_REPORT", monthly: "PROPERTY_MONTHLY_REPORT" };

/** The e-mail and the notification line of a report (pure, from propertyReport). */
export function propertyDigest(r, kind = "daily") {
  const money = (label, value) => ({ label, value, money: true });
  const i = r.income;
  const cf = r.cashFlow;
  const sections = [
    {
      title: "Money",
      rows: [
        money("Rent collected", r.rent.collected),
        money("Utility payments and charges billed", i.utilities + i.otherCharges),
        money("Other income", i.otherIncome),
        money("Deposits received", cf.depositsIn),
        money("Deposits refunded", cf.depositsOut),
        money("Expenses", i.expenses),
        money("Cash collected", cf.byMethod.CASH || 0),
        money("Bank and Mobile Money collections", cf.bankAndMomo),
        money("Outstanding debts (all tenants)", r.arrears.owed),
        money("Of which overdue", r.arrears.overdue),
      ],
    },
    {
      title: "Offices and tenants",
      rows: [
        { label: "Occupied · vacant offices", value: `${r.occupancy.OCCUPIED} · ${r.occupancy.vacant} of ${r.occupancy.total}` },
        { label: "Occupancy rate", value: `${r.occupancy.occupancyRate}%` },
        { label: "New tenants", value: r.activity.newTenants.map((x) => `${x.tenant} (${x.unit})`).join(", ") || "—" },
        { label: "Offices vacated", value: r.activity.vacated.map((x) => `${x.unit} (${x.tenant})`).join(", ") || "—" },
        { label: "Maintenance reported · done · open", value: `${r.activity.maintenanceOpened} · ${r.activity.maintenanceDone} · ${r.activity.maintenanceOpen}` },
      ],
    },
  ];
  if (kind === "monthly") {
    sections.push({
      title: "Income statement",
      rows: [
        money("Rent", i.rentNet),
        ...Object.entries(i.byKind).map(([k, v]) => money(CHARGE_KIND_LABELS[k], v)),
        money("Other income", i.otherIncome),
        money("Gross income", i.revenue),
        money("Total expenses", i.expenses),
        money("Net rental income", i.net),
        money("Rent expected", r.rent.expected),
        money("Deposits held", r.deposits.held),
      ],
    });
  }
  return {
    line: `Rent collected ${formatMoney(r.rent.collected)} · income ${formatMoney(i.revenue)} · expenses ${formatMoney(i.expenses)} · owed ${formatMoney(r.arrears.owed)} · ${r.occupancy.OCCUPIED}/${r.occupancy.total} occupied${r.verification.discrepancies ? ` · cash discrepancies ${formatMoney(r.verification.discrepancies)}` : ""}`,
    sections,
    lists: [
      { title: "Who owes the most", items: r.arrears.rows.slice(0, 5).map((x) => `${x.tenant} (${x.unit}): ${formatMoney(x.balance)}, ${x.monthsOwed} month(s), ${x.daysOverdue} days late`) },
      { title: "By building", items: r.by.buildings.map((b) => `${b.name}: income ${formatMoney(b.revenue)}, expenses ${formatMoney(b.expenses)}`) },
      ...(r.unvalidated.count ? [{ title: "Waiting", items: [`${r.unvalidated.count} expense(s) for ${formatMoney(r.unvalidated.amount)} to approve`] }] : []),
    ],
  };
}

export async function sendPropertyReports({ organizationId, timeZone, kind = "daily", now = new Date(), client = db }) {
  return sendDepartmentReports({
    organizationId,
    timeZone,
    kind,
    now,
    client,
    domain: "PROPERTY_RENTAL",
    noticeKind: NOTICE_KINDS[kind],
    build: async ({ department, fromKey, toKey, todayKey }) => {
      const d = propertyDigest(await propertyReport({ departmentId: department.id, organizationId, fromKey, toKey, timeZone, todayKey, client }), kind);
      return { body: d.line, email: { type: "period-report", data: { sections: d.sections, lists: d.lists } } };
    },
  });
}

/**
 * The morning run of every property rental department: the alert to management (in the app; by
 * e-mail when something is urgent), then the tenants' reminders. Once a day per department.
 */
export async function sendPropertyAlerts({ organizationId, timeZone, now = new Date(), client = db }) {
  const departments = await client.department.findMany({ where: { organizationId, domain: "PROPERTY_RENTAL", isActive: true } });
  const todayKey = toDateKey(now, timeZone);
  const { start } = rangeBounds(todayKey, todayKey, timeZone);
  const boss = await client.user.findFirst({ where: { organizationId, role: "ADMIN" } });
  let sent = 0;
  for (const d of departments) {
    if (await client.notification.findFirst({ where: { organizationId, departmentId: d.id, kind: "PROPERTY_ALERTS", createdAt: { gte: start } }, select: { id: true } })) continue;
    const { warnings, leases } = await propertyAttention({ departmentId: d.id, todayKey, timeZone, client });
    // Tenants: overdue or due within 5 days, with an e-mail address.
    const remind = leases.filter((l) => l.status === "ACTIVE" && l.client.email && (l.account?.overdue > 0 || l.account?.next)).map((l) => l.id);
    if (remind.length && boss) await emailTenantReminders({ user: boss, department: d, leaseIds: remind, todayKey, timeZone, client });
    if (!warnings.length) continue;
    const people = await reportRecipients(client, organizationId, d.id);
    const href = `/d/${d.id}`;
    const title = `${d.name}: ${warnings.length} point(s) need attention today`;
    await client.notification.createMany({ data: people.map((p) => ({ organizationId, userId: p.id, departmentId: d.id, kind: "PROPERTY_ALERTS", title, body: warningsLine(warnings).slice(0, 1000), href })) });
    if (warnings.some((w) => w.tone === "bad")) {
      for (const p of people) {
        if (!p.email) continue;
        await sendEmail({ to: p.email, subject: title, react: EmailTemplate({ userName: p.name, type: "period-report", data: { departmentName: d.name, heading: title, intro: "here is what needs attention today.", button: "Open the dashboard", lists: warnings.map((w) => ({ title: w.title, items: w.rows.slice(0, 5).map((x) => `${x.label}${x.amount ? `: ${formatMoney(x.amount)}` : x.note ? ` (${x.note})` : ""}`) })), url: `${APP_URL}${href}` } }) });
      }
    }
    sent += 1;
  }
  return sent;
}
