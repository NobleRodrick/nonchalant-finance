import { Resend } from "resend";

/** Server-only email sender (not a server action, so clients cannot call it). */
export async function sendEmail({ to, subject, react }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn(JSON.stringify({ level: "warn", event: "email_skipped", reason: "RESEND_API_KEY missing", subject }));
    return { success: false, error: "Email not configured" };
  }
  const resend = new Resend(process.env.RESEND_API_KEY);
  try {
    const data = await resend.emails.send({
      from: process.env.EMAIL_FROM || "Springer Finance <onboarding@resend.dev>",
      to,
      subject,
      react,
    });
    return { success: true, data };
  } catch (error) {
    console.error(JSON.stringify({ level: "error", event: "email_failed", message: error.message, subject }));
    return { success: false, error: error.message };
  }
}

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

/** E-mails every Boss when a department sends its daily report (skipped when e-mail is not configured). */
export async function sendReportSubmittedEmail({ organizationId, department, dateKey, totals, reportId }) {
  if (!process.env.RESEND_API_KEY) return { success: false, skipped: true };
  const { db } = await import("@/lib/prisma");
  const { default: EmailTemplate } = await import("@/emails/template");
  const { formatDateKey } = await import("@/lib/timezone");
  const bosses = await db.user.findMany({ where: { organizationId, role: "ADMIN", isActive: true }, select: { email: true, name: true } });
  for (const boss of bosses) {
    await sendEmail({
      to: boss.email,
      subject: `${department.name}: daily report of ${formatDateKey(dateKey)}`,
      react: EmailTemplate({
        userName: boss.name,
        type: "report-submitted",
        data: { departmentName: department.name, dateLabel: formatDateKey(dateKey), totals, url: `${APP_URL}/boss/daily-reports/${reportId}` },
      }),
    });
  }
  return { success: true };
}
