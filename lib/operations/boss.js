/**
 * The Boss's operations: decisions on daily reports and cash handovers, cash requests. They run
 * across his organization (not in one department) and work offline like the heads' ones.
 */
import { recordAudit } from "@/lib/audit";
import { invalid, notFound } from "@/lib/errors";
import { formatDateKey, toDateKey } from "@/lib/timezone";
import { notifyUsers } from "@/lib/notifications";
import { cancelCashRequest, createCashRequests } from "@/lib/finance/cash-requests";
import { drawerNow } from "@/lib/finance/posting-service";
import { scheduleLedgerSync } from "@/lib/accounting/schedule";
import { formatMoney } from "@/lib/format";
import { BOSS, list, text } from "./helpers";

async function reviewReport(tx, { user, timeZone }, input) {
  const decision = input.decision;
  if (!["APPROVED", "RETURNED"].includes(decision)) throw invalid("Choose approve or return.");
  const note = text(input.note);
  if (decision === "RETURNED" && !note) throw invalid("Explain what must be corrected.");
  const report = await tx.dailyReport.findFirst({ where: { id: input.reportId || "-", organizationId: user.organizationId }, include: { department: { select: { name: true } } } });
  if (!report) throw notFound("Report not found.");
  const allowed = { SUBMITTED: ["APPROVED", "RETURNED"], REVIEWED: ["APPROVED", "RETURNED"], APPROVED: ["RETURNED"] };
  if (!allowed[report.status]?.includes(decision)) throw invalid(`A report that is ${report.status.toLowerCase()} cannot be ${decision.toLowerCase()}.`);
  const updated = await tx.dailyReport.update({ where: { id: report.id }, data: { status: decision, reviewedById: user.id, reviewedAt: new Date(), reviewNotes: note } });
  await recordAudit(tx, { user, departmentId: report.departmentId, action: `DAILY_REPORT_${decision}`, entityType: "DailyReport", entityId: report.id, before: { status: report.status }, after: { status: decision, note } });
  const dateKey = toDateKey(report.reportDate, timeZone);
  await notifyUsers(tx, {
    organizationId: user.organizationId,
    userIds: [report.submittedById],
    departmentId: report.departmentId,
    kind: decision === "RETURNED" ? "REPORT_RETURNED" : "REPORT_APPROVED",
    title: decision === "RETURNED" ? `Report of ${formatDateKey(dateKey)} returned by the Boss` : `Report of ${formatDateKey(dateKey)} approved`,
    body: note,
    href: `/d/${report.departmentId}/report?date=${dateKey}`,
  });
  return { id: updated.id, reportId: updated.id, status: updated.status, reviewNotes: updated.reviewNotes };
}

/**
 * The Boss confirms or disputes a handover. A handover is reviewed once (RECORDED → CONFIRMED or
 * DISPUTED). A disputed one no longer counts anywhere (drawer, reports, books); the Boss may still
 * confirm it later (a mistake), but only while the drawer still holds that cash.
 */
async function reviewHandover(tx, { user, timeZone }, input) {
  const status = input.status;
  if (!["CONFIRMED", "DISPUTED"].includes(status)) throw invalid("Choose confirm or dispute.");
  const note = text(input.note);
  if (status === "DISPUTED" && !note) throw invalid("Explain what is wrong with this handover.");
  const h = await tx.cashHandover.findFirst({ where: { id: input.handoverId || "-", organizationId: user.organizationId }, include: { department: { select: { name: true } } } });
  if (!h) throw notFound("Handover not found.");
  if (h.status === "VOIDED") throw invalid("This handover was voided.");
  if (h.status === status) throw invalid(`This handover is already ${status.toLowerCase()}.`);
  if (h.status === "CONFIRMED") throw invalid("This handover is already confirmed: the cash was received.");
  if (h.status === "DISPUTED") {
    // Confirming it again takes the cash out of the drawer once more: it must still be there.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`drawer:${h.departmentId}`}))`;
    const drawer = await drawerNow(tx, { organizationId: user.organizationId, departmentId: h.departmentId, timeZone, at: h.date });
    if (Math.round(Number(h.amount)) > drawer.shouldRemain) {
      throw invalid(`The drawer no longer holds this cash (${formatMoney(Math.max(0, drawer.shouldRemain))} left): the head records a new handover instead.`);
    }
  }
  const updated = await tx.cashHandover.update({ where: { id: h.id }, data: { status, confirmedById: user.id, confirmedAt: new Date(), reviewNote: note } });
  // The books follow (a disputed handover posts nothing): its money record is read again.
  if (h.transactionId) await tx.transaction.update({ where: { id: h.transactionId }, data: { updatedAt: new Date() } });
  await recordAudit(tx, { user, departmentId: h.departmentId, action: `HANDOVER_${status}`, entityType: "CashHandover", entityId: h.id, before: { status: h.status }, after: { status, note } });
  if (status === "DISPUTED") {
    await notifyUsers(tx, {
      organizationId: user.organizationId,
      userIds: [h.userId],
      departmentId: h.departmentId,
      kind: "HANDOVER_DISPUTED",
      title: `The Boss disputed handover ${h.referenceNo || ""}`.trim(),
      body: note,
      href: `/d/${h.departmentId}/cash-handover`,
    });
  }
  return { ...updated, handoverId: updated.id };
}

/** After a decision on a handover: its department's books are brought up to date. */
async function afterHandoverReview(_ctx, result) {
  if (result?.departmentId) await scheduleLedgerSync(result.departmentId);
}

export const BOSS_OPERATIONS = {
  /** The Boss approves a sent report, or returns it with a note (reopens the day). */
  "report.review": { label: "Report decision", ...BOSS, run: reviewReport },
  /** The Boss confirms he received a handover, or disputes it (a disputed handover does not count). */
  "handover.review": { label: "Handover decision", ...BOSS, run: reviewHandover, after: afterHandoverReview },
  /** The Boss asks departments for the cash of a period (default: today); the heads are notified. */
  "cash.request": {
    label: "Cash request",
    ...BOSS,
    async run(tx, { user, timeZone, now }, input) {
      const todayKey = toDateKey(now, timeZone);
      const fromKey = input.fromKey || todayKey;
      const toKey = input.toKey || fromKey;
      return createCashRequests(tx, { user, departmentIds: list(input.departmentIds), fromKey, toKey, note: input.note, todayKey });
    },
  },
  /** The Boss withdraws a request that is still waiting. */
  "cash.request.cancel": {
    label: "Cash request cancelled",
    ...BOSS,
    async run(tx, { user }, input) {
      const r = await cancelCashRequest(tx, { user, requestId: input.requestId });
      return { id: r.id, status: r.status };
    },
  },
};
