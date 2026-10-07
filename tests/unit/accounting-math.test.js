import { describe, expect, it } from "vitest";
import { balanced, fingerprint, recognitionEntry, transactionEntry, vatIncluded, vatOn } from "@/lib/accounting/rules";
import { accountResolver } from "@/lib/accounting/account-map";
import { SYSCOHADA_ACCOUNTS, accountNature, validAccountNumber } from "@/lib/accounting/chart";
import { balanceLine, balanceSheet, cashFlow, incomeStatement } from "@/lib/accounting/statement-math";

import { ageLines, proposeMatches, returnLines } from "@/lib/accounting/books-math";
import { parseStatementCsv } from "@/lib/accounting/reconciliation-csv";

import { CATEGORY_ACCOUNTS, ROLE_ACCOUNTS } from "@/lib/accounting/account-map";

const accounts = accountResolver({});
const company = { vatEnabled: false };
const tx = (o) => ({ id: "t1", status: "COMPLETED", paymentMethod: "CASH", dateKey: "2026-10-05", departmentId: "d1", amount: 10000, ...o });
const lines = (spec) => spec.lines.map((l) => [l.account, l.debit, l.credit]);

describe("the chart and the default accounts", () => {
  it("every default account exists in the SYSCOHADA chart; numbers are unique", () => {
    const numbers = new Set(SYSCOHADA_ACCOUNTS.map((a) => a.number));
    expect(numbers.size).toBe(SYSCOHADA_ACCOUNTS.length);
    for (const n of [...Object.values(ROLE_ACCOUNTS), ...Object.values(CATEGORY_ACCOUNTS)]) expect(numbers.has(n), n).toBe(true);
    expect(accountNature("6031")).toBe("EXPENSE");
    expect(accountNature("2844")).toBe("CONTRA_ASSET");
    expect(accountNature("822")).toBe("INCOME");
    expect(validAccountNumber("5212")).toBe(true);
    expect(validAccountNumber("9999")).toBe(false);
    expect(validAccountNumber("52")).toBe(false);
  });
});

describe("posting rules: money records", () => {
  it("a cash sale with a discount: cash, revenue gross, discount; a credit sale goes to the customer", () => {
    const s = transactionEntry(tx({ type: "SALE", amount: 9000, grossAmount: 10000, discountAmount: 1000, category: "sale-food" }), { accounts, company });
    expect(s.journal).toBe("CA");
    expect(lines(s)).toEqual([["5711", 9000, 0], ["702", 0, 10000], ["7019", 1000, 0]]);
    expect(balanced(s)).toBe(true);
    const c = transactionEntry(tx({ type: "SALE", amount: 5000, paymentMethod: "CREDIT", category: "sale-food", partner: { key: "debt:1", name: "Paul" } }), { accounts, company });
    expect(c.journal).toBe("VE");
    expect(c.lines[0]).toMatchObject({ account: "411", debit: 5000, partnerKey: "debt:1" });
  });
  it("expenses by category, assets bought, on credit to the supplier; MoMo and bank journals", () => {
    expect(lines(transactionEntry(tx({ type: "EXPENSE", category: "opex-gas", paymentMethod: "MOMO" }), { accounts, company }))).toEqual([["6053", 10000, 0], ["552", 0, 10000]]);
    expect(lines(transactionEntry(tx({ type: "EXPENSE", category: "stay-asset-purchase" }), { accounts, company }))).toEqual([["244", 10000, 0], ["5711", 0, 10000]]);
    const credit = transactionEntry(tx({ type: "PURCHASE", category: "purchase-food", paymentMethod: "CREDIT", partner: { key: "supplier:s", name: "Market" } }), { accounts, company });
    expect(credit.journal).toBe("AC");
    expect(lines(credit)).toEqual([["602", 10000, 0], ["401", 0, 10000]]);
    expect(transactionEntry(tx({ type: "SUPPLIER_PAYMENT", paymentMethod: "BANK_TRANSFER", partner: { key: "supplier:s", name: "Market" } }), { accounts, company }).journal).toBe("BQ");
  });
  it("booking payments and refunds move the client's account; deposits go to 165; handovers to the Boss's cash", () => {
    expect(lines(transactionEntry(tx({ type: "BOOKING_PAYMENT", category: "venue-booking", partner: { key: "booking:b", name: "A" } }), { accounts, company }))).toEqual([["5711", 10000, 0], ["411", 0, 10000]]);
    expect(lines(transactionEntry(tx({ type: "BOOKING_PAYMENT", category: "lease-deposit" }), { accounts, company }))).toEqual([["5711", 10000, 0], ["165", 0, 10000]]);
    expect(lines(transactionEntry(tx({ type: "BOOKING_REFUND", category: "lease-deposit-refund" }), { accounts, company }))).toEqual([["165", 10000, 0], ["5711", 0, 10000]]);
    expect(lines(transactionEntry(tx({ type: "CASH_HANDOVER" }), { accounts, company }))).toEqual([["5712", 10000, 0], ["5711", 0, 10000]]);
  });
  it("a voided record writes nothing; overrides change the account", () => {
    expect(transactionEntry(tx({ type: "EXPENSE", category: "opex-gas", status: "VOIDED" }), { accounts, company })).toBeNull();
    const custom = accountResolver({ "category:opex-gas": "6058", "role:CASH": "571" });
    expect(lines(transactionEntry(tx({ type: "EXPENSE", category: "opex-gas" }), { accounts: custom, company }))).toEqual([["6058", 10000, 0], ["571", 0, 10000]]);
  });
  it("the fingerprint changes with the date or a line, not otherwise", () => {
    const a = transactionEntry(tx({ type: "EXPENSE", category: "opex-gas" }), { accounts, company });
    expect(fingerprint(a)).toBe(fingerprint(transactionEntry(tx({ type: "EXPENSE", category: "opex-gas" }), { accounts, company })));
    expect(fingerprint(a)).not.toBe(fingerprint({ ...a, dateKey: "2026-10-06" }));
    expect(fingerprint(a)).not.toBe(fingerprint(transactionEntry(tx({ type: "EXPENSE", category: "opex-gas", amount: 10001 }), { accounts, company })));
  });
});

describe("posting rules: VAT", () => {
  const vatCo = { vatEnabled: true, vatSince: "2026-10-01", vatRateBp: 1925, vatExempt: ["income-other"] };
  it("VAT included in an amount at 19.25 %", () => {
    expect(vatIncluded(11925, 1925)).toBe(1925);
    expect(vatIncluded(100000, 1925)).toBe(16143);
    expect(vatOn(vatCo, "2026-09-30")).toBeNull();
    expect(vatOn(vatCo, "2026-10-01")).toMatchObject({ rateBp: 1925 });
  });
  it("income is split; exempt categories and dates before the start are not; deductible VAT typed on expenses", () => {
    expect(lines(transactionEntry(tx({ type: "OTHER_INCOME", amount: 11925, category: "income-catering" }), { accounts, company: vatCo }))).toEqual([["5711", 11925, 0], ["7078", 0, 10000], ["4432", 0, 1925]]);
    expect(lines(transactionEntry(tx({ type: "OTHER_INCOME", amount: 11925, category: "income-other" }), { accounts, company: vatCo }))).toEqual([["5711", 11925, 0], ["758", 0, 11925]]);
    expect(lines(transactionEntry(tx({ type: "OTHER_INCOME", amount: 11925, category: "income-catering", dateKey: "2026-09-30" }), { accounts, company: vatCo }))).toHaveLength(2);
    expect(lines(transactionEntry(tx({ type: "PURCHASE", amount: 11925, taxAmount: 1925, category: "purchase-food" }), { accounts, company: vatCo }))).toEqual([["602", 10000, 0], ["4452", 1925, 0], ["5711", 0, 11925]]);
    expect(lines(transactionEntry(tx({ type: "SALE", amount: 11925, category: "sale-food" }), { accounts, company: vatCo }))).toEqual([["5711", 11925, 0], ["702", 0, 10000], ["4431", 0, 1925]]);
  });
  it("revenue recognitions carry VAT; money kept on a cancellation does not", () => {
    const r = recognitionEntry({ sourceKey: "lease-rent:l:2026-10", kind: "revenue", role: "OFFICE_RENT", dateKey: "2026-10-01", amount: 119250, partner: { key: "lease:l", name: "XYZ" }, label: "Rent", departmentId: "d" }, { accounts, company: vatCo });
    expect(lines(r)).toEqual([["411", 119250, 0], ["7064", 0, 100000], ["4432", 0, 19250]]);
    expect(lines(recognitionEntry({ sourceKey: "k", kind: "revenue", role: "KEPT", dateKey: "2026-10-02", amount: 50000, label: "Kept", departmentId: "d" }, { accounts, company: vatCo }))).toEqual([["411", 50000, 0], ["7581", 0, 50000]]);
  });
  it("the month's return: VAT to pay after the credit carried, or a new credit", () => {
    expect(returnLines({ collected: { 4432: 50000 }, deductible: { 4452: 20000 }, credit: 10000 })).toMatchObject({ net: 30000, creditUsed: 10000, toPay: 20000 });
    const r = returnLines({ collected: { 4432: 5000 }, deductible: { 4452: 20000, 4454: 1000 }, credit: 0 });
    expect(r).toMatchObject({ net: -16000, carried: 16000, toPay: 0 });
    const d = r.lines.reduce((s, l) => s + l.debit, 0);
    expect(d).toBe(r.lines.reduce((s, l) => s + l.credit, 0));
  });
});

describe("posting rules: recognitions", () => {
  it("events, forgiven debts, losses, depreciation, disposals, deposits used, old debts, write-offs", () => {
    const base = { dateKey: "2026-10-05", label: "x", departmentId: "d", partner: { key: "booking:b", name: "A" } };
    expect(lines(recognitionEntry({ ...base, sourceKey: "a", kind: "revenue", role: "EVENTS", amount: 500000 }, { accounts, company }))).toEqual([["411", 500000, 0], ["7061", 0, 500000]]);
    expect(lines(recognitionEntry({ ...base, sourceKey: "b", kind: "forgiven", amount: 1000 }, { accounts, company }))).toEqual([["7019", 1000, 0], ["411", 0, 1000]]);
    expect(lines(recognitionEntry({ ...base, sourceKey: "c", kind: "loss", assetRole: "RENTAL_EQUIPMENT", amount: 3000 }, { accounts, company }))).toEqual([["6581", 3000, 0], ["2446", 0, 3000]]);
    expect(lines(recognitionEntry({ ...base, sourceKey: "d", kind: "depreciation", amount: 2500 }, { accounts, company }))).toEqual([["681", 2500, 0], ["2844", 0, 2500]]);
    const disp = recognitionEntry({ ...base, sourceKey: "e", kind: "disposal", cost: 100000, accumulated: 40000, proceeds: 70000 }, { accounts, company });
    expect(lines(disp)).toEqual([["2844", 40000, 0], ["812", 60000, 0], ["2446", 0, 100000], ["485", 70000, 0], ["822", 0, 70000]]);
    expect(balanced(disp)).toBe(true);
    expect(lines(recognitionEntry({ ...base, sourceKey: "f", kind: "deposit-used", amount: 50000 }, { accounts, company }))).toEqual([["165", 50000, 0], ["411", 0, 50000]]);
    expect(recognitionEntry({ ...base, sourceKey: "g", kind: "opening-debt", amount: 7000 }, { accounts, company }).journal).toBe("AN");
    expect(lines(recognitionEntry({ ...base, sourceKey: "h", kind: "write-off", amount: 7000 }, { accounts, company }))).toEqual([["651", 7000, 0], ["411", 0, 7000]]);
  });
});

describe("SYSCOHADA statements", () => {
  it("income statement: intermediate balances down to the net result", () => {
    const L = incomeStatement({ 702: -1000000, 7019: 20000, 7061: -500000, 602: 300000, 6053: 50000, 622: 40000, 661: 200000, 681: 30000, 671: 10000, 822: -70000, 812: 60000, 891: 20000 });
    expect(L.XB).toBe(1000000 - 20000 + 500000);
    expect(L.XC).toBe(L.XB - 300000 - 50000 - 40000);
    expect(L.XD).toBe(L.XC - 200000);
    expect(L.XE).toBe(L.XD - 30000);
    expect(L.XF).toBe(-10000);
    expect(L.XH).toBe(10000);
    expect(L.XI).toBe(L.XE + L.XF + L.XH - 20000);
  });
  it("balance sheet: every account lands once, advances apart, both sides equal", () => {
    expect(balanceLine("4191", -1)).toEqual(["DI", "P"]);
    expect(balanceLine("411", -5)).toEqual(["DI", "P"]);
    expect(balanceLine("5211", -5)).toEqual(["DR", "P"]);
    expect(balanceLine("2844", -5)).toEqual(["AI", "A"]);
    const bal = { 101: -1000000, 165: -300000, 2446: 400000, 2844: -40000, 5211: 900000, 5711: 50000, 401: -60000, 4432: -19250, 4452: 10000 };
    const partners = [{ number: "411", balance: 120000 }, { number: "411", balance: -80000 }];
    const result = Object.values(bal).reduce((s, v) => s + v, 0) + 40000;
    const bs = balanceSheet({ bal, partners, result, priorResult: 0 });
    expect(bs.assets.AI).toBe(360000);
    expect(bs.assets.BI).toBe(120000);
    expect(bs.liabilities.DI).toBe(80000);
    expect(bs.liabilities.DA).toBe(300000);
    expect(bs.liabilities.DK).toBe(19250);
    expect(bs.assets.BJ).toBe(10000);
    expect(bs.balanced).toBe(true);
  });
  it("cash flow: operating, investing, financing; transfers between treasury accounts cancel", () => {
    const cf = cashFlow({
      opening: 100000,
      closing: 100000 + 50000 - 20000 + 300000 + 0,
      entries: [
        { lines: [{ number: "5711", debit: 50000, credit: 0 }, { number: "702", debit: 0, credit: 50000 }] },
        { lines: [{ number: "2441", debit: 20000, credit: 0 }, { number: "5211", debit: 0, credit: 20000 }] },
        { lines: [{ number: "5211", debit: 300000, credit: 0 }, { number: "162", debit: 0, credit: 300000 }] },
        { lines: [{ number: "5712", debit: 40000, credit: 0 }, { number: "5711", debit: 0, credit: 40000 }] },
      ],
    });
    expect(cf).toMatchObject({ ZB: 50000, ZC: -20000, ZE: 300000, ZF: 300000, checks: true });
  });
});

describe("customers' ageing and bank statements", () => {
  it("payments settle the oldest charges first; what remains is aged", () => {
    const r = ageLines([{ dateKey: "2026-06-01", amount: 100000 }, { dateKey: "2026-09-20", amount: 50000 }, { dateKey: "2026-09-25", amount: -120000 }], "2026-10-06");
    expect(r).toMatchObject({ owed: 30000, ahead: 0, oldestKey: "2026-09-20" });
    expect(r.buckets["0-30"]).toBe(30000);
    expect(ageLines([{ dateKey: "2026-10-01", amount: -5000 }], "2026-10-06")).toMatchObject({ owed: 0, ahead: 5000, balance: -5000 });
  });
  it("reads a bank CSV (French or English headers, debit/credit columns) and matches by amount, reference, then date", () => {
    const a = parseStatementCsv("Date;Libellé;Référence;Débit;Crédit\n05/10/2026;Virement client;VIR1;;250 000\n06/10/2026;Frais;;1.500;\nTotal;;;;");
    expect(a.rows).toEqual([{ dateKey: "2026-10-05", label: "Virement client", reference: "VIR1", amount: 250000 }, { dateKey: "2026-10-06", label: "Frais", reference: null, amount: -1500 }]);
    expect(a.errors).toHaveLength(1);
    const b = parseStatementCsv("date,description,amount\n2026-10-07,MoMo in,15000");
    expect(b.rows[0]).toMatchObject({ amount: 15000 });
    expect(parseStatementCsv("x,y\n1,2").errors[0]).toMatch(/column/);
    const m = proposeMatches(
      [{ id: "s1", dateKey: "2026-10-05", amount: 250000, reference: "VIR1" }, { id: "s2", dateKey: "2026-10-06", amount: -1500 }],
      [{ id: "l1", dateKey: "2026-10-03", amount: 250000, reference: "x" }, { id: "l2", dateKey: "2026-10-09", amount: 250000, reference: "VIR1" }, { id: "l3", dateKey: "2026-10-30", amount: -1500 }]
    );
    expect(m).toEqual([{ statementLineId: "s1", journalLineId: "l2" }]);
  });
});
