"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { departmentContext, postOnce, recordDate } from "@/lib/action-context";
import { postSale } from "@/lib/finance/posting-service";

/**
 * Records a sale from the POS. Plates leave stock atomically (a sale can never be larger
 * than the plates available); a sale on credit opens a debt for the customer.
 */
export async function recordSale(input) {
  return runAction("recordSale", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.SALES_CREATE, write: true, restaurant: true });
    const date = recordDate(input?.dateKey, ctx.timeZone);
    const result = await postOnce(ctx.user, input?.idempotencyKey, (tx, key) =>
      postSale(tx, {
        ...ctx,
        lines: Array.isArray(input?.lines) ? input.lines : [],
        paymentMethod: input?.paymentMethod || "CASH",
        discountAmount: input?.discountAmount || 0,
        discountReason: input?.discountReason,
        debtorId: input?.debtorId || null,
        debtor: input?.debtor || null,
        reference: input?.reference,
        date,
        idempotencyKey: key,
      })
    );
    return {
      duplicate: result.duplicate,
      referenceNo: result.transaction.referenceNo,
      transactionId: result.transaction.id,
      debtReference: result.debt?.referenceNo || null,
      totals: result.totals || null,
    };
  });
}
