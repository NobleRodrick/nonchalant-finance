"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS, roleHasPermission } from "@/lib/permissions";
import { departmentContext, postOnce, recordDate } from "@/lib/action-context";
import { forbidden, notFound } from "@/lib/errors";
import { db } from "@/lib/prisma";
import { postMoneyEntry, postPurchase, voidTransaction, SIMPLE_MONEY_TYPES } from "@/lib/finance/posting-service";
import { linkAttachments } from "@/lib/attachments";
import { requireOrgUser, resolveDepartment, orgTimezone } from "@/lib/access";

/** Rent income, other income, expense, other expense or a standalone discount. */
export async function recordMoney(input) {
  return runAction("recordMoney", async () => {
    const cfg = SIMPLE_MONEY_TYPES[input?.type];
    const ctx = await departmentContext(input?.departmentId, { permission: cfg?.permission || PERMISSIONS.MONEY_IN_CREATE, write: true, restaurant: true });
    const date = recordDate(input?.dateKey, ctx.timeZone);
    const result = await postOnce(ctx.user, input?.idempotencyKey, async (tx, key) => {
      const res = await postMoneyEntry(tx, {
        ...ctx,
        type: input?.type,
        amount: input?.amount,
        category: input?.category,
        paymentMethod: input?.paymentMethod || "CASH",
        counterparty: input?.counterparty,
        reference: input?.reference,
        description: input?.description,
        date,
        idempotencyKey: key,
      });
      await linkAttachments(tx, { user: ctx.user, attachmentIds: input?.attachmentIds, entityType: "Transaction", entityId: res.transaction.id, departmentId: ctx.department.id });
      return res;
    });
    return { duplicate: result.duplicate, referenceNo: result.transaction.referenceNo, transactionId: result.transaction.id };
  });
}

/** A purchase (money out); may also add plates to dishes. */
export async function recordPurchase(input) {
  return runAction("recordPurchase", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.PURCHASES_CREATE, write: true, restaurant: true });
    const date = recordDate(input?.dateKey, ctx.timeZone);
    const stockAdds = Array.isArray(input?.stockAdds) ? input.stockAdds.filter((s) => s?.dishId && Number(s?.plates)) : [];
    if (stockAdds.length && !roleHasPermission(ctx.role, PERMISSIONS.INVENTORY_MANAGE)) {
      throw forbidden("Only the department head can add plates to stock.");
    }
    const result = await postOnce(ctx.user, input?.idempotencyKey, async (tx, key) => {
      const res = await postPurchase(tx, {
        ...ctx,
        supplier: input?.supplier,
        lines: Array.isArray(input?.lines) ? input.lines : [],
        amount: input?.amount,
        category: input?.category,
        paymentMethod: input?.paymentMethod || "CASH",
        reference: input?.reference,
        notes: input?.notes,
        date,
        stockAdds,
        idempotencyKey: key,
      });
      await linkAttachments(tx, { user: ctx.user, attachmentIds: input?.attachmentIds, entityType: "Transaction", entityId: res.transaction.id, departmentId: ctx.department.id });
      return res;
    });
    return { duplicate: result.duplicate, referenceNo: result.transaction.referenceNo, transactionId: result.transaction.id };
  });
}

/** Voids a money record (sale, income, expense, purchase, repayment, handover) with a reason. */
export async function voidRecord(input) {
  return runAction("voidRecord", async () => {
    const user = await requireOrgUser();
    const t = await db.transaction.findFirst({ where: { id: input?.transactionId, organizationId: user.organizationId }, select: { departmentId: true } });
    if (!t) throw notFound("Record not found.");
    const { role } = await resolveDepartment(user, t.departmentId, { permission: PERMISSIONS.RECORDS_VOID, write: true });
    return postOnce(user, null, (tx) => voidTransaction(tx, { user, role, transactionId: input?.transactionId, reason: input?.reason, timeZone: orgTimezone(user) }).then((transaction) => ({ transaction })));
  });
}
