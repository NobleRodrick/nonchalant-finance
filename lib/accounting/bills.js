/**
 * Suppliers and their bills paid later (accounts payable, Full accounting with supplier bills on).
 * A bill's lines are expenses of a department on credit, dated on the bill (so the department's own
 * reports count them when incurred); payments are SUPPLIER_PAYMENT money records of that department
 * (cash, MoMo, bank), which move the money and clear what is owed — never counted twice.
 */
import { requireDepartmentIn } from "./access";
import { db } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { findCategory } from "@/data/categories";
import { DOC_TYPES } from "@/lib/documents/sequence";
import { createTransaction, PAID_METHODS, SIMPLE_MONEY_TYPES, voidTransaction } from "@/lib/finance/posting-service";
import { assertCanPost } from "@/lib/posting-guard";
import { instantForDateKey, isDateKey, toDateKey } from "@/lib/timezone";

const text = (v, max = 200) => String(v ?? "").trim().slice(0, max) || null;
const OUT_TYPES = ["PURCHASE", "EXPENSE", "OTHER_EXPENSE"];

function requirePayables(company) {
  if (company.accountingLevel !== "FULL" || !company.payablesEnabled) throw invalid("Supplier bills are off for this company (Accounting → Settings).");
}

export async function saveSupplier(tx, { user, access }, input) {
  const company = access.company;
  const name = text(input.name, 120);
  if (!name) throw invalid("Give the supplier's name.");
  const data = { name, phone: text(input.phone, 40), email: text(input.email, 160), taxId: text(input.taxId, 40), address: text(input.address, 300) };
  const clash = await tx.supplier.findFirst({ where: { companyId: company.id, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (clash) throw conflict(`A supplier named "${clash.name}" already exists.`);
  const s = input.id
    ? await tx.supplier.update({ where: { id: (await tx.supplier.findFirst({ where: { id: input.id, companyId: company.id } }))?.id || "-" }, data })
    : await tx.supplier.create({ data: { ...data, companyId: company.id } });
  await recordAudit(tx, { user, action: input.id ? "SUPPLIER_UPDATED" : "SUPPLIER_CREATED", entityType: "Supplier", entityId: s.id, after: data });
  return s;
}

/** The category and money type of a bill line (any expense or purchase category of the department's type). */
function lineCategory(category, domain) {
  for (const type of OUT_TYPES) {
    const c = findCategory(type, category, domain);
    if (c) return { type, c };
  }
  return null;
}

async function nextBillNumber(tx, companyId) {
  const last = await tx.supplierBill.findFirst({ where: { companyId }, orderBy: { createdAt: "desc" }, select: { referenceNo: true } });
  const n = last ? Number(String(last.referenceNo).replace(/\D/g, "")) + 1 : 1;
  return `FF-${String(n).padStart(4, "0")}`;
}

/** Records a supplier's bill: its lines become expenses on credit of the department, on the bill's date. */
export async function createBill(tx, { user, access, timeZone }, input) {
  const company = access.company;
  requirePayables(company);
  const department = await tx.department.findFirst({ where: { id: input.departmentId || "-", companyId: company.id } });
  if (department) requireDepartmentIn(access, department.id);
  if (!department) throw invalid("Choose the department the bill is for.");
  return createBillCore(tx, { user, company, department, timeZone }, input);
}

/**
 * The bill itself (also used by a shop's or bar's purchase on credit, whatever the company's
 * settings): `extraTransaction` is added to each line's money record.
 */
export async function createBillCore(tx, { user, company, department, timeZone }, input, { extraTransaction = {} } = {}) {
  if (!isDateKey(input.dateKey || "")) throw invalid("Give the bill's date.");
  if (input.dueKey && !isDateKey(input.dueKey)) throw invalid("Invalid due date.");
  const today = toDateKey(new Date(), timeZone);
  if (input.dateKey > today) throw invalid("A bill cannot be dated in the future.");
  let supplier = input.supplierId ? await tx.supplier.findFirst({ where: { id: input.supplierId, companyId: company.id } }) : null;
  if (!supplier && text(input.supplierName)) {
    supplier = (await tx.supplier.findFirst({ where: { companyId: company.id, name: { equals: text(input.supplierName), mode: "insensitive" } } })) || (await tx.supplier.create({ data: { companyId: company.id, name: text(input.supplierName, 120) } }));
  }
  if (!supplier) throw invalid("Choose or name the supplier.");
  const lines = Array.isArray(input.lines) ? input.lines.filter((l) => Number(l.amount) > 0) : [];
  if (!lines.length) throw invalid("A bill has at least one line with an amount.");
  if (lines.length > 50) throw invalid("A bill has at most 50 lines.");
  const date = instantForDateKey(input.dateKey, timeZone);
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const checked = lines.map((l, i) => {
    const amount = Math.round(Number(l.amount));
    const tax = Math.round(Number(l.taxAmount) || 0);
    if (!Number.isInteger(amount) || amount <= 0) throw invalid(`Line ${i + 1}: the amount is a whole number of francs.`);
    if (tax < 0 || tax >= amount) throw invalid(`Line ${i + 1}: the VAT is part of the amount.`);
    if (tax && !company.vatEnabled) throw invalid("VAT is off for this company: leave the VAT empty.");
    const cat = lineCategory(l.category, department.domain);
    if (!cat) throw invalid(`Line ${i + 1}: choose a category.`);
    return { amount, tax, ...cat, description: text(l.description, 300) || cat.c.label };
  });
  const total = checked.reduce((s, l) => s + l.amount, 0);
  const bill = await tx.supplierBill.create({
    data: { companyId: company.id, supplierId: supplier.id, departmentId: department.id, referenceNo: await nextBillNumber(tx, company.id), supplierRef: text(input.supplierRef, 60), date: new Date(`${input.dateKey}T00:00:00Z`), dueDate: input.dueKey ? new Date(`${input.dueKey}T00:00:00Z`) : null, total, taxAmount: checked.reduce((s, l) => s + l.tax, 0), note: text(input.note, 1000), createdById: user.id },
  });
  for (const l of checked) {
    await createTransaction(tx, {
      user,
      department,
      docType: l.type === "PURCHASE" ? DOC_TYPES.PURCHASE : SIMPLE_MONEY_TYPES[l.type].doc,
      data: { type: l.type, amount: l.amount, paymentMethod: "CREDIT", counterparty: supplier.name, reference: text(input.supplierRef, 80), description: l.description, category: l.c.id, operationCategory: l.c.operationCategory, date, taxAmount: l.tax || null, supplierId: supplier.id, supplierBillId: bill.id, validatedById: user.id, validatedAt: new Date(), validationNote: `Supplier bill ${bill.referenceNo}`, ...extraTransaction },
    });
  }
  await tx.department.update({ where: { id: department.id }, data: { ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user, departmentId: department.id, action: "SUPPLIER_BILL_CREATED", entityType: "SupplierBill", entityId: bill.id, after: { referenceNo: bill.referenceNo, supplier: supplier.name, total } });
  return bill;
}

/** Pays a bill (all or part) from the department's cash, MoMo or bank. */
export async function payBill(tx, { user, access, timeZone }, input) {
  requirePayables(access.company);
  if (access.scoped) {
    const bill = await tx.supplierBill.findFirst({ where: { id: input?.billId || "-", companyId: access.company.id }, select: { departmentId: true } });
    if (!bill) throw notFound("Bill not found.");
    requireDepartmentIn(access, bill.departmentId);
  }
  return payBillCore(tx, { user, company: access.company, timeZone }, input);
}

/** The payment itself (also from a shop's or bar's Purchases page). */
export async function payBillCore(tx, { user, company, timeZone, departmentId = null }, input) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`supplier-bill:${input.billId || "-"}`}))`;
  const bill = await tx.supplierBill.findFirst({ where: { id: input.billId || "-", companyId: company.id, ...(departmentId ? { departmentId } : {}) }, include: { supplier: true } });
  if (!bill) throw notFound("Bill not found.");
  if (bill.status === "VOIDED") throw conflict("This bill was voided.");
  const left = bill.total - bill.paid;
  const amount = Math.round(Number(input.amount));
  if (!Number.isInteger(amount) || amount <= 0) throw invalid("The amount paid is a whole number of francs.");
  if (amount > left) throw invalid(`Only ${left} FCFA is left to pay on ${bill.referenceNo}.`);
  const method = input.paymentMethod || "BANK_TRANSFER";
  if (!PAID_METHODS.includes(method)) throw invalid("Choose how it was paid.");
  if (method !== "CASH" && !text(input.reference)) throw invalid("Give the transfer or MoMo reference.");
  const dateKey = input.dateKey || toDateKey(new Date(), timeZone);
  if (!isDateKey(dateKey) || dateKey > toDateKey(new Date(), timeZone)) throw invalid("Invalid date.");
  if (dateKey < bill.date.toISOString().slice(0, 10)) throw invalid("A bill is paid on or after its date.");
  const department = await tx.department.findUnique({ where: { id: bill.departmentId } });
  const date = instantForDateKey(dateKey, timeZone);
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const t = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.SUPPLIER_PAYMENT,
    data: { type: "SUPPLIER_PAYMENT", amount, paymentMethod: method, counterparty: bill.supplier.name, reference: text(input.reference, 80), description: `Bill ${bill.referenceNo}${bill.supplierRef ? ` (${bill.supplierRef})` : ""}`, category: "supplier-payment", date, supplierId: bill.supplierId, supplierBillId: bill.id },
  });
  const paid = bill.paid + amount;
  await tx.supplierBill.update({ where: { id: bill.id }, data: { paid, status: paid >= bill.total ? "PAID" : "PARTIAL" } });
  await tx.department.update({ where: { id: department.id }, data: { ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user, departmentId: department.id, action: "SUPPLIER_BILL_PAID", entityType: "SupplierBill", entityId: bill.id, after: { referenceNo: t.referenceNo, amount, method } });
  return { transactionId: t.id, referenceNo: t.referenceNo, paid, left: bill.total - paid };
}

/** Voids an unpaid bill (its expense lines are voided with it). Void its payments first. */
export async function voidBill(tx, { user, access, timeZone }, { billId, reason }) {
  const company = access.company;
  const why = text(reason, 300);
  if (!why || why.length < 3) throw invalid("Give a reason for voiding.");
  const bill = await tx.supplierBill.findFirst({ where: { id: billId || "-", companyId: company.id }, include: { records: true } });
  if (!bill) throw notFound("Bill not found.");
  requireDepartmentIn(access, bill.departmentId);
  if (bill.status === "VOIDED") throw conflict("This bill is already voided.");
  if (bill.records.some((r) => r.type === "SUPPLIER_PAYMENT" && r.status !== "VOIDED")) throw conflict("Part of this bill was paid: void the payments first.");
  await tx.supplierBill.update({ where: { id: bill.id }, data: { status: "VOIDED", voidReason: why } });
  for (const r of bill.records.filter((x) => x.status !== "VOIDED")) await voidTransaction(tx, { user, role: "ADMIN", transactionId: r.id, reason: `Bill ${bill.referenceNo} voided: ${why}`, timeZone });
  await tx.department.update({ where: { id: bill.departmentId }, data: { ledgerDirtyAt: new Date() } });
  await recordAudit(tx, { user, departmentId: bill.departmentId, action: "SUPPLIER_BILL_VOIDED", entityType: "SupplierBill", entityId: bill.id, after: { reason: why } });
  return { id: bill.id };
}

/** Bills of the company (open first), with their supplier and what is left. */
export async function listBills({ company, status = null, supplierId = null, departmentIds = null, client = db }) {
  const rows = await client.supplierBill.findMany({
    where: { companyId: company.id, ...(status === "open" ? { status: { in: ["OPEN", "PARTIAL"] } } : status ? { status } : {}), ...(supplierId ? { supplierId } : {}), ...(departmentIds ? { departmentId: { in: departmentIds } } : {}) },
    include: { supplier: { select: { id: true, name: true } }, records: { where: { type: "SUPPLIER_PAYMENT", status: { not: "VOIDED" } }, select: { id: true, referenceNo: true, amount: true, date: true, paymentMethod: true } } },
    orderBy: [{ date: "desc" }],
    take: 500,
  });
  return rows.map((b) => ({ ...b, left: b.total - b.paid }));
}
