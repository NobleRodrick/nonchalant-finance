"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { departmentContext, postOnce, recordDate, change } from "@/lib/action-context";
import { invalid, notFound } from "@/lib/errors";
import { postSale, postOpeningDebt, postRepayment, cancelOpeningDebt, resolveDebtor } from "@/lib/finance/posting-service";

const MANAGE = { permission: PERMISSIONS.DEBTS_MANAGE, write: true, restaurant: true };

/**
 * Records a debt: a customer took food on credit outside the POS. With dishes, plates leave
 * stock like a sale; without dishes, an amount of "unlisted items" is recorded. Either way
 * the day's sales include it and the customer owes it.
 */
export async function recordDebt(input) {
  return runAction("recordDebt", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    const date = recordDate(input?.dateKey, ctx.timeZone);
    const lines = Array.isArray(input?.lines) ? input.lines.filter((l) => l?.dishId && Number(l?.quantity)) : [];
    const unlisted = lines.length ? null : { amount: input?.amount, description: input?.description };
    const result = await postOnce(ctx.user, input?.idempotencyKey, (tx, key) =>
      postSale(tx, {
        ...ctx,
        lines,
        unlisted,
        paymentMethod: "CREDIT",
        debtorId: input?.debtorId || null,
        debtor: input?.debtor || null,
        dueDate: input?.dueDate || null,
        debtSource: "MANUAL",
        date,
        idempotencyKey: key,
      })
    );
    return { duplicate: result.duplicate, referenceNo: result.debt?.referenceNo, saleReference: result.transaction.referenceNo };
  });
}

/** A debt that existed before the app (no sale today, no cash). */
export async function recordOldDebt(input) {
  return runAction("recordOldDebt", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    const date = recordDate(input?.dateKey, ctx.timeZone);
    const res = await change((tx) =>
      postOpeningDebt(tx, { ...ctx, debtorId: input?.debtorId || null, debtor: input?.debtor || null, amount: input?.amount, description: input?.description, date, dueDate: input?.dueDate || null })
    );
    return { referenceNo: res.debt.referenceNo, debtId: res.debt.id };
  });
}

/** A customer pays back all or part of a debt. */
export async function recordRepayment(input) {
  return runAction("recordRepayment", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.DEBTS_REPAY, write: true, restaurant: true });
    const date = recordDate(input?.dateKey, ctx.timeZone);
    if (!input?.debtId) throw invalid("Choose the debt being repaid.");
    const result = await postOnce(ctx.user, input?.idempotencyKey, (tx, key) =>
      postRepayment(tx, { ...ctx, debtId: input.debtId, amount: input?.amount, paymentMethod: input?.paymentMethod || "CASH", reference: input?.reference, date, idempotencyKey: key })
    );
    return { duplicate: result.duplicate, referenceNo: result.transaction.referenceNo };
  });
}

/** Cancels an old debt recorded by mistake (debts from sales are cancelled by voiding the sale). */
export async function cancelOldDebt(input) {
  return runAction("cancelOldDebt", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    return change((tx) => cancelOpeningDebt(tx, { ...ctx, debtId: input?.debtId, reason: input?.reason }));
  });
}

/** Adds or updates a customer in the department's directory. */
export async function saveDebtor(input) {
  return runAction("saveDebtor", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.DEBTS_REPAY, write: true, restaurant: true });
    return change(async (tx) => {
      if (input?.id) {
        const existing = await tx.debtor.findFirst({ where: { id: input.id, departmentId: ctx.department.id } });
        if (!existing) throw notFound("Customer not found.");
        const name = String(input?.name || "").trim();
        if (name.length < 2) throw invalid("Enter the customer's name.");
        return tx.debtor.update({ where: { id: existing.id }, data: { name, phone: String(input?.phone || "").trim() || null, notes: String(input?.notes || "").trim() || null } });
      }
      return resolveDebtor(tx, { ...ctx, debtor: { name: input?.name, phone: input?.phone } });
    });
  });
}
