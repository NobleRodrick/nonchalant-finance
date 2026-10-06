/**
 * Event rental: the automatic daily, weekly and monthly reports (e-mail and in-app, to the Boss
 * and the department's heads; from the same report as the Reports page), and the morning alert
 * of what needs attention today (late returns, missing items, overdue and unpaid balances,
 * bookings to prepare, low stock, damaged items, refused bookings, approvals).
 */
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { formatMoney, formatRate } from "@/lib/format";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { reportRecipients, sendDepartmentReports } from "@/lib/reports/periodic";
import { rentalReport } from "./reports";
import { rentalAttention } from "./dashboard";
import { warningsLine } from "./alert-math";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
const NOTICE_KINDS = { daily: "RENTAL_DAILY_REPORT", weekly: "RENTAL_WEEKLY_REPORT", monthly: "RENTAL_MONTHLY_REPORT" };

/** The e-mail and the notification line of a report (pure, from rentalReport). */
export function rentalDigest(r) {
  const money = (label, value) => ({ label, value, money: true });
  const i = r.income;
  return {
    line: `Revenue ${formatMoney(i.revenue)} · profit ${formatMoney(i.result)} · ${r.activity.events} event(s) · collected ${formatMoney(r.cashFlow.receivedFromClients)}${r.balances.overdue ? ` · overdue ${formatMoney(r.balances.overdue)}` : ""}${r.verification.discrepancies ? ` · cash discrepancies ${formatMoney(r.verification.discrepancies)}` : ""}${r.incidents.open ? ` · ${r.incidents.open} damage(s) to settle` : ""}`,
    sections: [
      {
        title: "Activity",
        rows: [
          { label: "New bookings", value: `${r.activity.newBookings} (${r.activity.confirmed} confirmed)` },
          { label: "Events held · cancelled", value: `${r.activity.events} · ${r.activity.cancelled}` },
          { label: "Units out · back", value: `${r.activity.unitsOut} · ${r.activity.unitsBack}` },
          { label: "Damaged · broken · missing", value: `${r.incidents.DAMAGED} · ${r.incidents.BROKEN} · ${r.incidents.MISSING}` },
          { label: "Utilization of the stock", value: formatRate(r.items.utilization) },
        ],
      },
      {
        title: "Money",
        rows: [
          money("Revenue (events on their date)", i.revenue),
          money("Expenses and repairs", i.expenses + i.repairs),
          money("Items lost and depreciation", i.losses + i.depreciation),
          money("Profit", i.result),
          money("Collected from customers", r.cashFlow.receivedFromClients),
          money("Handed over to the Boss", r.cashFlow.handedOver),
          money("Cash still to hand over", r.verification.toHandOver),
          money("Owed by customers", r.balances.owedTotal),
          money("Of which overdue", r.balances.overdue),
          money("Cash discrepancies", r.verification.discrepancies),
        ],
      },
    ],
    lists: [
      { title: "Most profitable events", items: r.profitability.rows.slice(0, 5).map((e) => `${e.eventType} · ${e.client}: profit ${formatMoney(e.profit)}`) },
      { title: "Most rented items", items: r.items.mostRented.slice(0, 5).map((x) => `${x.name}: ${x.units} units`) },
      ...(r.unvalidated.count ? [{ title: "Waiting", items: [`${r.unvalidated.count} expense(s) for ${formatMoney(r.unvalidated.amount)} to approve`] }] : []),
    ],
  };
}

/** Sends the daily (yesterday), weekly (last week) or monthly (last month) report of every rental department. */
export async function sendRentalReports({ organizationId, timeZone, kind = "daily", now = new Date(), client = db }) {
  return sendDepartmentReports({
    organizationId,
    timeZone,
    kind,
    now,
    client,
    domain: "MATERIAL_RENTAL",
    noticeKind: NOTICE_KINDS[kind],
    build: async ({ department, fromKey, toKey, todayKey }) => {
      const d = rentalDigest(await rentalReport({ departmentId: department.id, organizationId, fromKey, toKey, timeZone, todayKey, client }));
      return { body: d.line, email: { type: "period-report", data: { sections: d.sections, lists: d.lists } } };
    },
  });
}

/**
 * The morning alert of every rental department: what needs attention today, to the Boss and the
 * heads (in the app; by e-mail when something is urgent). Once a day per department.
 */
export async function sendRentalAlerts({ organizationId, timeZone, now = new Date(), client = db }) {
  const departments = await client.department.findMany({ where: { organizationId, domain: "MATERIAL_RENTAL", isActive: true }, select: { id: true, name: true } });
  const todayKey = toDateKey(now, timeZone);
  const { start } = rangeBounds(todayKey, todayKey, timeZone);
  let sent = 0;
  for (const d of departments) {
    if (await client.notification.findFirst({ where: { organizationId, departmentId: d.id, kind: "RENTAL_ALERTS", createdAt: { gte: start } }, select: { id: true } })) continue;
    const { warnings } = await rentalAttention({ departmentId: d.id, todayKey, timeZone, client });
    if (!warnings.length) continue;
    const people = await reportRecipients(client, organizationId, d.id);
    const href = `/d/${d.id}`;
    const title = `${d.name}: ${warnings.length} point(s) need attention today`;
    await client.notification.createMany({ data: people.map((p) => ({ organizationId, userId: p.id, departmentId: d.id, kind: "RENTAL_ALERTS", title, body: warningsLine(warnings).slice(0, 1000), href })) });
    const urgent = warnings.filter((w) => w.tone === "bad");
    if (urgent.length) {
      for (const p of people) {
        if (!p.email) continue;
        await sendEmail({
          to: p.email,
          subject: title,
          react: EmailTemplate({ userName: p.name, type: "period-report", data: { departmentName: d.name, heading: title, intro: "here is what needs attention today.", lists: warnings.map((w) => ({ title: w.title, items: w.rows.slice(0, 5).map((x) => `${x.label}${x.amount ? `: ${formatMoney(x.amount)}` : x.note ? ` (${x.note})` : ""}`) })), url: `${APP_URL}${href}`, button: "Open the dashboard" } }),
        });
      }
    }
    sent += 1;
  }
  return sent;
}
