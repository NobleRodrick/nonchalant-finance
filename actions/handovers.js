"use server";

import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { requireAdmin } from "@/lib/access";
import { departmentContext, postOnce, recordDate, change } from "@/lib/action-context";
import { invalid, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { postHandover } from "@/lib/finance/posting-service";
import { linkAttachments } from "@/lib/attachments";
import { notifyUsers } from "@/lib/notifications";

/**
 * The department head hands cash over to the Boss, optionally answering one of his cash requests
 * (never more than the drawer should hold). The Boss himself cannot record handovers.
 */
export async function recordHandover(input) {
  return runAction("recordHandover", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.HANDOVER_CREATE, write: true, restaurant: true });
    const date = recordDate(input?.dateKey, ctx.timeZone);
    const result = await postOnce(ctx.user, input?.idempotencyKey, async (tx, key) => {
      const res = await postHandover(tx, { ...ctx, cashRequestId: input?.cashRequestId || null, amount: input?.amount, recipientName: input?.recipientName, reference: input?.reference, note: input?.note, date, idempotencyKey: key });
      await linkAttachments(tx, { user: ctx.user, attachmentIds: input?.attachmentIds, entityType: "CashHandover", entityId: res.handover.id, departmentId: ctx.department.id });
      return res;
    });
    return { duplicate: result.duplicate, referenceNo: result.transaction.referenceNo };
  });
}

/** The Boss confirms he received the cash, or disputes the amount (a disputed handover does not count). */
export async function reviewHandover(input) {
  return runAction("reviewHandover", async () => {
    const user = await requireAdmin();
    const status = input?.status;
    if (!["CONFIRMED", "DISPUTED"].includes(status)) throw invalid("Choose confirm or dispute.");
    const note = String(input?.note || "").trim() || null;
    if (status === "DISPUTED" && !note) throw invalid("Explain what is wrong with this handover.");
    return change(async (tx) => {
      const h = await tx.cashHandover.findFirst({ where: { id: input?.handoverId, organizationId: user.organizationId }, include: { department: { select: { name: true } } } });
      if (!h) throw notFound("Handover not found.");
      if (h.status === "VOIDED") throw invalid("This handover was voided.");
      const updated = await tx.cashHandover.update({ where: { id: h.id }, data: { status, confirmedById: user.id, confirmedAt: new Date(), reviewNote: note } });
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
      return updated;
    });
  });
}

/** Handovers of one department (newest first). */
export async function listHandovers({ departmentId }) {
  const res = await runAction("listHandovers", async () => {
    const ctx = await departmentContext(departmentId, { permission: PERMISSIONS.DEPARTMENT_READ, restaurant: true, read: true });
    return db.cashHandover.findMany({
      where: { departmentId: ctx.department.id },
      include: { user: { select: { name: true } } },
      orderBy: { date: "desc" },
      take: 100,
    });
  });
  return res.success ? res.data : [];
}
