import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { recordMoney, voidRecord } from "@/actions/money";
import { addDaysToKey } from "@/lib/timezone";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";
import {
  allocateResultAction, assignDepartmentAction, createBillAction, importStatementAction, payBillAction, postFromStatementLineAction, recordVatReturnAction, setExpenseVatAction, closeBooksAction, decideManualEntryAction, reopenBooksAction, saveCompanyAction, saveLedgerAccountAction, saveManualEntryAction, setAccountingLevelAction, setFeaturesAction, syncBooksAction,
} from "@/actions/accounting";
import { syncCompany } from "@/lib/accounting/sync";
import { ledgerResult } from "@/lib/accounting/balances";
import { balanceSheetAt, cashFlowFor, entryDetail, generalLedger, incomeStatementFor, journalEntries } from "@/lib/accounting/reports";
import { monthEnd } from "@/lib/accounting/closing";
import { buildStatements } from "@/lib/finance/statements";
import { partnerLedger } from "@/lib/accounting/partners";
import { vatMonth } from "@/lib/accounting/vat";
import { trialBalance } from "@/lib/accounting/balances";
import { parseStatementCsv, statementDetail } from "@/lib/accounting/reconciliation";

const t = today();
const m0 = monthOf(t);
const prev = addMonths(m0, -1);

/**
 * Full accounting on a restaurant business: the default company and a second one, the books built
 * from history, a void reversed, statements that balance, manual entries with approval, VAT,
 * closing in order and the frozen months.
 */
describe.skipIf(!hasDb)("Full accounting (SYSCOHADA)", () => {
  let o;
  let company;
  let saleId;
  beforeAll(async () => {
    o = await setupOrganization("Books");
    await loginAs(o.manager.id, o.deptA.id);
    // Last month: rent income and an expense; this month: a sale-like income and gas.
    ok(await recordMoney({ departmentId: o.deptA.id, type: "RENT_INCOME", amount: 50000, category: "rent-space", dateKey: `${prev}-20`, idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 8000, category: "opex-gas", dateKey: `${prev}-21`, idempotencyKey: key() }));
    saleId = ok(await recordMoney({ departmentId: o.deptA.id, type: "OTHER_INCOME", amount: 30000, category: "income-catering", paymentMethod: "MOMO", reference: "MP7", idempotencyKey: key() })).transactionId;
    ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 5000, category: "opex-gas", idempotencyKey: key() }));
    company = await db.company.findFirst({ where: { organizationId: o.org.id, isDefault: true } });
  });

  it("every department belongs to the business's default company, created by the database", async () => {
    expect(company.name).toBe(o.org.name);
    expect(company.accountingLevel).toBe("SIMPLE");
    const depts = await db.department.findMany({ where: { organizationId: o.org.id } });
    expect(depts.every((d) => d.companyId === company.id)).toBe(true);
  });

  it("the Boss adds a second company and moves a department to it; accounting pages are refused in Simple", async () => {
    await loginAs(o.boss.id);
    const second = ok(await saveCompanyAction({ name: `Laundry SARL ${o.org.id.slice(0, 4)}`, taxId: "M0123456789", tradeRegister: "RC/DLA/2026/B/1" }));
    ok(await assignDepartmentAction({ departmentId: o.laundry.id, companyId: second.id }));
    expect((await db.department.findUnique({ where: { id: o.laundry.id } })).companyId).toBe(second.id);
    fails(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "x", lines: [] }), /Simple accounting/);
    await loginAs(o.manager.id, o.deptA.id);
    fails(await saveCompanyAction({ name: "Mine" }), /Boss/);
  });

  it("switching to Full builds the books from the whole history; the ledger result equals the records", async () => {
    await loginAs(o.boss.id);
    const r = ok(await setAccountingLevelAction({ companyId: company.id, level: "FULL" }));
    expect(r.built.posted).toBe(4);
    const chart = await db.ledgerAccount.count({ where: { companyId: company.id } });
    expect(chart).toBeGreaterThan(100);
    expect((await ledgerResult({ companyId: company.id, fromKey: `${prev}-01`, toKey: monthEnd(prev) })).result).toBe(42000);
    expect((await ledgerResult({ companyId: company.id, fromKey: `${m0}-01`, toKey: monthEnd(m0) })).result).toBe(25000);
    const j = await journalEntries({ company, fromKey: `${prev}-01`, toKey: t });
    const momo = j.rows.find((e) => e.reference === "I-0001");
    expect(momo.journal.code).toBe("MM");
    expect(momo.lines.map((l) => [l.account.number, l.debit, l.credit])).toEqual([["552", 30000, 0], ["7078", 0, 30000]]);
    expect(momo.number).toMatch(/^MM-\d{4}-000001$/);
  });

  it("a voided record is reversed, never deleted; syncing again changes nothing; posted entries cannot be edited", async () => {
    await loginAs(o.manager.id, o.deptA.id);
    ok(await voidRecord({ transactionId: saleId, reason: "Typed twice", departmentId: o.deptA.id }));
    await loginAs(o.boss.id);
    ok(await syncBooksAction({ companyId: company.id }));
    expect((await ledgerResult({ companyId: company.id, fromKey: `${m0}-01`, toKey: monthEnd(m0) })).result).toBe(-5000);
    const entries = await db.journalEntry.findMany({ where: { companyId: company.id, sourceKey: `tx:${saleId}` } });
    expect(entries).toHaveLength(2);
    const original = entries.find((e) => !e.reversalOfId);
    expect(original.reversedAt).not.toBeNull();
    const again = await syncCompany(company.id, { full: true });
    expect(again).toMatchObject({ posted: 0, reversed: 0 });
    await expect(db.journalLine.updateMany({ where: { entryId: original.id }, data: { debit: 1 } })).rejects.toThrow();
    await expect(db.journalEntry.delete({ where: { id: original.id } })).rejects.toThrow();
    const detail = await entryDetail({ company, entryId: original.id });
    expect(detail.source).toMatchObject({ href: `/d/${o.deptA.id}/money?ref=I-0001` });
  });

  it("manual entries: the Boss posts capital to the bank; above the threshold an accountant's entry waits for him", async () => {
    await loginAs(o.boss.id);
    ok(await saveLedgerAccountAction({ companyId: company.id, number: "5212", name: "Afriland First Bank" }));
    fails(await saveLedgerAccountAction({ companyId: company.id, number: "9999", name: "x" }), /3 to 10 digits|under an existing/);
    const capital = ok(await saveManualEntryAction({ companyId: company.id, dateKey: `${prev}-01`, label: "Capital brought in", lines: [{ account: "5212", debit: 1000000 }, { account: "101", credit: 1000000 }], submit: true }));
    expect(capital).toMatchObject({ status: "POSTED", number: expect.stringMatching(/^OD-/) });
    fails(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "Bad", lines: [{ account: "5212", debit: 100 }, { account: "101", credit: 90 }], submit: true }), /does not balance/);
    ok(await setFeaturesAction({ companyId: company.id, approvalThreshold: 100000 }));
    // An accountant: role ACCOUNTANT, member of the company.
    await db.user.update({ where: { id: o.accountant.id }, data: { role: "ACCOUNTANT" } });
    await db.companyMember.create({ data: { companyId: company.id, userId: o.accountant.id } });
    await loginAs(o.accountant.id);
    const loan = ok(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "Bank loan", lines: [{ account: "5212", debit: 500000 }, { account: "162", credit: 500000 }], submit: true }));
    expect(loan.status).toBe("PENDING");
    fails(await decideManualEntryAction({ companyId: company.id, entryId: loan.id, decision: "APPROVE" }), /Only the Boss/);
    await loginAs(o.boss.id);
    expect(ok(await decideManualEntryAction({ companyId: company.id, entryId: loan.id, decision: "APPROVE" })).status).toBe("POSTED");
    expect(await db.notification.count({ where: { userId: o.boss.id, kind: "ENTRY_TO_APPROVE" } })).toBe(1);
    // Someone who does not keep these books.
    await loginAs(o.cashier.id, o.deptA.id);
    fails(await saveManualEntryAction({ companyId: company.id, dateKey: t, label: "x", lines: [] }), /do not keep the books/);
  });

  it("statements: the income statement's net result is the ledger's; the balance sheet balances; the cash flow adds up", async () => {
    const yearFrom = `${t.slice(0, 4)}-01-01`;
    const is = await incomeStatementFor({ company, fromKey: yearFrom, toKey: t, compare: true });
    expect(is.lines.XI).toBe((await ledgerResult({ companyId: company.id, fromKey: yearFrom, toKey: t })).result);
    expect(is.lines.XI).toBe(37000);
    const bs = await balanceSheetAt({ company, toKey: t });
    expect(bs.balanced).toBe(true);
    expect(bs.liabilities.CA).toBe(1000000);
    expect(bs.liabilities.DA).toBe(500000);
    expect(bs.liabilities.CJ).toBe(37000);
    expect(bs.assets.BS).toBe(1000000 + 500000 + 37000);
    const cf = await cashFlowFor({ company, fromKey: yearFrom, toKey: t });
    expect(cf).toMatchObject({ ZA: 0, ZB: 37000, ZD: 1000000, ZE: 500000, checks: true });
    const gl = await generalLedger({ company, number: "5212", fromKey: yearFrom, toKey: t });
    expect(gl.closing).toBe(1500000);
  });

  it("VAT from a date: income after it is split into revenue and VAT collected", async () => {
    await loginAs(o.boss.id);
    ok(await setFeaturesAction({ companyId: company.id, vatEnabled: true, vatSince: `${m0}-01`, vatRate: 19.25 }));
    await loginAs(o.manager.id, o.deptA.id);
    const r = ok(await recordMoney({ departmentId: o.deptA.id, type: "OTHER_INCOME", amount: 11925, category: "income-catering", idempotencyKey: key() }));
    await syncCompany(company.id, { full: false });
    const e = await db.journalEntry.findFirst({ where: { companyId: company.id, sourceKey: `tx:${r.transactionId}`, reversedAt: null }, include: { lines: { include: { account: true } } } });
    expect(e.lines.map((l) => [l.account.number, l.debit, l.credit])).toEqual([["5711", 11925, 0], ["7078", 0, 10000], ["4432", 0, 1925]]);
    // Last month stays without VAT (before the start date).
    const rent = await db.journalEntry.findFirst({ where: { companyId: company.id, reference: "R-0001", reversedAt: null }, include: { lines: true } });
    expect(rent.lines).toHaveLength(2);
  });

  it("closing: months close in order, the Boss only; a closed month refuses records; reopening needs a reason", async () => {
    await loginAs(o.accountant.id);
    fails(await closeBooksAction({ companyId: company.id, month: prev }), /Only the Boss/);
    await loginAs(o.boss.id);
    fails(await closeBooksAction({ companyId: company.id, month: m0 }), /has ended/);
    const c = ok(await closeBooksAction({ companyId: company.id, month: prev }));
    expect(c.closed).toContain(prev);
    await loginAs(o.manager.id, o.deptA.id);
    fails(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas", dateKey: `${prev}-25`, idempotencyKey: key() }), /closed/);
    // The other company's department is not frozen.
    await loginAs(o.multi.id, o.laundry.id);
    const laundryPeriods = await db.accountingPeriod.count({ where: { companyId: (await db.department.findUnique({ where: { id: o.laundry.id } })).companyId } });
    expect(laundryPeriods).toBe(0);
    await loginAs(o.boss.id);
    fails(await saveManualEntryAction({ companyId: company.id, dateKey: `${prev}-28`, label: "Late", lines: [{ account: "5212", debit: 1 }, { account: "101", credit: 1 }], submit: true }), /closed until/);
    fails(await reopenBooksAction({ companyId: company.id }), /Say why/);
    expect(ok(await reopenBooksAction({ companyId: company.id, reason: "Missing invoice" })).reopened).toMatch(new RegExp(prev.slice(0, 4)));
  });

  it("the result of a year can only be allocated up to its profit", async () => {
    await loginAs(o.boss.id);
    fails(await allocateResultAction({ companyId: company.id, year: Number(t.slice(0, 4)), reserves: 10000000 }), /Only the year's profit/);
  });
});

describe.skipIf(!hasDb)("Full accounting: dates", () => {
  it("monthEnd", () => {
    expect(monthEnd("2026-02")).toBe("2026-02-28");
    expect(addDaysToKey("2026-03-01", -1)).toBe("2026-02-28");
  });
});

describe.skipIf(!hasDb)("Full accounting: supplier bills, VAT return, ageing, reconciliation", () => {
  let o;
  let company;
  beforeAll(async () => {
    o = await setupOrganization("Books2");
    company = await db.company.findFirst({ where: { organizationId: o.org.id, isDefault: true } });
    await loginAs(o.boss.id);
    ok(await setAccountingLevelAction({ companyId: company.id, level: "FULL" }));
    ok(await setFeaturesAction({ companyId: company.id, vatEnabled: true, vatSince: `${prev}-01`, vatRate: 19.25, payablesEnabled: true, reconciliationEnabled: true }));
    await loginAs(o.manager.id, o.deptA.id);
    ok(await recordMoney({ departmentId: o.deptA.id, type: "OTHER_INCOME", amount: 119250, category: "income-catering", dateKey: `${prev}-10`, idempotencyKey: key() }));
    const elec = ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 59625, category: "opex-electricity", dateKey: `${prev}-12`, idempotencyKey: key() }));
    await loginAs(o.boss.id);
    ok(await setExpenseVatAction({ companyId: company.id, transactionId: elec.transactionId, taxAmount: 9625 }));
  });

  it("a supplier's bill counts on its date in the department; paid later in parts from the bank; its lines cannot be voided alone", async () => {
    const bill = ok(await createBillAction({ companyId: company.id, supplierName: "CAMWATER", departmentId: o.deptA.id, supplierRef: "INV-77", dateKey: `${prev}-15`, dueKey: `${prev}-30`, lines: [{ category: "opex-water", amount: 23850, taxAmount: 3850 }] }));
    expect(bill).toMatchObject({ referenceNo: "FF-0001", total: 23850, taxAmount: 3850, status: "OPEN" });
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.deptA], fromKey: `${prev}-01`, toKey: monthEnd(prev), compare: false });
    expect(st.income.expenses).toBe(59625 + 23850);
    expect(st.cash.cashOut).toBe(59625);
    const line = await db.transaction.findFirst({ where: { supplierBillId: bill.id, type: "EXPENSE" } });
    await loginAs(o.manager.id, o.deptA.id);
    fails(await voidRecord({ transactionId: line.id, reason: "wrong", departmentId: o.deptA.id }), /void the bill/);
    await loginAs(o.boss.id);
    fails(await payBillAction({ companyId: company.id, billId: bill.id, amount: 30000, paymentMethod: "BANK_TRANSFER", reference: "X" }), /Only 23850/);
    expect(ok(await payBillAction({ companyId: company.id, billId: bill.id, amount: 10000, paymentMethod: "BANK_TRANSFER", reference: "VIR-1", dateKey: `${prev}-20` }))).toMatchObject({ left: 13850 });
    await syncCompany(company.id, { full: false });
    const owed = await partnerLedger({ company, side: "suppliers", asOfKey: t });
    expect(owed.rows).toEqual([expect.objectContaining({ name: "CAMWATER", owed: 13850 })]);
  });

  it("the VAT return of last month: collected − deductible = to pay, once", async () => {
    await syncCompany(company.id, { full: false });
    const v = await vatMonth({ company: await db.company.findUnique({ where: { id: company.id } }), month: prev });
    expect(v).toMatchObject({ collected: 19250, deductible: 9625 + 3850, toPay: 19250 - 13475 });
    const r = ok(await recordVatReturnAction({ companyId: company.id, month: prev }));
    expect(r.entry.status).toBe("POSTED");
    fails(await recordVatReturnAction({ companyId: company.id, month: prev }), /already recorded/);
    const tb = await trialBalance({ company: await db.company.findUnique({ where: { id: company.id } }), fromKey: `${prev}-01`, toKey: t });
    const n = (x) => tb.rows.find((row) => row.number === x)?.closing || 0;
    expect(n("4432") + n("4452") + n("4454")).toBe(0);
    expect(n("4441")).toBe(-5775);
  });

  it("a bank statement: the bill payment matches by itself, the bank charges are recorded from it", async () => {
    const parsed = parseStatementCsv(`date;libellé;référence;montant\n${prev.slice(5)}/20/x;x;;1\n20/${prev.slice(5)}/${prev.slice(0, 4)};Virement CAMWATER;VIR-1;-10000\n28/${prev.slice(5)}/${prev.slice(0, 4)};Frais de tenue de compte;;-1500`);
    expect(parsed.rows).toHaveLength(2);
    const imp = ok(await importStatementAction({ companyId: company.id, accountNumber: "5211", closingBalance: -11500, rows: parsed.rows }));
    expect(imp).toMatchObject({ lines: 2, matched: 1 });
    const st = await statementDetail({ company, statementId: imp.statementId });
    const fee = st.lines.find((l) => l.amount === -1500);
    expect(fee.status).toBe("UNMATCHED");
    ok(await postFromStatementLineAction({ companyId: company.id, statementLineId: fee.id, account: "631", label: "Bank charges" }));
    const after = await statementDetail({ company, statementId: imp.statementId });
    expect(after.lines.every((l) => l.status === "MATCHED")).toBe(true);
    expect(after.bookBalance).toBe(-11500);
  });
});
