import { inngest } from "./client";
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { buildStatements } from "@/lib/finance/statements";
import { insightsFromStatement } from "@/lib/ai/insights";
import { reportCalendar } from "@/lib/boss/overview";
import { dayPositions } from "@/lib/restaurant/stock-math";
import { notifyBosses } from "@/lib/notifications";
import { addDaysToKey, formatDateKey, periodRange, toDateKey, dayBounds } from "@/lib/timezone";

const APP_URL = process.env.NEXT_PUBLIC_APP_URL || "";

const orgsWithBosses = () =>
  db.organization.findMany({
    select: {
      id: true, name: true, timezone: true,
      departments: { where: { isActive: true }, select: { id: true, name: true, domain: true } },
      users: { where: { role: "ADMIN", isActive: true }, select: { email: true, name: true } },
    },
  });

/** 08:00 Africa/Douala: e-mail the Boss the departments that did not send yesterday's report. */
export const missingReportReminder = inngest.createFunction(
  { id: "missing-report-reminder", name: "Missing daily report reminder" },
  { cron: "TZ=Africa/Douala 0 8 * * *" },
  async ({ step }) => {
    const orgs = await step.run("load-organizations", orgsWithBosses);
    let emailed = 0;
    for (const org of orgs) {
      const restaurants = org.departments.filter((d) => d.domain === "RESTAURANT");
      if (!restaurants.length || !org.users.length) continue;
      await step.run(`check-${org.id}`, async () => {
        const day = addDaysToKey(toDateKey(new Date(), org.timezone), -1);
        const cal = await reportCalendar({ organizationId: org.id, departments: restaurants, fromKey: day, toKey: day, timeZone: org.timezone });
        const missing = cal.rows.filter((r) => ["LATE", "MISSING"].includes(r.cells[0].status)).map((r) => r.name);
        if (!missing.length) return;
        for (const boss of org.users) {
          await sendEmail({
            to: boss.email,
            subject: `${org.name}: ${missing.length} daily report(s) not sent for ${formatDateKey(day)}`,
            react: EmailTemplate({ userName: boss.name, type: "missing-reports", data: { dateLabel: formatDateKey(day), departments: missing, url: `${APP_URL}/boss/daily-reports` } }),
          });
          emailed += 1;
        }
      });
    }
    return { emailed };
  }
);

/** 07:00 on the 1st: last month's statement with AI insights, e-mailed to the Boss. */
export const monthlyStatementEmail = inngest.createFunction(
  { id: "monthly-statement-email", name: "Monthly statement e-mail" },
  { cron: "TZ=Africa/Douala 0 7 1 * *" },
  async ({ step }) => {
    const orgs = await step.run("load-organizations", orgsWithBosses);
    for (const org of orgs) {
      if (!org.departments.length || !org.users.length) continue;
      await step.run(`statement-${org.id}`, async () => {
        const lastMonthDay = addDaysToKey(periodRange("month", toDateKey(new Date(), org.timezone)).fromKey, -1);
        const range = periodRange("month", lastMonthDay);
        const statement = await buildStatements({ organizationId: org.id, departments: org.departments, ...range, timeZone: org.timezone });
        const periodLabel = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${range.fromKey}T00:00:00Z`));
        const { insights } = await insightsFromStatement({ label: periodLabel, statement });
        const c = statement.coverage;
        for (const boss of org.users) {
          await sendEmail({
            to: boss.email,
            subject: `${org.name}: statement for ${periodLabel}`,
            react: EmailTemplate({
              userName: boss.name,
              type: "monthly-statement",
              data: {
                organizationName: org.name,
                periodLabel,
                income: statement.income,
                handedOver: statement.cash.handedOver,
                debtsClosing: statement.debts.closing,
                insights,
                coverageText: c.final ? "Final: every daily report of the month was approved." : `Provisional: ${c.approved} of ${c.expected} daily reports approved.`,
                url: `${APP_URL}/statements?from=${range.fromKey}&to=${range.toKey}`,
              },
            }),
          });
        }
      });
    }
    return { organizations: orgs.length };
  }
);

/**
 * 02:00 every night: recompute every dish's plates from its movements. A mismatch is never
 * fixed automatically; the Boss is alerted so it can be investigated.
 */
export const stockConsistencyCheck = inngest.createFunction(
  { id: "stock-consistency-check", name: "Stock consistency check" },
  { cron: "TZ=Africa/Douala 0 2 * * *" },
  async ({ step }) => {
    const orgs = await step.run("load-organizations", () => db.organization.findMany({ select: { id: true, timezone: true } }));
    let mismatches = 0;
    for (const org of orgs) {
      await step.run(`check-${org.id}`, async () => {
        const dishes = await db.menuItem.findMany({ where: { organizationId: org.id } });
        if (!dishes.length) return;
        const movements = await db.stockMovement.findMany({ where: { organizationId: org.id, menuItemId: { not: null } }, select: { menuItemId: true, type: true, quantity: true, date: true } });
        const { start, end } = dayBounds(new Date(Date.now() + 365 * 86400000), org.timezone);
        const positions = dayPositions(dishes, movements, start, end);
        for (const d of dishes) {
          const expected = positions.find((p) => p.dishId === d.id).closing;
          if (Math.abs(Number(d.currentQuantity) - expected) > 0.0005) {
            mismatches += 1;
            await notifyBosses(db, {
              organizationId: org.id,
              departmentId: d.departmentId,
              kind: "STOCK_MISMATCH",
              title: `Stock check: "${d.name}" shows ${Number(d.currentQuantity)} plates but its records add up to ${expected}.`,
              body: "Please ask support to investigate before correcting the count.",
              href: `/d/${d.departmentId}/menu-stock`,
            });
          }
        }
      });
    }
    return { mismatches };
  }
);
