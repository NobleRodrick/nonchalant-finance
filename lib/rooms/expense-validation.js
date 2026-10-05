/**
 * Validation of expenses (owner's decision: an expense counts at once, then is checked). The Boss,
 * or a head of the department other than the person who recorded it, validates it with an
 * optional note. Expenses not validated yet are flagged on the dashboard and in the reports.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

export async function validateExpense(tx, { user, department, now }, input) {
  const t = await tx.transaction.findFirst({ where: { id: input?.transactionId || "-", departmentId: department.id } });
  if (!t) throw notFound("Expense not found.");
  if (!["EXPENSE", "OTHER_EXPENSE"].includes(t.type)) throw invalid("Only expenses are validated.");
  if (t.status === "VOIDED") throw invalid(`${t.referenceNo} is void.`);
  if (t.validatedAt) throw conflict(`${t.referenceNo} is already validated.`);
  if (user.role !== "ADMIN" && t.userId === user.id) throw forbidden("Another person validates your expense: the Boss or another head of the department.");
  const note = text(input.note);
  await tx.transaction.update({ where: { id: t.id }, data: { validatedById: user.id, validatedAt: now || new Date(), validationNote: note } });
  await recordAudit(tx, { user, departmentId: department.id, action: "EXPENSE_VALIDATED", entityType: "Transaction", entityId: t.id, after: { referenceNo: t.referenceNo, note } });
  return { transactionId: t.id, referenceNo: t.referenceNo };
}
