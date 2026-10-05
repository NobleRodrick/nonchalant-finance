import { db } from "@/lib/prisma";
import { startOfDateKey } from "@/lib/timezone";
import { LOCKED_STATUSES } from "@/lib/reports/daily-report";

/** Report status of a department's day and whether its records can still change. */
export async function dayStatus(departmentId, dateKey, timeZone, client = db) {
  const report = await client.dailyReport.findUnique({
    where: { departmentId_reportDate: { departmentId, reportDate: startOfDateKey(dateKey, timeZone) } },
    select: { id: true, status: true, reviewNotes: true, version: true, submittedAt: true },
  });
  const status = report?.status || "DRAFT";
  return { status, locked: LOCKED_STATUSES.includes(status), report };
}
