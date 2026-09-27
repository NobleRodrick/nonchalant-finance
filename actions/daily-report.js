"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { requireAdmin, orgTimezone } from "@/lib/access";
import { departmentContext, change } from "@/lib/action-context";
import { conflict, invalid, notFound } from "@/lib/errors";
import { roundMoney } from "@/lib/money";
import { recordAudit } from "@/lib/audit";
import { serialize } from "@/lib/serialize";
import { isDateKey, startOfDateKey, toDateKey, formatDateKey } from "@/lib/timezone";
import { buildDailyReport, reportTotals, LOCKED_STATUSES } from "@/lib/reports/daily-report";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { notifyBosses, notifyUsers } from "@/lib/notifications";
import { sendReportSubmittedEmail } from "@/lib/email";

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

/**
 * Saves the report of a day. DRAFT keeps it editable (counted cash, notes);
 * SUBMITTED sends it to the Boss: the full report is frozen as a snapshot, one inventory
 * snapshot row is written per dish, the day is locked and the Boss is notified.
 */
async function saveReport(input, status) {
  const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.REPORTS_SUBMIT, write: true, restaurant: true });
  const { user, department, timeZone } = ctx;
  const dateKey = dayKey(input, timeZone);
  const reportDate = startOfDateKey(dateKey, timeZone);
  const counted = parseCounted(input?.countedCash);
  const notes = String(input?.notes || "").trim().slice(0, 2000) || null;
  if (status === "SUBMITTED" && counted === null) throw invalid("Count the cash in the drawer and enter it before sending the report.");

  const saved = await change(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`report:${department.id}:${dateKey}`}))`;
    const existing = await tx.dailyReport.findUnique({ where: { departmentId_reportDate: { departmentId: department.id, reportDate } } });
    if (existing && LOCKED_STATUSES.includes(existing.status)) {
      throw conflict(`This day's report was already sent (${existing.status.toLowerCase()}). The Boss must return it before it can change.`);
    }
    const model = await buildDailyReport({ organizationId: user.organizationId, departmentId: department.id, dateKey, timeZone, countedCash: counted, client: tx });
    const totals = reportTotals(model);
    const snapshotJson = serialize({ ...model, notes, status, submittedBy: status === "SUBMITTED" ? { id: user.id, name: user.name } : null });
    const now = new Date();
    const version = existing ? existing.version + (status === "SUBMITTED" && existing.status === "RETURNED" ? 1 : 0) : 1;
    const referenceNo = existing?.referenceNo || (status === "SUBMITTED" ? await nextReference(tx, department.id, DOC_TYPES.DAILY_REPORT) : null);
    const data = {
      status,
      version,
      referenceNo,
      schemaVersion: model.schemaVersion,
      notes,
      snapshotJson,
      totalsJson: serialize(totals),
      submittedById: status === "SUBMITTED" ? user.id : existing?.submittedById || null,
      submittedAt: status === "SUBMITTED" ? now : existing?.submittedAt || null,
    };
    const report = existing
      ? await tx.dailyReport.update({ where: { id: existing.id }, data })
      : await tx.dailyReport.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id, reportDate } });

    if (status === "SUBMITTED") {
      await tx.inventorySnapshot.deleteMany({ where: { dailyReportId: report.id } });
      if (model.stock.rows.length) {
        await tx.inventorySnapshot.createMany({
          data: model.stock.rows.map((r) => ({
            organizationId: user.organizationId,
            departmentId: department.id,
            dailyReportId: report.id,
            snapshotDate: reportDate,
            itemType: "DISH",
            menuItemId: r.dishId,
            name: r.name,
            unit: "plate",
            openingQuantity: r.opening,
            addedQuantity: r.added,
            usedQuantity: r.sold,
            wastedQuantity: r.spoiled,
            adjustedQuantity: r.corrected,
            closingQuantity: r.closing,
            unitCost: r.unitPrice,
            closingValue: r.value,
          })),
        });
      }
      await notifyBosses(tx, {
        organizationId: user.organizationId,
        departmentId: department.id,
        kind: "REPORT_SUBMITTED",
        title: `${department.name}: report of ${formatDateKey(dateKey)} sent${version > 1 ? ` (version ${version})` : ""}`,
        body: `Money in ${totals.moneyIn} · Money out ${totals.moneyOut} · Result ${totals.result} FCFA${totals.variance ? ` · Cash variance ${totals.variance}` : ""}`,
        href: `/boss/daily-reports/${report.id}`,
      });
    }
    await recordAudit(tx, {
      user,
      departmentId: department.id,
      action: status === "SUBMITTED" ? "DAILY_REPORT_SENT" : "DAILY_REPORT_SAVED",
      entityType: "DailyReport",
      entityId: report.id,
      before: existing ? { status: existing.status, version: existing.version } : undefined,
      after: { status, version, dateKey, totals },
    });
    return { report, totals };
  });
  if (status === "SUBMITTED") {
    await sendReportSubmittedEmail({ organizationId: user.organizationId, department, dateKey, totals: saved.totals, reportId: saved.report.id }).catch(() => {});
  }
  return { id: saved.report.id, status: saved.report.status, version: saved.report.version, referenceNo: saved.report.referenceNo, totals: saved.totals };
}

/** Saves counted cash and notes without sending. */
export async function saveReportDraft(input) {
  return runAction("saveReportDraft", () => saveReport(input, "DRAFT"));
}

/** Sends the day's report to the Boss (locks the day). */
export async function sendReportToBoss(input) {
  return runAction("sendReportToBoss", () => saveReport(input, "SUBMITTED"));
}

/** Boss approves a sent report, or returns it with a note (reopens the day for corrections). */
export async function reviewReport(input) {
  return runAction("reviewReport", async () => {
    const user = await requireAdmin();
    const decision = input?.decision;
    if (!["APPROVED", "RETURNED"].includes(decision)) throw invalid("Choose approve or return.");
    const note = String(input?.note || "").trim().slice(0, 2000) || null;
    if (decision === "RETURNED" && !note) throw invalid("Explain what must be corrected.");
    return change(async (tx) => {
      const report = await tx.dailyReport.findFirst({ where: { id: input?.reportId, organizationId: user.organizationId }, include: { department: { select: { name: true } } } });
      if (!report) throw notFound("Report not found.");
      const allowed = { SUBMITTED: ["APPROVED", "RETURNED"], REVIEWED: ["APPROVED", "RETURNED"], APPROVED: ["RETURNED"] };
      if (!allowed[report.status]?.includes(decision)) {
        throw invalid(`A report that is ${report.status.toLowerCase()} cannot be ${decision.toLowerCase()}.`);
      }
      const updated = await tx.dailyReport.update({ where: { id: report.id }, data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewNotes: note } });
      await recordAudit(tx, { user, departmentId: report.departmentId, action: `DAILY_REPORT_${decision}`, entityType: "DailyReport", entityId: report.id, before: { status: report.status }, after: { status: decision, note } });
      const dateKey = toDateKey(report.reportDate, orgTimezone(user));
      await notifyUsers(tx, {
        organizationId: user.organizationId,
        userIds: [report.submittedById],
        departmentId: report.departmentId,
        kind: decision === "RETURNED" ? "REPORT_RETURNED" : "REPORT_APPROVED",
        title: decision === "RETURNED" ? `Report of ${formatDateKey(dateKey)} returned by the Boss` : `Report of ${formatDateKey(dateKey)} approved`,
        body: note,
        href: `/d/${report.departmentId}/report?date=${dateKey}`,
      });
      return updated;
    });
  });
}

/** Counted cash typed in the close dialog: live preview of the variance without saving. */
export async function previewCountedCash(input) {
  return runAction("previewCountedCash", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.REPORTS_READ, restaurant: true });
    const dateKey = dayKey(input, ctx.timeZone);
    const model = await buildDailyReport({ organizationId: ctx.user.organizationId, departmentId: ctx.department.id, dateKey, timeZone: ctx.timeZone, countedCash: parseCounted(input?.countedCash) });
    return { cash: model.cash, variance: roundMoney(model.cash.variance ?? 0) };
  });
}
