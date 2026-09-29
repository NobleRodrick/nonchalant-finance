import { describe, expect, it } from "vitest";
import { describe as describeOp, opsInEffect, overlayDishes, overlaySales, overlayMoneySummary, overlayStock, overlayDebts, overlayDrawer, overlayDayStatus, overlayReport, overlayCashRequests, summarizeDebts } from "@/lib/offline/overlay";
import { encodeLocalIds, localId, parseLocalId, isLocalId } from "@/lib/offline/local-ids";
import { saleSpec, voidSpec, moneySpec, stockAddSpec, debtSpec, repaySpec, handoverSpec, reportSpec, correctSpec } from "@/lib/offline/specs";
import { valuePositions } from "@/lib/restaurant/stock-math";
import { STATUS } from "@/lib/offline/status";

const DAY = "2026-09-29";
let n = 0;
/** An operation as the outbox holds it (waiting to be sent unless `extra` says otherwise). */
function op(spec, extra = {}) {
  n += 1;
  const key = `key${String(n).padStart(8, "0")}`;
  const { value, deps } = encodeLocalIds(spec.input);
  return { key, seq: n, userId: "u1", departmentId: "d1", kind: spec.kind, input: value, deps, occurredAt: `${DAY}T10:00:00.000Z`, dateKey: spec.dateKey || DAY, label: spec.label, meta: { ...spec.meta, time: "11:00" }, status: STATUS.PENDING, createdAt: 1, ...extra };
}
const effects = (ops) => ops.map(describeOp);
const rice = { id: "rice", name: "Rice", price: 1000, available: 10 };
const fish = { id: "fish", name: "Fish", price: 3000, available: 4 };

describe("local ids", () => {
  it("encodes ids of records not sent yet as references to their operation", () => {
    const id = localId("dishId", "abc12345xyz");
    expect(isLocalId(id)).toBe(true);
    expect(parseLocalId(id)).toEqual({ field: "dishId", key: "abc12345xyz" });
    const { value, deps } = encodeLocalIds({ lines: [{ dishId: id, quantity: 2 }, { dishId: "real", quantity: 1 }], debtId: localId("debtId", "k2k2k2k2k2") });
    expect(value.lines[0].dishId).toEqual({ $ref: "abc12345xyz", field: "dishId" });
    expect(value.lines[1].dishId).toBe("real");
    expect(value.debtId).toEqual({ $ref: "k2k2k2k2k2", field: "debtId" });
    expect(deps.sort()).toEqual(["abc12345xyz", "k2k2k2k2k2"]);
  });
});

describe("which records count on top of the server's figures", () => {
  it("counts waiting records and records applied after the page was rendered, never refused ones", () => {
    const base = op(saleSpec({ departmentId: "d1", lines: [{ dishId: "rice", name: "Rice", price: 1000, quantity: 1 }], method: "CASH" }));
    const ops = [
      { ...base, key: "a", status: STATUS.PENDING },
      { ...base, key: "b", status: STATUS.SENDING },
      { ...base, key: "c", status: STATUS.APPLIED, appliedAt: 2000 },
      { ...base, key: "d", status: STATUS.APPLIED, appliedAt: 500 },
      { ...base, key: "e", status: STATUS.REJECTED },
      { ...base, key: "f", departmentId: "other" },
    ];
    expect(opsInEffect(ops, { departmentId: "d1", renderedAt: 1000 }).map((o) => o.key)).toEqual(["a", "b", "c"]);
  });
});

describe("point of sale while offline", () => {
  it("takes plates off the dishes, lists the sale on top and shows an undo", () => {
    const sale = op(saleSpec({ departmentId: "d1", lines: [{ dishId: "rice", name: "Rice", price: 1000, quantity: 3 }, { dishId: "fish", name: "Fish", price: 3000, quantity: 1 }], method: "CASH" }));
    let e = effects([sale]);
    const dishes = overlayDishes([rice, fish], e);
    expect(dishes.map((d) => d.available)).toEqual([7, 3]);
    const sales = overlaySales([{ id: "s1", referenceNo: "S-0001", net: 500, voided: false }], e, { dateKey: DAY });
    expect(sales[0]).toMatchObject({ id: localId("transactionId", sale.key), referenceNo: "Not sent yet", net: 6000, pending: true });
    // Undo the waiting sale: plates come back, the row is marked undone.
    const undo = op(voidSpec({ departmentId: "d1", dateKey: DAY, row: sales[0], type: "SALE", reason: "Entered by mistake" }));
    expect(undo.input.transactionId).toEqual({ $ref: sale.key, field: "transactionId" });
    expect(undo.deps).toEqual([sale.key]);
    e = effects([sale, undo]);
    expect(overlayDishes([rice, fish], e).map((d) => d.available)).toEqual([10, 4]);
    expect(overlaySales([], e, { dateKey: DAY })[0]).toMatchObject({ voided: true, undoPending: true });
  });

  it("sells a dish created offline and a sale on credit creates the customer and the debt", () => {
    const create = op({ kind: "dish.create", label: "New dish", input: { departmentId: "d1", name: "Soup", unitPrice: 500, openingPlates: 6 }, meta: {} });
    const soupId = localId("dishId", create.key);
    const sale = op(saleSpec({ departmentId: "d1", lines: [{ dishId: soupId, name: "Soup", price: 500, quantity: 2 }], method: "CREDIT", debtor: { name: "Marie", phone: "" }, customer: "Marie" }));
    expect(sale.deps).toEqual([create.key]);
    const e = effects([create, sale]);
    const soup = overlayDishes([rice], e).find((d) => d.id === soupId);
    expect(soup).toMatchObject({ name: "Soup", price: 500, available: 4, pending: true });
    const { debts, stats, customers } = overlayDebts([], e, { todayKey: DAY });
    expect(debts[0]).toMatchObject({ debtor: "Marie", owed: 1000, balance: 1000, status: "UNPAID", referenceNo: "Not sent yet" });
    expect(stats).toMatchObject({ outstanding: 1000, givenToday: 1000, customersOwing: 1 });
    expect(customers[0].name).toBe("Marie");
  });
});

describe("money, stock, debts and cash figures", () => {
  it("adds the day's records to the money figures (a void subtracts)", () => {
    const summary = { salesGross: 5000, saleDiscounts: 0, standaloneDiscounts: 0, discounts: 0, rentIncome: 0, otherIncome: 0, moneyIn: 5000, purchases: 0, expenses: 0, otherExpenses: 0, moneyOut: 0, result: 5000 };
    const sale = op(saleSpec({ departmentId: "d1", lines: [{ dishId: "rice", name: "Rice", price: 1000, quantity: 2 }], method: "MOMO", discount: 200, discountReason: "Friend" }));
    const expense = op(moneySpec({ departmentId: "d1", type: "EXPENSE", amount: 700, category: "opex-gas", paymentMethod: "CASH" }));
    const voidServerSale = op(voidSpec({ departmentId: "d1", dateKey: DAY, row: { id: "s1", referenceNo: "S-0001", net: 5000, gross: 5000, discount: 0, method: "CASH", lines: [{ dishId: "rice", quantity: 5, unitPrice: 1000 }] }, type: "SALE", reason: "Wrong" }));
    const out = overlayMoneySummary(summary, effects([sale, expense, voidServerSale]), { dateKey: DAY });
    expect(out).toMatchObject({ salesGross: 2000, saleDiscounts: 200, discounts: 200, expenses: 700, moneyIn: 2000, moneyOut: 900, result: 1100 });
    // Another day's page is not changed.
    expect(overlayMoneySummary(summary, effects([sale]), { dateKey: "2026-09-28" })).toBe(summary);
  });

  it("stock: added, sold, spoiled and the value follow the formula", () => {
    const stock = valuePositions([{ dishId: "rice", name: "Rice", unitPrice: 1000, costPrice: 0, isActive: true, lowStockLevel: 0, opening: 10, openingCorrection: 0, added: 0, sold: 0, spoiled: 0, corrected: 0, closing: 10, available: 10 }]);
    const add = op(stockAddSpec({ departmentId: "d1", dateKey: DAY, dishId: "rice", dishName: "Rice", plates: 5, bought: true, amountPaid: 4000 }));
    const sale = op(saleSpec({ departmentId: "d1", lines: [{ dishId: "rice", name: "Rice", price: 1000, quantity: 4 }], method: "CASH" }));
    const spoil = op(correctSpec({ departmentId: "d1", dateKey: DAY, dishId: "rice", name: "Rice", counted: 9, current: 11, reasonType: "SPOILED" }));
    const out = overlayStock({ ...stock, rows: stock.rows }, effects([add, sale, spoil]), { dateKey: DAY });
    expect(out.rows[0]).toMatchObject({ opening: 10, added: 5, sold: 4, spoiled: 2, closing: 9, value: 9000, available: 9, pending: true });
    expect(out.totals).toMatchObject({ closing: 9, value: 9000 });
  });

  it("debts: a repayment lowers the balance, the drawer gets the cash", () => {
    const rows = [{ id: "debt1", referenceNo: "D-0001", source: "CREDIT_SALE", dateKey: "2026-09-20", debtorId: "c1", debtor: "Paul", owed: 5000, paid: 1000, balance: 4000, status: "PARTIALLY_PAID", payments: [] }];
    const repay = op(repaySpec({ departmentId: "d1", debt: rows[0], amount: 4000, paymentMethod: "CASH" }));
    const { debts, stats } = overlayDebts(rows, effects([repay]), { todayKey: DAY, repaidToday: 0 });
    expect(debts[0]).toMatchObject({ paid: 5000, balance: 0, status: "PAID" });
    expect(stats).toMatchObject({ outstanding: 0, repaidToday: 4000, customersOwing: 0 });
    const drawer = { opening: 1000, cashIn: 0, cashOut: 0, expected: 1000, handedOver: 0, handoverPending: 0, shouldRemain: 1000, counted: null, variance: null, electronic: { MOMO: 0, BANK_TRANSFER: 0 } };
    const hand = op(handoverSpec({ departmentId: "d1", amount: 3000, recipientName: "Boss", cashRequestId: "req1" }));
    const d = overlayDrawer(drawer, effects([repay, hand]), { dateKey: DAY });
    expect(d).toMatchObject({ cashIn: 4000, expected: 5000, handedOver: 3000, shouldRemain: 2000 });
    const reqs = overlayCashRequests([{ id: "req1", status: "OPEN", handovers: [], figures: { outstanding: 3000, handedOver: 0, againstRequest: 0 } }], effects([hand]));
    expect(reqs[0]).toMatchObject({ status: "ANSWERED", pending: true, figures: { outstanding: 0, handedOver: 3000 } });
  });

  it("summarizes customers like the server page", () => {
    const rows = [
      { id: "1", debtorId: "c1", debtor: "Paul", owed: 1000, paid: 0, balance: 1000, status: "UNPAID", dateKey: DAY, source: "CREDIT_SALE" },
      { id: "2", debtorId: "c1", debtor: "Paul", owed: 500, paid: 500, balance: 0, status: "PAID", dateKey: "2026-09-01", source: "OPENING_BALANCE" },
      { id: "3", debtorId: "c2", debtor: "Ann", owed: 800, paid: 0, balance: 0, status: "CANCELLED", dateKey: DAY, source: "CREDIT_SALE" },
    ];
    const { stats, customers } = summarizeDebts(rows, { todayKey: DAY, repaidToday: 200 });
    expect(stats).toEqual({ outstanding: 1000, givenToday: 1000, repaidToday: 200, customersOwing: 1 });
    expect(customers).toHaveLength(1);
    expect(customers[0]).toMatchObject({ name: "Paul", owed: 1500, paid: 500, balance: 1000, debts: 2 });
  });

  it("a report sent offline locks the day on this computer", () => {
    const send = op(reportSpec({ departmentId: "d1", dateKey: DAY, countedCash: 1000, notes: "", send: true }));
    expect(overlayDayStatus({ status: "DRAFT", locked: false }, effects([send]), { dateKey: DAY })).toMatchObject({ locked: true, status: "SUBMITTED" });
    expect(overlayDayStatus({ status: "DRAFT", locked: false }, effects([send]), { dateKey: "2026-09-28" }).locked).toBe(false);
  });

  it("the live report includes waiting records everywhere (money, sales by dish, debts, cash, records)", () => {
    const model = {
      status: "DRAFT",
      locked: false,
      money: { salesGross: 0, saleDiscounts: 0, standaloneDiscounts: 0, discounts: 0, netSales: 0, rentIncome: 0, otherIncome: 0, moneyIn: 0, purchases: 0, purchasesOnCredit: 0, expenses: 0, otherExpenses: 0, moneyOut: 0, result: 0, debtRepayments: 0, salesByMethod: { CASH: 0, MOMO: 0, BANK_TRANSFER: 0, CREDIT: 0 }, salesCount: 0 },
      sales: { byDish: [], plates: 0 },
      stock: valuePositions([{ dishId: "rice", name: "Rice", unitPrice: 1000, costPrice: 0, isActive: true, lowStockLevel: 0, opening: 10, openingCorrection: 0, added: 0, sold: 0, spoiled: 0, corrected: 0, closing: 10 }]),
      cash: { opening: 0, cashIn: 0, cashOut: 0, expected: 0, handedOver: 0, handoverPending: 0, shouldRemain: 0, counted: null, variance: null, electronic: { MOMO: 0, BANK_TRANSFER: 0 } },
      debts: { opening: 0, given: 0, oldAdded: 0, repaid: 0, cancelled: 0, closing: 0 },
      records: [],
    };
    const sale = op(saleSpec({ departmentId: "d1", lines: [{ dishId: "rice", name: "Rice", price: 1000, quantity: 2 }], method: "CASH" }));
    const credit = op(debtSpec({ departmentId: "d1", customer: "Ann", debtor: { name: "Ann" }, lines: [{ dishId: "rice", name: "Rice", price: 1000, quantity: 1 }] }));
    const count = op(reportSpec({ departmentId: "d1", dateKey: DAY, countedCash: 2000, notes: "", send: false }));
    const r = overlayReport(model, effects([sale, credit, count]), { dateKey: DAY });
    expect(r.money).toMatchObject({ salesGross: 3000, moneyIn: 3000, result: 3000, salesCount: 2 });
    expect(r.sales.byDish[0]).toMatchObject({ dishId: "rice", plates: 3, gross: 3000 });
    expect(r.stock.totals).toMatchObject({ closing: 7, value: 7000 });
    expect(r.cash).toMatchObject({ cashIn: 2000, shouldRemain: 2000, counted: 2000, variance: 0 });
    expect(r.debts).toMatchObject({ given: 1000, closing: 1000 });
    expect(r.records).toHaveLength(2);
    expect(r.pendingCount).toBe(3);
  });
});
