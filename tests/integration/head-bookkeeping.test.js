import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { recordMoney } from "@/actions/money";
import {
  closeBooksAction, decideManualEntryAction, importStatementAction, recordVatReturnAction, reverseManualEntryAction, saveLedgerAccountAction, saveManualEntryAction, setAccountingLevelAction, setExpenseVatAction,
  setFeaturesAction, setHeadBookkeeperAction,
} from "@/actions/accounting";
import { accountingAccess, companiesFor, entryScope } from "@/lib/accounting/access";
import { entryDetail, incomeStatementFor, journalEntries } from "@/lib/accounting/reports";
import { ledgerResult, trialBalance } from "@/lib/accounting/balances";
import { vatMonth } from "@/lib/accounting/vat";
import { vatIncludedIn } from "@/lib/accounting/vat-included";
import { syncIfDirty } from "@/lib/accounting/sync";
import { buildStatements } from "@/lib/finance/statements";
import { getCurrentUser } from "@/lib/auth";
import { monthOf } from "@/lib/property/rent-schedule";
import { monthEnd } from "@/lib/accounting/closing";

const t = today();
const m0 = monthOf(t);

/** The signed-in user, as the pages and actions see him. */
const me = () => getCurrentUser();

/**
 * Full accounting kept by department heads: the Boss lets a head keep the books of his own
 * departments (or of the whole company); the head sees only those books, posts entries only on his
 * departments, large entries wait for the Boss, and the company-wide work (VAT return, closing,
 * reconciliation, chart) stays out of reach. The Statements page shows the VAT inside the figures
 * and the result without VAT, which is the result of the books.
 */
describe.skipIf(!hasDb)("department heads keep the books", () => {
  let o;
  let company;
  let expenseA;
  let expenseB;
  beforeAll(async () => {
    o = await setupOrganization("Keepers");
    company = await db.company.findFirst({ where: { organizationId: o.org.id, isDefault: true } });
    // Restaurant A (the manager) and Restaurant B (the two-department head) record money.
    await loginAs(o.manager.id, o.deptA.id);
    ok(await recordMoney({ departmentId: o.deptA.id, type: "OTHER_INCOME", amount: 119250, category: "income-catering", idempotencyKey: key() }));
    expenseA = ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 23850, category: "opex-gas", idempotencyKey: key() })).transactionId;
    await loginAs(o.multi.id, o.deptB.id);
    ok(await recordMoney({ departmentId: o.deptB.id, type: "OTHER_INCOME", amount: 59625, category: "income-catering", idempotencyKey: key() }));
    expenseB = ok(await recordMoney({ departmentId: o.deptB.id, type: "EXPENSE", amount: 10000, category: "opex-gas", idempotencyKey: key() })).transactionId;
    // The Boss: Full accounting, VAT from the 1st of the month, entries above 50 000 wait for him.
    await loginAs(o.boss.id);
    ok(await setAccountingLevelAction({ companyId: company.id, level: "FULL" }));
    ok(await setFeaturesAction({ companyId: company.id, vatEnabled: true, vatSince: `${m0}-01`, vatRate: 19.25, approvalThreshold: 50000 }));
  });

  it("a head keeps no books until the Boss lets him", async () => {
    await loginAs(o.manager.id, o.deptA.id);
    const u = await me();
    expect(await companiesFor(u)).toEqual([]);
    await expect(accountingAccess(u, company.id)).rejects.toThrow(/do not keep the books/);
    fails(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "x", lines: [] }), /do not keep the books/);
    // Only the Boss authorizes, and only a head of one of the company's departments.
    fails(await setHeadBookkeeperAction({ companyId: company.id, userId: o.manager.id, scope: "COMPANY" }), /Boss/);
    await loginAs(o.boss.id);
    fails(await setHeadBookkeeperAction({ companyId: company.id, userId: o.boss.id, scope: "COMPANY" }), /head not found/);
    ok(await setHeadBookkeeperAction({ companyId: company.id, userId: o.manager.id, scope: "DEPARTMENTS" }));
    const note = await db.notification.findFirst({ where: { userId: o.manager.id, kind: "BOOKKEEPING" }, orderBy: { createdAt: "desc" } });
    expect(note.title).toMatch(/You now keep the books of your departments/);
    expect(await db.auditEvent.count({ where: { action: "HEAD_BOOKKEEPER_SET", entityId: company.id } })).toBe(1);
  });

  it("limited to his department: he sees its entries, ledger, trial balance and income statement only", async () => {
    await loginAs(o.manager.id, o.deptA.id);
    // Every Accounting page brings the books up to date first (VAT was just switched on).
    await syncIfDirty(company.id);
    const access = await accountingAccess(await me(), company.id);
    expect(access).toMatchObject({ isHead: true, scoped: true, departmentIds: [o.deptA.id], canApprove: false, canSettle: false, companyWide: false });
    const { rows } = await journalEntries({ company, fromKey: `${m0}-01`, toKey: monthEnd(m0), scope: entryScope(access) });
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((e) => e.departmentId === o.deptA.id)).toBe(true);
    // An entry of Restaurant B does not open for him.
    const bEntry = await db.journalEntry.findFirst({ where: { companyId: company.id, departmentId: o.deptB.id } });
    expect(await entryDetail({ company, entryId: bEntry.id, scope: entryScope(access) })).toBeNull();
    // Nor does a company entry without a department (the capital brought in), nor one shared with B.
    await loginAs(o.boss.id);
    const capital = ok(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "Capital brought in", submit: true, lines: [{ account: "5211", debit: 1000000, credit: 0 }, { account: "101", debit: 0, credit: 1000000 }] }));
    const shared = ok(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "Shared rent", submit: true, lines: [{ account: "622", debit: 2000, credit: 0, departmentId: o.deptA.id }, { account: "622", debit: 2000, credit: 0, departmentId: o.deptB.id }, { account: "5211", debit: 0, credit: 4000, departmentId: o.deptA.id }] }));
    await loginAs(o.manager.id, o.deptA.id);
    for (const e of [capital, shared]) expect(await entryDetail({ company, entryId: e.id, scope: entryScope(access) })).toBeNull();
    const listed = await journalEntries({ company, fromKey: `${m0}-01`, toKey: monthEnd(m0), scope: entryScope(access) });
    expect(listed.rows.map((e) => e.label)).not.toContain("Capital brought in");
    // His trial balance: balanced but for his share of the rent shared with B (paid from A's bank).
    const tb = await trialBalance({ company, fromKey: `${m0}-01`, toKey: monthEnd(m0), departmentIds: access.departmentIds });
    expect(tb.totals.credit - tb.totals.debit).toBe(2000);
    const is = await incomeStatementFor({ company, fromKey: `${m0}-01`, toKey: monthEnd(m0), departmentIds: access.departmentIds, compare: false });
    const led = await ledgerResult({ companyId: company.id, fromKey: `${m0}-01`, toKey: monthEnd(m0), departmentIds: [o.deptA.id] });
    expect(is.lines.XI).toBe(led.result);
    // VAT: his department's collected VAT only (119 250 includes 19 250 of VAT).
    const v = await vatMonth({ company, month: m0, departmentIds: access.departmentIds });
    expect(v.collected).toBe(19250);
  });

  it("he posts entries on his department only; a large one waits for the Boss", async () => {
    await loginAs(o.manager.id, o.deptA.id);
    const line = (account, debit, credit, departmentId = o.deptA.id) => ({ account, debit, credit, departmentId });
    fails(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "Salaries B", submit: true, lines: [line("661", 20000, 0, o.deptB.id), line("5211", 0, 20000, o.deptB.id)] }), /you keep only their books/);
    fails(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "No department", submit: true, lines: [line("661", 20000, 0, null), line("5211", 0, 20000, null)] }), /you keep only their books/);
    const small = ok(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "Wages of the week", submit: true, lines: [line("661", 20000, 0), line("5211", 0, 20000)] }));
    expect(small).toMatchObject({ status: "POSTED", departmentId: o.deptA.id });
    const big = ok(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "New freezer", submit: true, lines: [line("2441", 400000, 0), line("5211", 0, 400000)] }));
    expect(big.status).toBe("PENDING");
    fails(await decideManualEntryAction({ companyId: company.id, entryId: big.id, decision: "APPROVE" }), /Only the Boss approves/);
    await loginAs(o.boss.id);
    expect((await db.notification.findFirst({ where: { userId: o.boss.id, kind: "ENTRY_TO_APPROVE" }, orderBy: { createdAt: "desc" } })).title).toMatch(/New freezer/);
    ok(await decideManualEntryAction({ companyId: company.id, entryId: big.id, decision: "APPROVE" }));
    // He reverses his own posted entry; not one of another department.
    await loginAs(o.manager.id, o.deptA.id);
    ok(await reverseManualEntryAction({ companyId: company.id, entryId: small.id, reason: "Typed twice" }));
    await loginAs(o.boss.id);
    const bossEntry = ok(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "B adjustment", submit: true, lines: [line("661", 1000, 0, o.deptB.id), line("5211", 0, 1000, o.deptB.id)] }));
    await loginAs(o.manager.id, o.deptA.id);
    fails(await reverseManualEntryAction({ companyId: company.id, entryId: bossEntry.id, reason: "x" }), /Entry not found/);
  });

  it("the company-wide work stays out of his reach; the VAT of his expenses he types", async () => {
    await loginAs(o.manager.id, o.deptA.id);
    fails(await recordVatReturnAction({ companyId: company.id, month: m0 }), /whole company/);
    fails(await closeBooksAction({ companyId: company.id, month: m0 }), /whole company/);
    fails(await saveLedgerAccountAction({ companyId: company.id, number: "5212", name: "Banque 2", label: "Bank 2" }), /whole company/);
    fails(await importStatementAction({ companyId: company.id, account: "5211", rows: [] }), /whole company/);
    fails(await setExpenseVatAction({ companyId: company.id, transactionId: expenseB, taxAmount: 1000 }), /books you do not keep/);
    ok(await setExpenseVatAction({ companyId: company.id, transactionId: expenseA, taxAmount: 3850 }));
    expect((await db.transaction.findUnique({ where: { id: expenseA } })).taxAmount).toBe(3850);
  });

  it("whole company: he sees every department; closing stays the Boss's", async () => {
    await loginAs(o.boss.id);
    ok(await setHeadBookkeeperAction({ companyId: company.id, userId: o.multi.id, scope: "COMPANY" }));
    await loginAs(o.multi.id, o.deptB.id);
    const access = await accountingAccess(await me(), company.id);
    expect(access).toMatchObject({ scoped: false, departmentIds: null, companyWide: true, canSettle: false });
    const { rows } = await journalEntries({ company, fromKey: `${m0}-01`, toKey: monthEnd(m0), scope: entryScope(access) });
    expect(new Set(rows.map((e) => e.departmentId))).toEqual(new Set([o.deptA.id, o.deptB.id, null]));
    expect(rows.map((e) => e.label)).toContain("Capital brought in");
    fails(await closeBooksAction({ companyId: company.id, month: m0 }), /Only the Boss closes/);
  });

  it("Statements show the VAT inside the figures; the result without VAT is the result of the books", async () => {
    const departments = await db.department.findMany({ where: { id: { in: [o.deptA.id, o.deptB.id] } } });
    const st = await buildStatements({ organizationId: o.org.id, departments, fromKey: `${m0}-01`, toKey: t, timeZone: "Africa/Douala", compare: false });
    const vat = await vatIncludedIn({ departments, fromKey: `${m0}-01`, toKey: t });
    // Collected: 19 250 (A) + 9 625 (B); deductible: 3 850 typed on A's gas.
    expect(vat).toMatchObject({ collected: 28875, deductible: 3850, net: 25025 });
    const led = await ledgerResult({ companyId: company.id, fromKey: `${m0}-01`, toKey: t, departmentIds: departments.map((d) => d.id) });
    // The manual entries (wages reversed, a 400 000 asset, the rent shared by A and B, B's 1 000
    // adjustment) are only in the books.
    const manual = -4000 - 1000;
    expect(st.income.result - vat.net + manual).toBe(led.result);
    // A department of a company without VAT shows nothing.
    expect(await vatIncludedIn({ departments: [{ id: o.laundry.id, companyId: null }], fromKey: `${m0}-01`, toKey: t })).toBeNull();
  });

  it("back to Simple (or withdrawn): the head no longer keeps the books", async () => {
    await loginAs(o.boss.id);
    ok(await setAccountingLevelAction({ companyId: company.id, level: "SIMPLE" }));
    await loginAs(o.manager.id, o.deptA.id);
    expect(await companiesFor(await me())).toEqual([]);
    await expect(accountingAccess(await me(), company.id, { full: false })).rejects.toThrow(/Simple accounting/);
    await loginAs(o.boss.id);
    ok(await setAccountingLevelAction({ companyId: company.id, level: "FULL" }));
    ok(await setHeadBookkeeperAction({ companyId: company.id, userId: o.manager.id, scope: null }));
    await loginAs(o.manager.id, o.deptA.id);
    await expect(accountingAccess(await me(), company.id)).rejects.toThrow(/do not keep the books/);
  });
});
