/**
 * Operations every department type shares: money in and out (by the types and categories of the
 * department's type), voids, and cash handed over to the Boss.
 */
import { PERMISSIONS } from "@/lib/permissions";
import { forbidden, invalid } from "@/lib/errors";
import { isInternalCategory } from "@/data/categories";
import { linkAttachments } from "@/lib/attachments";
import { roundMoney } from "@/lib/money";
import { getDomain, isDomainEnabled } from "@/lib/domains/registry";
import { postHandover, postMoneyEntry, voidTransaction, SIMPLE_MONEY_TYPES } from "@/lib/finance/posting-service";
import { validateExpense } from "@/lib/departments/expense-validation";
import { departmentOfTransaction } from "./helpers";

/** Refuses a department whose type is not built yet (coming soon). */
function requireEnabled(department) {
  if (!isDomainEnabled(department.domain)) throw forbidden(`${getDomain(department.domain).label} departments are coming soon.`);
}

export const COMMON_OPERATIONS = {
  /** Undo a sale / void any money record (reason required; locked days refused). */
  "record.void": {
    label: "Undo",
    departmentOf: departmentOfTransaction,
    access: { permission: PERMISSIONS.RECORDS_VOID, write: true },
    async run(tx, ctx, input) {
      const t = await voidTransaction(tx, { user: ctx.user, role: ctx.role, transactionId: input.transactionId, reason: input.reason, timeZone: ctx.timeZone });
      return { transactionId: t.id, referenceNo: t.referenceNo, transaction: t };
    },
  },

  // ─── Money in / out ───────────────────────────────────────────────────────
  /** Income or expense of a type the department's type offers (an event venue's expense may name its booking). */
  "money.record": {
    label: "Money record",
    money: true,
    dated: true,
    access: (input) => ({ permission: SIMPLE_MONEY_TYPES[input?.type]?.permission || PERMISSIONS.MONEY_IN_CREATE, write: true }),
    async run(tx, ctx, input) {
      requireEnabled(ctx.department);
      const domain = getDomain(ctx.department.domain);
      if (![...domain.moneyInTypes, ...domain.moneyOutTypes].includes(input.type)) throw forbidden(`This kind of record is not used in ${domain.label.toLowerCase()} departments.`);
      // Repairs and assets bought are recorded from Maintenance and Assets (they keep their registers right).
      if (isInternalCategory(input.category)) throw invalid("Record this from the Maintenance or Assets page.");
      // A guest house's expense carries everything needed to check it (owner's rule): description, who was paid, who authorized it.
      if (ctx.department.domain === "ROOM_RENTAL" && ["EXPENSE", "OTHER_EXPENSE"].includes(input.type)) {
        if (!String(input.description || "").trim()) throw invalid("Describe the expense.");
        if (!String(input.counterparty || "").trim()) throw invalid("Enter the person or vendor paid.");
        if (!String(input.authorizedByName || "").trim()) throw invalid("Enter who authorized the expense.");
      }
      // Event rental (Deco Diva), property rental: every expense says what it was and who was paid; it
      // may name its event (rental) or its building and office (property).
      if (["MATERIAL_RENTAL", "PROPERTY_RENTAL"].includes(ctx.department.domain) && ["EXPENSE", "OTHER_EXPENSE"].includes(input.type)) {
        if (!String(input.description || "").trim()) throw invalid("Describe the expense.");
        if (!String(input.counterparty || "").trim()) throw invalid("Enter the person or supplier paid.");
      }
      const r = await postMoneyEntry(tx, {
        ...ctx,
        type: input.type,
        amount: input.amount,
        category: input.category,
        paymentMethod: input.paymentMethod || "CASH",
        counterparty: input.counterparty,
        reference: input.reference,
        description: input.description,
        bookingId: input.bookingId || null,
        roomId: input.roomId || null,
        rentalOrderId: input.rentalOrderId || null,
        propertyUnitId: input.propertyUnitId || null,
        buildingId: input.buildingId || null,
        farmBatchId: input.farmBatchId || null,
        authorizedByName: input.authorizedByName,
        receivedByName: input.spentByName,
        idempotencyKey: ctx.key,
      });
      await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: r.transaction.id, departmentId: ctx.department.id });
      return { referenceNo: r.transaction.referenceNo, transactionId: r.transaction.id };
    },
  },

  /** The Boss, or a head with the right to approve (not the one who recorded it), checks an expense. */
  "expense.validate": { label: "Expense approved", access: { permission: PERMISSIONS.EXPENSES_APPROVE, write: true }, run: validateExpense },

  // ─── Cash to the Boss ─────────────────────────────────────────────────────
  /** Only a department head hands cash over, never more than the drawer should hold. */
  "handover.record": {
    label: "Cash to Boss",
    money: true,
    dated: true,
    access: { permission: PERMISSIONS.HANDOVER_CREATE, write: true },
    async run(tx, ctx, input) {
      requireEnabled(ctx.department);
      const r = await postHandover(tx, { ...ctx, cashRequestId: input.cashRequestId || null, amount: input.amount, recipientName: input.recipientName, reference: input.reference, note: input.note, idempotencyKey: ctx.key });
      await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "CashHandover", entityId: r.handover.id, departmentId: ctx.department.id });
      return { referenceNo: r.transaction.referenceNo, transactionId: r.transaction.id, handoverId: r.handover.id, amount: roundMoney(input.amount) };
    },
  },
};
