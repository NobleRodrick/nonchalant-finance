/**
 * Automatic periodic reports of departments (daily, weekly, monthly), e-mailed and in the app to
 * the Boss and the department's heads. Each department type supplies `build` (its figures, the
 * notification line and the e-mail); this module picks the period, the people, skips a report
 * already sent (a retry of the scheduled job) and delivers it. The notification opens the Reports
 * page with the period.
 */
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { addDaysToKey, formatDateKey, periodRange, toDateKey } from "@/lib/timezone";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";
export const PERIOD_WORDS = { daily: "daily", weekly: "weekly", monthly: "monthly" };

/**
 * The period of a report sent on `todayKey`: yesterday (daily), last Monday–Sunday (weekly) or
 * last calendar month (monthly).
 */
export function reportPeriod(kind, todayKey) {
  if (kind === "weekly") return periodRange("week", addDaysToKey(periodRange("week", todayKey).fromKey, -1));
  if (kind === "monthly") return periodRange("month", addDaysToKey(periodRange("month", todayKey).fromKey, -1));
  const y = addDaysToKey(todayKey, -1);
  return { fromKey: y, toKey: y };
}

/** "Mon 09 Nov 2026" or "02 Nov 2026 – 08 Nov 2026". */
export function periodText(fromKey, toKey) {
  return fromKey === toKey ? formatDateKey(fromKey) : `${formatDateKey(fromKey, { weekday: false })} – ${formatDateKey(toKey, { weekday: false })}`;
}

/** The Boss(es) and the active heads of a department. */
export async function reportRecipients(client, organizationId, departmentId) {
  const [bosses, heads] = await Promise.all([
    client.user.findMany({ where: { organizationId, role: "ADMIN", isActive: true }, select: { id: true, name: true, email: true } }),
    client.user.findMany({ where: { organizationId, isActive: true, role: "HEAD", memberships: { some: { departmentId, isActive: true } } }, select: { id: true, name: true, email: true } }),
  ]);
  return [...bosses, ...heads];
}

/**
 * Sends the `kind` report of every active department of type `domain` of an organization.
 * `build({ department, fromKey, toKey, todayKey, periodLabel, title })` → { body, email: { type,
 * data } } (async). Returns how many reports were sent.
 */
export async function sendDepartmentReports({ organizationId, timeZone, kind = "daily", domain, noticeKind, build, now = new Date(), client = db }) {
  const departments = await client.department.findMany({ where: { organizationId, domain, isActive: true }, select: { id: true, name: true, domain: true } });
  if (!departments.length) return 0;
  const todayKey = toDateKey(now, timeZone);
  const { fromKey, toKey } = reportPeriod(kind, todayKey);
  const periodLabel = periodText(fromKey, toKey);
  let sent = 0;
  for (const department of departments) {
    const href = `/d/${department.id}/reports?period=custom&from=${fromKey}&to=${toKey}`;
    if (await client.notification.findFirst({ where: { organizationId, departmentId: department.id, kind: noticeKind, href }, select: { id: true } })) continue;
    const title = `${department.name}: ${PERIOD_WORDS[kind] || kind} report of ${periodLabel}`;
    const people = await reportRecipients(client, organizationId, department.id);
    const { body, email } = await build({ department, fromKey, toKey, todayKey, periodLabel, title });
    await client.notification.createMany({ data: people.map((p) => ({ organizationId, userId: p.id, departmentId: department.id, kind: noticeKind, title, body: body.slice(0, 1000), href })) });
    for (const p of people) {
      if (!p.email) continue;
      await sendEmail({ to: p.email, subject: title, react: EmailTemplate({ userName: p.name, type: email.type, data: { ...email.data, departmentName: department.name, kind, periodLabel, url: `${APP_URL}${href}` } }) });
    }
    sent += 1;
  }
  return sent;
}
