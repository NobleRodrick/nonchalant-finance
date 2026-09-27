import { conflict, forbidden } from "@/lib/errors";
import { dayBounds, formatDateKey } from "@/lib/timezone";

const LOCKED_REPORT_STATUSES = ["SUBMITTED", "REVIEWED", "APPROVED"];

/**
 * Financial history is protected:
 * - nothing may be posted into (or voided from) a CLOSED accounting period;
 * - nothing may be posted into (or voided from) a business day whose daily report has
 *   been submitted/approved, until the boss returns (reopens) it.
 */
export async function assertCanPost(client, { organizationId, departmentId, date, timeZone }) {
  const when = date instanceof Date ? date : new Date(date || Date.now());

  const closed = await client.accountingPeriod.findFirst({
    where: {
      organizationId,
      status: "CLOSED",
      startDate: { lte: when },
      endDate: { gte: when },
    },
    select: { name: true },
  });
  if (closed) {
    throw forbidden(`The accounting period "${closed.name}" is closed. Ask the Boss to reopen it.`);
  }

  if (departmentId) {
    const { key, start } = dayBounds(when, timeZone);
    const report = await client.dailyReport.findUnique({
      where: { departmentId_reportDate: { departmentId, reportDate: start } },
      select: { status: true },
    });
    if (report && LOCKED_REPORT_STATUSES.includes(report.status)) {
      throw conflict(
        `The daily report for ${formatDateKey(key)} is ${report.status.toLowerCase()}. ` +
          "It must be returned by the Boss before its figures can change."
      );
    }
  }
}

export function isReportLocked(status) {
  return LOCKED_REPORT_STATUSES.includes(status);
}
