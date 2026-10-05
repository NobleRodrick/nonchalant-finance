"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { departmentContext, operation } from "@/lib/action-context";
import { invalid } from "@/lib/errors";
import { roundMoney } from "@/lib/money";
import { isDateKey, toDateKey } from "@/lib/timezone";
import { buildDailyReport } from "@/lib/reports/daily-report";

function dayKey(input, timeZone) {
  const today = toDateKey(new Date(), timeZone);
  const key = isDateKey(input?.dateKey) ? input.dateKey : today;
  if (key > today) throw invalid("You cannot report on a future day.");
  return key;
}

function parseCounted(value) {
  if (value === null || value === undefined || value === "") return null;
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n) || n < 0) throw invalid("Counted cash must be a whole number of francs (0 or more).");
  return n;
}

/** Saves counted cash and notes without sending. */
export async function saveReportDraft(input) {
  return runAction("saveReportDraft", () => operation("report.save", input));
}

/**
 * Sends the day's report to the Boss: the full report is frozen as a snapshot, the day is locked
 * and the Boss is notified (lib/operations/registry).
 */
export async function sendReportToBoss(input) {
  return runAction("sendReportToBoss", () => operation("report.send", input));
}

/** Boss approves a sent report, or returns it with a note (reopens the day for corrections). */
export async function reviewReport(input) {
  return runAction("reviewReport", () => operation("report.review", input));
}

/** Counted cash typed in the close dialog: live preview of the variance without saving. */
export async function previewCountedCash(input) {
  return runAction("previewCountedCash", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.REPORTS_READ, domain: "RESTAURANT" });
    const dateKey = dayKey(input, ctx.timeZone);
    const model = await buildDailyReport({ organizationId: ctx.user.organizationId, departmentId: ctx.department.id, dateKey, timeZone: ctx.timeZone, countedCash: parseCounted(input?.countedCash) });
    return { cash: model.cash, variance: roundMoney(model.cash.variance ?? 0) };
  });
}
