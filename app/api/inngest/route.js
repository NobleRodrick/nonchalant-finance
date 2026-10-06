import { serve } from "inngest/next";
import { inngest } from "@/lib/inngest/client";
import { missingReportReminder, monthlyStatementEmail, stockConsistencyCheck, venueMorningReminders, stayDailyReports, stayWeeklyReports, rentalMorningAlerts, rentalDailyReports, rentalWeeklyReports, rentalMonthlyReports, propertyMorningAlerts, propertyDailyReports, propertyWeeklyReports, propertyMonthlyReports } from "@/lib/inngest/function";

export const { GET, POST, PUT } = serve({
  client: inngest,
  functions: [missingReportReminder, monthlyStatementEmail, stockConsistencyCheck, venueMorningReminders, stayDailyReports, stayWeeklyReports, rentalMorningAlerts, rentalDailyReports, rentalWeeklyReports, rentalMonthlyReports, propertyMorningAlerts, propertyDailyReports, propertyWeeklyReports, propertyMonthlyReports],
});
