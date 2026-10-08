"use server";

/**
 * Server actions of Accounting (docs/ACCOUNTING_PLAN.md): companies and their settings (the Boss),
 * manual entries, approval, closing, opening balances, result allocation. The rules live in
 * lib/accounting; these only check who is asking and run them in a transaction.
 */
import { db } from "@/lib/prisma";
import { runAction } from "@/lib/action";
import { orgTimezone, requireAdmin, requireOrgUser } from "@/lib/access";
import { revalidateOperations } from "@/lib/transaction-runner";
import { accountingAccess, requireCompanyWide } from "@/lib/accounting/access";
import { assignDepartment, saveCompany, setAccountantCompanies, setAccountFor, setAccountingLevel, setFeatures, setHeadBookkeeper } from "@/lib/accounting/company-service";
import { hashPassword } from "@/lib/auth";
import { validatePasswordStrength } from "@/lib/password-utils";
import { invalid } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { decideManualEntry, deleteDraftEntry, reverseManualEntry, saveManualEntry } from "@/lib/accounting/manual-entries";
import { allocateResult, closeThrough, reopenLastMonth } from "@/lib/accounting/closing";
import { syncCompany, syncIfDirty } from "@/lib/accounting/sync";
import { saveLedgerAccount } from "@/lib/accounting/chart-service";
import { recordVatReturn, setExpenseVat } from "@/lib/accounting/vat";
import { createBill, payBill, saveSupplier, voidBill } from "@/lib/accounting/bills";
import { autoMatch, importStatement, matchLine, postFromLine, setLineStatus } from "@/lib/accounting/reconciliation";

const TX = { timeout: 60000, maxWait: 15000 };

function boss(name, fn) {
  return runAction(name, async () => {
    const user = await requireAdmin();
    const out = await db.$transaction((tx) => fn(tx, { user, timeZone: orgTimezone(user) }), TX);
    revalidateOperations();
    return out;
  });
}

/**
 * A company's books: the Boss, an accountant or a head who keeps them. `companyWide`: the action
 * concerns the whole company (not for a head limited to his departments).
 */
function books(name, companyId, fn, { full = true, companyWide = null } = {}) {
  return runAction(name, async () => {
    const user = await requireOrgUser();
    const access = await accountingAccess(user, companyId, { full });
    if (companyWide) requireCompanyWide(access, companyWide);
    const out = await db.$transaction((tx) => fn(tx, { user, access, timeZone: orgTimezone(user) }), TX);
    revalidateOperations();
    return out;
  });
}

export async function saveCompanyAction(input) {
  return boss("saveCompany", (tx, c) => saveCompany(tx, c, input || {}));
}

export async function assignDepartmentAction(input) {
  return boss("assignDepartment", (tx, c) => assignDepartment(tx, c, input || {}));
}

/** Simple ↔ Full. Switching to Full builds the books from the whole history right away. */
export async function setAccountingLevelAction(input) {
  return runAction("setAccountingLevel", async () => {
    const user = await requireAdmin();
    const company = await db.$transaction((tx) => setAccountingLevel(tx, { user }, input || {}), TX);
    let built = null;
    if (company.accountingLevel === "FULL") built = await syncCompany(company.id, { full: true });
    revalidateOperations();
    return { company, built };
  });
}

export async function setFeaturesAction(input) {
  return boss("setAccountingFeatures", (tx, c) => setFeatures(tx, c, input || {}));
}

export async function setAccountForAction(input) {
  return boss("setAccountFor", (tx, c) => setAccountFor(tx, c, input || {}));
}

export async function saveLedgerAccountAction(input) {
  return books("saveLedgerAccount", input?.companyId, (tx, c) => saveLedgerAccount(tx, c, input || {}), { companyWide: "The chart of accounts" });
}

/** Brings the books up to date now (the departments changed since the last update, or all of them). */
export async function syncBooksAction(input) {
  return runAction("syncBooks", async () => {
    const user = await requireOrgUser();
    const { company } = await accountingAccess(user, input?.companyId);
    if (input?.full) return syncCompany(company.id, { full: true });
    await syncIfDirty(company.id);
    return { ok: true };
  });
}

export async function saveManualEntryAction(input) {
  return books("saveManualEntry", input?.companyId, (tx, c) => saveManualEntry(tx, c, input || {}));
}

export async function decideManualEntryAction(input) {
  return books("decideManualEntry", input?.companyId, (tx, c) => decideManualEntry(tx, c, input || {}));
}

export async function reverseManualEntryAction(input) {
  return books("reverseManualEntry", input?.companyId, (tx, c) => reverseManualEntry(tx, c, input || {}));
}

export async function deleteDraftEntryAction(input) {
  return books("deleteDraftEntry", input?.companyId, (tx, c) => deleteDraftEntry(tx, c, input || {}));
}

/** Closes the books through a month (after bringing them up to date). */
export async function closeBooksAction(input) {
  return runAction("closeBooks", async () => {
    const user = await requireOrgUser();
    const access = await accountingAccess(user, input?.companyId);
    requireCompanyWide(access, "Closing the books");
    await syncCompany(access.company.id, { full: false });
    const out = await db.$transaction((tx) => closeThrough(tx, { user, access, timeZone: orgTimezone(user) }, input || {}), TX);
    revalidateOperations();
    return out;
  });
}

export async function reopenBooksAction(input) {
  return books("reopenBooks", input?.companyId, (tx, c) => reopenLastMonth(tx, c, input || {}), { companyWide: "Reopening the books" });
}

export async function allocateResultAction(input) {
  return books("allocateResult", input?.companyId, (tx, c) => allocateResult(tx, c, input || {}), { companyWide: "The allocation of the result" });
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * The Boss adds an accountant (in-house or an outside firm) who keeps the books of the chosen
 * companies: temporary password replaced at the first sign-in, no access to the departments' daily
 * work. Deactivate or reset the password from People like anyone else.
 */
export async function createAccountantAction(data) {
  return runAction("createAccountant", async () => {
    const user = await requireAdmin();
    const name = String(data?.name || "").trim();
    const email = String(data?.email || "").toLowerCase().trim();
    if (!name || !email || !data?.tempPassword) throw invalid("Name, e-mail and temporary password are required.");
    if (!EMAIL_RE.test(email)) throw invalid("Enter a valid e-mail address.");
    const weak = validatePasswordStrength(data.tempPassword, { email, name });
    if (weak) throw invalid(weak);
    if (await db.user.findUnique({ where: { email } })) throw invalid("A user with this e-mail already exists.");
    const out = await db.$transaction(async (tx) => {
      const created = await tx.user.create({ data: { name, email, phone: String(data?.phone || "").trim() || null, title: String(data?.title || "Accountant").trim().slice(0, 60) || "Accountant", passwordHash: await hashPassword(data.tempPassword), role: "ACCOUNTANT", organizationId: user.organizationId, isActive: true, mustChangePassword: true } });
      await setAccountantCompanies(tx, { user }, { userId: created.id, companyIds: data?.companyIds });
      await recordAudit(tx, { user, action: "ACCOUNTANT_CREATED", entityType: "User", entityId: created.id, after: { name, email } });
      return { id: created.id, name: created.name, email: created.email };
    }, TX);
    revalidateOperations();
    return out;
  });
}

export async function setAccountantCompaniesAction(input) {
  return boss("setAccountantCompanies", (tx, c) => setAccountantCompanies(tx, c, input || {}));
}

/** The Boss lets a department head keep the books (his departments or the whole company), or stops it. */
export async function setHeadBookkeeperAction(input) {
  return boss("setHeadBookkeeper", (tx, c) => setHeadBookkeeper(tx, c, input || {}));
}

export async function setExpenseVatAction(input) {
  return books("setExpenseVat", input?.companyId, (tx, c) => setExpenseVat(tx, c, input || {}));
}

export async function recordVatReturnAction(input) {
  return runAction("recordVatReturn", async () => {
    const user = await requireOrgUser();
    const access = await accountingAccess(user, input?.companyId);
    await syncIfDirty(access.company.id);
    const out = await db.$transaction((tx) => recordVatReturn(tx, { user, access, timeZone: orgTimezone(user) }, input || {}), TX);
    revalidateOperations();
    return out;
  });
}

export async function saveSupplierAction(input) {
  return books("saveSupplier", input?.companyId, (tx, c) => saveSupplier(tx, c, input || {}));
}

export async function createBillAction(input) {
  return books("createBill", input?.companyId, (tx, c) => createBill(tx, c, input || {}));
}

export async function payBillAction(input) {
  return books("payBill", input?.companyId, (tx, c) => payBill(tx, c, input || {}));
}

export async function voidBillAction(input) {
  return books("voidBill", input?.companyId, (tx, c) => voidBill(tx, c, input || {}));
}

/** Imports a statement (rows parsed in the browser from the bank's CSV) after bringing the books up to date. */
export async function importStatementAction(input) {
  return runAction("importStatement", async () => {
    const user = await requireOrgUser();
    const access = await accountingAccess(user, input?.companyId);
    requireCompanyWide(access, "Reconciliation");
    await syncIfDirty(access.company.id);
    const out = await db.$transaction((tx) => importStatement(tx, { user, access, timeZone: orgTimezone(user) }, input || {}), TX);
    revalidateOperations();
    return out;
  });
}

export async function autoMatchAction(input) {
  return books("autoMatch", input?.companyId, (tx, c) => autoMatch(tx, c, input || {}), { companyWide: "Reconciliation" });
}

export async function matchLineAction(input) {
  return books("matchLine", input?.companyId, (tx, c) => matchLine(tx, c, input || {}), { companyWide: "Reconciliation" });
}

export async function setStatementLineAction(input) {
  return books("setStatementLine", input?.companyId, (tx, c) => setLineStatus(tx, c, input || {}), { companyWide: "Reconciliation" });
}

export async function postFromStatementLineAction(input) {
  return books("postFromStatementLine", input?.companyId, (tx, c) => postFromLine(tx, c, input || {}), { companyWide: "Reconciliation" });
}
