import { describe, expect, it } from "vitest";
import { summarizeMoney, cashDrawer, calculateSaleTotals, debtStatus, debtMovement, classify, accountDelta } from "@/lib/finance/money-math";

const tx = (type, amount, extra = {}) => ({ type, amount, paymentMethod: "CASH", status: "COMPLETED", ...extra });
// Reference day (plan §10.4)
const day = [
  tx("SALE", 30000, { grossAmount: 30000, discountAmount: 0 }),
  tx("SALE", 6000, { grossAmount: 6000, discountAmount: 0, paymentMethod: "CREDIT" }),
  tx("SALE", 23000, { grossAmount: 24000, discountAmount: 1000 }),
  tx("SALE", 2000, { grossAmount: 2000, status: "VOIDED" }),
  tx("RENT_INCOME", 15000),
  tx("OTHER_INCOME", 2000),
  tx("PURCHASE", 12000),
  tx("EXPENSE", 5000, { category: "opex-gas" }),
  tx("OTHER_EXPENSE", 1000, { category: "other-expense-bank-fees" }),
  tx("DEBT_PAYMENT", 4000),
  tx("CASH_HANDOVER", 60000),
];

describe("money arithmetic", () => {
  it("money in = sales (gross) + rent + other income; money out = discounts + purchases + expenses + other", () => {
    const m = summarizeMoney(day);
    expect(m).toMatchObject({ salesGross: 60000, saleDiscounts: 1000, netSales: 59000, rentIncome: 15000, otherIncome: 2000, moneyIn: 77000 });
    expect(m).toMatchObject({ discounts: 1000, purchases: 12000, expenses: 5000, otherExpenses: 1000, moneyOut: 19000, result: 58000 });
    expect(m.creditSales).toBe(6000);
    expect(m.debtRepayments).toBe(4000);
    expect(m.voided).toBe(1);
    expect(m.expensesByCategory).toEqual({ "opex-gas": 5000 });
  });

  it("the drawer counts physical cash; a handover is a transfer; variance = counted − should remain", () => {
    const money = summarizeMoney(day);
    const c = cashDrawer({ openingCash: 10000, money, handovers: [{ amount: 60000, status: "CONFIRMED" }, { amount: 5000, status: "DISPUTED" }], countedCash: 5500 });
    expect(c).toMatchObject({ opening: 10000, cashIn: 74000, cashOut: 18000, expected: 66000, handedOver: 60000, shouldRemain: 6000, counted: 5500, variance: -500 });
  });

  it("MoMo and bank money are listed but not counted as drawer cash; supplier credit is not paid out", () => {
    const m = summarizeMoney([tx("SALE", 5000, { paymentMethod: "MOMO" }), tx("PURCHASE", 3000, { paymentMethod: "CREDIT" })]);
    expect(m.cash).toEqual({ in: 0, out: 0 });
    expect(m.receivedByMethod.MOMO).toBe(5000);
    expect(m.purchasesOnCredit).toBe(3000);
    expect(m.moneyOut).toBe(3000);
  });

  it("splits a discount across lines in whole francs", () => {
    const t = calculateSaleTotals([{ quantity: 1, unitPrice: 1000 }, { quantity: 2, unitPrice: 1000 }], 100);
    expect(t.grossAmount).toBe(3000);
    expect(t.netAmount).toBe(2900);
    expect(t.lines.map((l) => l.discountAmount)).toEqual([33, 67]);
    expect(calculateSaleTotals([{ quantity: 1, unitPrice: 500 }], 9999).discountAmount).toBe(500);
  });

  it("debt status and movement", () => {
    expect(debtStatus(6000, 0).status).toBe("UNPAID");
    expect(debtStatus(6000, 2000)).toMatchObject({ status: "PARTIALLY_PAID", balance: 4000 });
    expect(debtStatus(6000, 6000).status).toBe("PAID");
    expect(debtStatus(6000, 0, { cancelled: true })).toMatchObject({ status: "CANCELLED", balance: 0 });
    expect(debtMovement({ opening: 9000, given: 6000, repaid: 4000 }).closing).toBe(11000);
  });

  it("maps legacy types and drawer effects", () => {
    expect(classify({ type: "INCOME", operationCategory: "DEBT_COLLECTION" })).toBe("DEBT_PAYMENT");
    expect(classify({ type: "EXPENSE", category: "purchase-food" })).toBe("PURCHASE");
    expect(classify({ type: "SALE", status: "VOIDED" })).toBeNull();
    expect(accountDelta({ type: "SALE", amount: 100, paymentMethod: "CREDIT" })).toBe(0);
    expect(accountDelta({ type: "CASH_HANDOVER", amount: 100, paymentMethod: "CASH" })).toBe(-100);
  });
});
