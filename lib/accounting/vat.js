/**
 * VAT of a VAT-registered company: the month's VAT collected (on income and revenue, computed by the
 * posting rules from the amounts recorded) and deductible (typed by the accountant from each supplier
 * invoice: the heads' forms do not change), the credit carried from earlier months, and the return
 * entry that clears them into VAT to pay (4441) or a credit carried forward (4449).
 */
import { db } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { dbDay, firstOpenKey } from "./ledger";
import { saveManualEntry } from "./manual-entries";
import { returnLines } from "./books-math";
import { requireCompanyWide, requireDepartmentIn } from "./access";

export const COLLECTED = ["4431", "4432"];
export const DEDUCTIBLE = ["4451", "4452", "4454"];
const monthEnd = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

async function sums(client, companyId, numbers, where, departmentIds = null) {
  const accounts = await client.ledgerAccount.findMany({ where: { companyId, number: { in: numbers } }, select: { id: true, number: true } });
  const rows = accounts.length ? await client.journalLine.groupBy({ by: ["accountId"], where: { companyId, accountId: { in: accounts.map((a) => a.id) }, entry: { status: "POSTED", ...(where.entry || {}) }, ...(where.date ? { date: where.date } : {}), ...(departmentIds ? { departmentId: { in: departmentIds } } : {}) }, _sum: { debit: true, credit: true } }) : [];
  return Object.fromEntries(accounts.map((a) => {
    const r = rows.find((x) => x.accountId === a.id);
    return [a.number, (r?._sum.debit || 0) - (r?._sum.credit || 0)];
  }));
}

export { returnLines };

/**
 * The VAT of a month: collected, deductible, credit carried, what the return would post, and whether
 * it is posted. `departmentIds`: only those departments' VAT (a head keeping their books; the return
 * itself is company-wide).
 */
export async function vatMonth({ company, month, departmentIds = null, client = db }) {
  const fromKey = `${month}-01`;
  const toKey = monthEnd(month);
  const notReturn = { NOT: { sourceKey: { startsWith: "vat-return:" } } };
  const [col, ded, creditBefore, posted] = await Promise.all([
    sums(client, company.id, COLLECTED, { date: { gte: dbDay(fromKey), lte: dbDay(toKey) }, entry: notReturn }, departmentIds),
    sums(client, company.id, DEDUCTIBLE, { date: { gte: dbDay(fromKey), lte: dbDay(toKey) }, entry: notReturn }, departmentIds),
    departmentIds ? {} : sums(client, company.id, ["4449"], { date: { lt: dbDay(fromKey) } }),
    client.journalEntry.findFirst({ where: { companyId: company.id, sourceKey: `vat-return:${month}`, status: { in: ["POSTED", "PENDING"] }, reversedAt: null, reversalOfId: null }, select: { id: true, number: true, status: true } }),
  ]);
  const collected = Object.fromEntries(Object.entries(col).map(([n, v]) => [n, -v]));
  const r = returnLines({ collected, deductible: ded, credit: creditBefore["4449"] || 0 });
  return { month, fromKey, toKey, ...r, creditBefore: creditBefore["4449"] || 0, collectedByAccount: collected, deductibleByAccount: ded, posted };
}

/** Records the month's VAT return (one per month; after the month has ended). */
export async function recordVatReturn(tx, ctx, { month, now = new Date() }) {
  const company = ctx.access.company;
  requireCompanyWide(ctx.access, "The VAT return");
  if (!company.vatEnabled) throw invalid("VAT is off for this company.");
  if (!/^\d{4}-\d{2}$/.test(month || "")) throw invalid("Choose a month.");
  if (month >= toDateKey(now, ctx.timeZone).slice(0, 7)) throw invalid("A month's return is recorded after the month has ended.");
  const v = await vatMonth({ company, month, client: tx });
  if (v.posted) throw conflict(`The return of ${month} is already recorded (${v.posted.number || "waiting for approval"}).`);
  if (v.lines.length < 2) throw invalid("No VAT this month: nothing to record.");
  const open = await firstOpenKey(tx, company);
  const dateKey = open && open > v.toKey ? open : v.toKey;
  const entry = await saveManualEntry(tx, ctx, { journal: "OD", dateKey, label: `VAT return ${month}`, reference: `TVA ${month}`, lines: v.lines, submit: true }, { sourceKey: `vat-return:${month}` });
  return { entry, ...v };
}

/**
 * The VAT on a supplier's invoice behind an expense (typed by the accountant): the expense is posted
 * again, split into the expense and the deductible VAT. 0 removes it.
 */
export async function setExpenseVat(tx, ctx, { transactionId, taxAmount }) {
  const company = ctx.access.company;
  if (!company.vatEnabled) throw invalid("VAT is off for this company.");
  const t = await tx.transaction.findFirst({ where: { id: transactionId || "-", department: { companyId: company.id } }, include: { department: { select: { id: true, name: true } } } });
  if (!t) throw notFound("Record not found.");
  requireDepartmentIn(ctx.access, t.departmentId);
  if (!["PURCHASE", "EXPENSE", "OTHER_EXPENSE"].includes(t.type)) throw invalid("VAT is typed on expenses and purchases only.");
  if (t.status === "VOIDED") throw invalid("This record was voided.");
  const amount = Math.round(Number(t.amount));
  const tax = Math.round(Number(taxAmount) || 0);
  if (tax < 0 || tax >= amount) throw invalid("The VAT is part of the amount paid: between 0 and less than the amount.");
  const dateKey = toDateKey(t.date, ctx.timeZone);
  const since = company.vatSince?.toISOString().slice(0, 10);
  if (since && dateKey < since) throw invalid(`VAT applies from ${since}.`);
  const open = await firstOpenKey(tx, company);
  if (open && dateKey < open) throw conflict("This record is in a closed month.");
  const before = t.taxAmount;
  await tx.transaction.update({ where: { id: t.id }, data: { taxAmount: tax || null } });
  await tx.department.update({ where: { id: t.departmentId }, data: { ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user: ctx.user, departmentId: t.departmentId, action: "EXPENSE_VAT_SET", entityType: "Transaction", entityId: t.id, before: { taxAmount: before }, after: { taxAmount: tax || null } });
  return { transactionId: t.id, taxAmount: tax };
}

/** The month's expenses of the company's departments (VAT on each invoice to type). */
export async function expensesForVat({ company, month, timeZone, departmentIds = null, client = db }) {
  const { start, end } = rangeBounds(`${month}-01`, monthEnd(month), timeZone);
  const rows = await client.transaction.findMany({
    where: { department: { companyId: company.id }, ...(departmentIds ? { departmentId: { in: departmentIds } } : {}), type: { in: ["PURCHASE", "EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" }, date: { gte: start, lte: end } },
    select: { id: true, referenceNo: true, date: true, amount: true, taxAmount: true, category: true, description: true, counterparty: true, department: { select: { name: true } } },
    orderBy: { date: "asc" },
  });
  return rows.map((r) => ({ ...r, amount: Math.round(Number(r.amount)), dateKey: toDateKey(r.date, timeZone) }));
}
