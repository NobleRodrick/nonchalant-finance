/**
 * Payment reminders e-mailed to tenants (owner's choice: e-mail to tenants who have an address;
 * WhatsApp links on the pages for the others). Sent by a manager from the arrears page, and
 * automatically by the morning job for rent due soon or overdue — never twice the same day for
 * the same contract (recorded in the audit trail).
 */
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { recordAudit } from "@/lib/audit";
import { readProfile } from "@/lib/business-profile";
import { formatMoney } from "@/lib/format";
import { rangeBounds } from "@/lib/timezone";
import { loadAccounts } from "./accounts";
import { CHARGE_KIND_LABELS } from "./account";
import { reminderText } from "./reminder-text";
import { unitTitle } from "./unit-math";

/**
 * E-mails the tenants of `leaseIds` (those with an e-mail address and something owed or due
 * within `soonDays`). Returns { sent, skipped }.
 */
export async function emailTenantReminders({ user, department, leaseIds, todayKey, timeZone, soonDays = 5, client = db }) {
  const leases = await client.propertyLease.findMany({ where: { id: { in: leaseIds }, departmentId: department.id, status: { in: ["ACTIVE", "ENDED"] } }, include: { client: true, unit: { include: { building: true } } } });
  const accounts = await loadAccounts({ leases, todayKey, client });
  const { start } = rangeBounds(todayKey, todayKey, timeZone);
  const business = readProfile(department).legalName || department.name;
  let sent = 0;
  let skipped = 0;
  for (const l of leases) {
    const a = accounts.get(l.id);
    const soon = a.next && Date.parse(`${a.next.dueKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`) <= soonDays * 86400000;
    if (!l.client.email || (!a.outstanding && !soon)) {
      skipped += 1;
      continue;
    }
    const already = await client.auditEvent.findFirst({ where: { departmentId: department.id, action: "PROPERTY_REMINDER_SENT", entityId: l.id, createdAt: { gte: start } }, select: { id: true } });
    if (already) {
      skipped += 1;
      continue;
    }
    const text = reminderText({ business, tenant: l.client.name, office: unitTitle(l.unit), outstanding: a.outstanding, byKind: a.byKind, monthsOwed: a.monthsOwed, next: a.next });
    const res = await sendEmail({
      to: l.client.email,
      subject: a.outstanding ? `${business}: ${formatMoney(a.outstanding)} due for ${l.unit.name}` : `${business}: rent due on ${a.next.dueKey}`,
      react: EmailTemplate({
        userName: l.client.name,
        type: "period-report",
        data: {
          heading: a.outstanding ? "Payment reminder" : "Rent due soon",
          intro: text.split("\n").slice(1).join(" "),
          sections: [{ title: unitTitle(l.unit), rows: [...Object.entries(a.byKind).map(([k, v]) => ({ label: CHARGE_KIND_LABELS[k], value: v, money: true })), { label: "Total due", value: a.outstanding || a.next?.balance || 0, money: true }] }],
        },
      }),
    });
    await recordAudit(client, { user, departmentId: department.id, action: "PROPERTY_REMINDER_SENT", entityType: "PropertyLease", entityId: l.id, after: { to: l.client.email, outstanding: a.outstanding, delivered: Boolean(res?.success) } });
    if (res?.success) sent += 1;
    else skipped += 1;
  }
  return { sent, skipped };
}
