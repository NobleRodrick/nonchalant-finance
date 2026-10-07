import { inngest } from "./client";
import { db } from "@/lib/prisma";
import EmailTemplate from "@/emails/template";
import { sendEmail } from "@/lib/email";
import { buildStatements } from "@/lib/finance/statements";
import { insightsFromStatement } from "@/lib/ai/insights";
import { reportCalendar } from "@/lib/boss/overview";
import { dayPositions } from "@/lib/restaurant/stock-math";
import { notifyBosses } from "@/lib/notifications";
import { sendVenueReminders } from "@/lib/venue/reminders";
import { sendStayReports } from "@/lib/rooms/periodic-reports";
import { sendRentalAlerts, sendRentalReports } from "@/lib/rental/periodic-reports";
import { sendPropertyAlerts, sendPropertyReports } from "@/lib/property/periodic-reports";
import { sendTradeAlerts, sendTradeReports, TRADE_REPORT_DOMAINS } from "@/lib/trade/periodic-reports";
import { syncCompany, syncDepartment } from "@/lib/accounting/sync";
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

/** 07:30 every day: event venues' reservations whose hold is over, and events soon with a balance owed. */
export const venueMorningReminders = inngest.createFunction(
  { id: "venue-morning-reminders", name: "Event venue reminders" },
  { cron: "TZ=Africa/Douala 30 7 * * *" },
  async ({ step }) => {
    const orgs = await step.run("load-organizations", () => db.organization.findMany({ where: { departments: { some: { domain: "EVENT_VENUE", isActive: true } } }, select: { id: true, timezone: true } }));
    let sent = 0;
    for (const org of orgs) sent += await step.run(`remind-${org.id}`, () => sendVenueReminders({ organizationId: org.id, timeZone: org.timezone }));
    return { sent };
  }
);

const orgsWithGuestHouses = () => db.organization.findMany({ where: { departments: { some: { domain: "ROOM_RENTAL", isActive: true } } }, select: { id: true, timezone: true } });

/** 07:15 every day: each guest house's report of yesterday, e-mailed and in the app (Boss and heads). */
export const stayDailyReports = inngest.createFunction(
  { id: "stay-daily-reports", name: "Guest house daily reports" },
  { cron: "TZ=Africa/Douala 15 7 * * *" },
  async ({ step }) => {
    const orgs = await step.run("load-organizations", orgsWithGuestHouses);
    let sent = 0;
    for (const org of orgs) sent += await step.run(`daily-${org.id}`, () => sendStayReports({ organizationId: org.id, timeZone: org.timezone, kind: "daily" }));
    return { sent };
  }
);

/** 07:20 every Monday: each guest house's report of last week (Monday to Sunday). */
export const stayWeeklyReports = inngest.createFunction(
  { id: "stay-weekly-reports", name: "Guest house weekly reports" },
  { cron: "TZ=Africa/Douala 20 7 * * 1" },
  async ({ step }) => {
    const orgs = await step.run("load-organizations", orgsWithGuestHouses);
    let sent = 0;
    for (const org of orgs) sent += await step.run(`weekly-${org.id}`, () => sendStayReports({ organizationId: org.id, timeZone: org.timezone, kind: "weekly" }));
    return { sent };
  }
);

const orgsWithRentals = () => db.organization.findMany({ where: { departments: { some: { domain: "MATERIAL_RENTAL", isActive: true } } }, select: { id: true, timezone: true } });

/** Runs `send` for every organization with an event rental department (one step each). */
async function forRentalOrgs(step, name, send) {
  const orgs = await step.run("load-organizations", orgsWithRentals);
  let sent = 0;
  for (const org of orgs) sent += await step.run(`${name}-${org.id}`, () => send(org));
  return { sent };
}

/** 07:00 every day: what needs attention today in each event rental department. */
export const rentalMorningAlerts = inngest.createFunction(
  { id: "rental-morning-alerts", name: "Event rental morning alerts" },
  { cron: "TZ=Africa/Douala 0 7 * * *" },
  ({ step }) => forRentalOrgs(step, "alerts", (org) => sendRentalAlerts({ organizationId: org.id, timeZone: org.timezone }))
);

/** 07:25 every day: each event rental department's report of yesterday. */
export const rentalDailyReports = inngest.createFunction(
  { id: "rental-daily-reports", name: "Event rental daily reports" },
  { cron: "TZ=Africa/Douala 25 7 * * *" },
  ({ step }) => forRentalOrgs(step, "daily", (org) => sendRentalReports({ organizationId: org.id, timeZone: org.timezone, kind: "daily" }))
);

/** 07:30 every Monday: last week (Monday to Sunday). */
export const rentalWeeklyReports = inngest.createFunction(
  { id: "rental-weekly-reports", name: "Event rental weekly reports" },
  { cron: "TZ=Africa/Douala 30 7 * * 1" },
  ({ step }) => forRentalOrgs(step, "weekly", (org) => sendRentalReports({ organizationId: org.id, timeZone: org.timezone, kind: "weekly" }))
);

/** 07:35 on the 1st: last month. */
export const rentalMonthlyReports = inngest.createFunction(
  { id: "rental-monthly-reports", name: "Event rental monthly reports" },
  { cron: "TZ=Africa/Douala 35 7 1 * *" },
  ({ step }) => forRentalOrgs(step, "monthly", (org) => sendRentalReports({ organizationId: org.id, timeZone: org.timezone, kind: "monthly" }))
);

const orgsWithProperties = () => db.organization.findMany({ where: { departments: { some: { domain: "PROPERTY_RENTAL", isActive: true } } }, select: { id: true, timezone: true } });

async function forPropertyOrgs(step, name, send) {
  const orgs = await step.run("load-organizations", orgsWithProperties);
  let sent = 0;
  for (const org of orgs) sent += await step.run(`${name}-${org.id}`, () => send(org));
  return { sent };
}

const orgsWithTrade = () => db.organization.findMany({ where: { departments: { some: { domain: { in: TRADE_REPORT_DOMAINS }, isActive: true } } }, select: { id: true, timezone: true } });

async function forTradeOrgs(step, name, send) {
  const orgs = await step.run("load-organizations", orgsWithTrade);
  let sent = 0;
  for (const org of orgs) sent += await step.run(`${name}-${org.id}`, () => send(org));
  return { sent };
}

/** 06:55 every day: what needs attention in each shop, bar, pressing, car wash and other activity. */
export const tradeMorningAlerts = inngest.createFunction(
  { id: "trade-morning-alerts", name: "Shops, bars, pressings, car washes: morning alerts" },
  { cron: "TZ=Africa/Douala 55 6 * * *" },
  ({ step }) => forTradeOrgs(step, "alerts", (org) => sendTradeAlerts({ organizationId: org.id, timeZone: org.timezone }))
);

/** 07:05 every day: yesterday's report of each of these departments. */
export const tradeDailyReports = inngest.createFunction(
  { id: "trade-daily-reports", name: "Shops, bars, pressings, car washes: daily reports" },
  { cron: "TZ=Africa/Douala 5 7 * * *" },
  ({ step }) => forTradeOrgs(step, "daily", (org) => sendTradeReports({ organizationId: org.id, timeZone: org.timezone, kind: "daily" }))
);

/** Mondays 07:45: last week's report. */
export const tradeWeeklyReports = inngest.createFunction(
  { id: "trade-weekly-reports", name: "Shops, bars, pressings, car washes: weekly reports" },
  { cron: "TZ=Africa/Douala 45 7 * * 1" },
  ({ step }) => forTradeOrgs(step, "weekly", (org) => sendTradeReports({ organizationId: org.id, timeZone: org.timezone, kind: "weekly" }))
);

/** The 1st at 07:50: last month's report. */
export const tradeMonthlyReports = inngest.createFunction(
  { id: "trade-monthly-reports", name: "Shops, bars, pressings, car washes: monthly reports" },
  { cron: "TZ=Africa/Douala 50 7 1 * *" },
  ({ step }) => forTradeOrgs(step, "monthly", (org) => sendTradeReports({ organizationId: org.id, timeZone: org.timezone, kind: "monthly" }))
);

/** 06:50 every day: alerts of each property rental department, and tenants' payment reminders. */
export const propertyMorningAlerts = inngest.createFunction(
  { id: "property-morning-alerts", name: "Property rental morning alerts and reminders" },
  { cron: "TZ=Africa/Douala 50 6 * * *" },
  ({ step }) => forPropertyOrgs(step, "alerts", (org) => sendPropertyAlerts({ organizationId: org.id, timeZone: org.timezone }))
);

/** 07:10 every day: yesterday's report. */
export const propertyDailyReports = inngest.createFunction(
  { id: "property-daily-reports", name: "Property rental daily reports" },
  { cron: "TZ=Africa/Douala 10 7 * * *" },
  ({ step }) => forPropertyOrgs(step, "daily", (org) => sendPropertyReports({ organizationId: org.id, timeZone: org.timezone, kind: "daily" }))
);

/** 07:40 every Monday: last week. */
export const propertyWeeklyReports = inngest.createFunction(
  { id: "property-weekly-reports", name: "Property rental weekly reports" },
  { cron: "TZ=Africa/Douala 40 7 * * 1" },
  ({ step }) => forPropertyOrgs(step, "weekly", (org) => sendPropertyReports({ organizationId: org.id, timeZone: org.timezone, kind: "weekly" }))
);

/** 07:45 on the 1st: last month. */
export const propertyMonthlyReports = inngest.createFunction(
  { id: "property-monthly-reports", name: "Property rental monthly reports" },
  { cron: "TZ=Africa/Douala 45 7 1 * *" },
  ({ step }) => forPropertyOrgs(step, "monthly", (org) => sendPropertyReports({ organizationId: org.id, timeZone: org.timezone, kind: "monthly" }))
);

/** 02:30 every night: the ledgers of Full-accounting companies catch up (months of rent, nights, depreciation). */
export const ledgerNightlySync = inngest.createFunction(
  { id: "ledger-nightly-sync", name: "Accounting: nightly ledger sync" },
  { cron: "TZ=Africa/Douala 30 2 * * *" },
  async ({ step }) => {
    const companies = await step.run("companies", () => db.company.findMany({ where: { accountingLevel: "FULL" }, select: { id: true } }));
    let posted = 0;
    for (const c of companies) {
      const r = await step.run(`sync-${c.id}`, () => syncCompany(c.id, { full: true }));
      posted += r.posted;
    }
    return { companies: companies.length, posted };
  }
);

/** After records are written in a Full-accounting department: its ledger (debounced per department). */
export const ledgerDepartmentSync = inngest.createFunction(
  { id: "ledger-department-sync", name: "Accounting: ledger sync of a department", debounce: { key: "event.data.departmentId", period: "20s" } },
  { event: "accounting/department.changed" },
  async ({ event, step }) => step.run("sync", () => syncDepartment(event.data.departmentId))
);
