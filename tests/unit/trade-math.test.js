import { describe, expect, it } from "vitest";
import { averageCost, cartTotals, isLow, margin, movementValue, packagingBalances, productCode, qty } from "@/lib/trade/stock-math";
import { commissions, isLate, isUnclaimed, loyaltyFree, priceOf, readyMessage, ticketMoney, ticketTotals } from "@/lib/services/ticket-math";
import { tradeWarnings } from "@/lib/trade/alert-math";
import { serviceWarnings } from "@/lib/services/alert-math";
import { tradeDigest } from "@/lib/trade/digest";

describe("stock arithmetic (shop, bar)", () => {
  it("average cost follows purchases; movements carry their value", () => {
    expect(averageCost(10, 4000, 8, 4600)).toBe(Math.round((10 * 4000 + 8 * 4600) / 18));
    expect(averageCost(0, 4000, 5, 4600)).toBe(4600);
    expect(averageCost(-2, 4000, 5, 4600)).toBe(4600);
    expect(averageCost(5, 300, 0, 999)).toBe(300);
    expect(movementValue(-2.5, 1200)).toBe(-3000);
    expect(qty(0.1 + 0.2)).toBe(0.3);
  });
  it("a cart spreads its discount over the lines (the last takes the rounding)", () => {
    const t = cartTotals([{ quantity: 2, unitPrice: 5000 }, { quantity: 3, unitPrice: 333 }], 1000);
    expect(t).toMatchObject({ gross: 10999, discount: 1000, net: 9999 });
    expect(t.lines.reduce((s, l) => s + l.discount, 0)).toBe(1000);
    expect(cartTotals([{ quantity: 1, unitPrice: 500 }], 9999).discount).toBe(500);
  });
  it("margins, low stock, codes", () => {
    expect(margin([{ total: 1000, discount: 100, quantity: 2, unitCost: 300 }])).toEqual({ revenue: 900, cost: 600, margin: 300, pct: 33.3 });
    expect(isLow({ kind: "GOODS", quantity: 3, lowStock: 3 })).toBe(true);
    expect(isLow({ kind: "GOODS", quantity: 3, lowStock: 0 })).toBe(false);
    expect(isLow({ kind: "SERVICE", quantity: 0, lowStock: 3 })).toBe(false);
    expect(productCode(7)).toBe("PR-0007");
  });
  it("crates: owed back, here, bottles with customers, deposits", () => {
    const b = packagingBalances([
      { kind: "RECEIVED", quantity: 4, amount: 14400 },
      { kind: "RETURNED", quantity: 2, amount: 7200 },
      { kind: "BROKEN", quantity: 1, amount: 3600 },
      { kind: "CUSTOMER_OUT", quantity: 6, amount: 1800 },
      { kind: "CUSTOMER_BACK", quantity: 2, amount: 600 },
      { kind: "COUNT", quantity: -1, amount: 0 },
    ]);
    expect(b).toMatchObject({ owedToSuppliers: 1, onHand: 0, bottlesWithCustomers: 4, depositsWithSuppliers: 3600, depositsHeldForCustomers: 1200, depositLost: 3600 });
  });
});

describe("job tickets arithmetic (pressing, car wash)", () => {
  const suit = { basePrice: 2000, prices: { "Suit (2 pieces)": 3500, Shirt: "" } };
  it("prices by variant, totals with express and discount", () => {
    expect(priceOf(suit, "Suit (2 pieces)")).toBe(3500);
    expect(priceOf(suit, "Shirt")).toBe(2000);
    expect(priceOf(suit, null)).toBe(2000);
    const t = ticketTotals([{ quantity: 2, unitPrice: 3500 }, { quantity: 1, unitPrice: 500 }], { surchargePct: 50, discount: 250 });
    expect(t).toMatchObject({ subtotal: 7500, surcharge: 3750, discount: 250, total: 11000 });
    expect(ticketTotals([{ quantity: 1, unitPrice: 100 }], { discount: 999 }).total).toBe(0);
  });
  it("commissions: % of the line's share of the total, or fixed per unit; none without a washer", () => {
    const items = { a: { commissionType: "PERCENT", commissionValue: 30 }, b: { commissionType: "FIXED", commissionValue: 200 }, c: { commissionType: "NONE" } };
    const lines = [{ itemId: "a", workerId: "w", total: 2000, quantity: 1 }, { itemId: "b", workerId: "w", total: 1000, quantity: 2 }, { itemId: "a", workerId: null, total: 1000, quantity: 1 }, { itemId: "c", workerId: "w", total: 500, quantity: 1 }];
    expect(commissions(lines, items, { subtotal: 4500, total: 4500 })).toEqual([600, 400, 0, 0]);
    // A free (loyalty) wash earns no percentage.
    expect(commissions(lines.slice(0, 1), items, { subtotal: 2000, total: 0 })).toEqual([0]);
  });
  it("money of a ticket, loyalty, late and unclaimed, the ready message", () => {
    expect(ticketMoney({ status: "READY", total: 5000 }, [{ type: "BOOKING_PAYMENT", amount: 3000 }, { type: "BOOKING_PAYMENT", amount: 500, status: "VOIDED" }])).toMatchObject({ paid: 3000, balance: 2000, kept: 0 });
    expect(ticketMoney({ status: "CANCELLED", total: 5000 }, [{ type: "BOOKING_PAYMENT", amount: 3000 }, { type: "BOOKING_REFUND", amount: 1000 }])).toMatchObject({ balance: -2000, kept: 2000 });
    expect([1, 2, 3, 4, 5, 6].map((n) => loyaltyFree(n - 1, 3))).toEqual([false, false, true, false, false, true]);
    expect(loyaltyFree(9, 0)).toBe(false);
    const now = new Date("2026-10-07T12:00:00Z");
    expect(isLate({ status: "RECEIVED", promisedAt: "2026-10-07T10:00:00Z" }, now)).toBe(true);
    expect(isLate({ status: "READY", promisedAt: "2026-10-07T10:00:00Z" }, now)).toBe(false);
    expect(isUnclaimed({ status: "READY", readyAt: "2026-09-01" }, "2026-10-07", 30)).toBe(true);
    expect(isUnclaimed({ status: "READY", readyAt: "2026-09-20" }, "2026-10-07", 30)).toBe(false);
    expect(readyMessage({ business: "Pressing Bonapriso", customer: "Mme Ngo", referenceNo: "TK-0004", balance: 2500, kind: "PRESSING" })).toMatch(/Mme Ngo, Pressing Bonapriso: your items are ready .*TK-0004.*2.500 FCFA/);
  });
});

describe("what needs attention", () => {
  it("shop / bar: out of stock, low, old tabs, late debts, bills due, crates", () => {
    const w = tradeWarnings({
      todayKey: "2026-10-07",
      nowIso: "2026-10-07T20:00:00Z",
      products: [{ id: "1", kind: "GOODS", isActive: true, empty: true, low: false, name: "Rice", code: "PR-1", quantity: 0, unit: "bag", lowStock: 2 }, { id: "2", kind: "GOODS", isActive: true, empty: false, low: true, name: "Soap", code: "PR-2", quantity: 2, unit: "piece", lowStock: 3 }, { id: "3", kind: "SERVICE", isActive: true, empty: false, low: false }],
      tabs: [{ id: "t", label: "Table 2", referenceNo: "TB-1", openedAt: "2026-10-07T01:00:00Z", total: 3000 }, { id: "u", label: "Table 3", referenceNo: "TB-2", openedAt: "2026-10-07T19:00:00Z", total: 1000 }],
      debts: [{ id: "d", debtor: "Mama", balance: 5000, overdue: true, dueKey: "2026-10-01" }],
      bills: [{ id: "b", supplier: "SABC", referenceNo: "FF-1", dueKey: "2026-10-09", balance: 20000 }, { id: "c", supplier: "X", referenceNo: "FF-2", dueKey: "2026-11-30", balance: 1 }],
      crates: { crates: [{ id: "k", name: "SABC", owedToSuppliers: 3, bottlesWithCustomers: 0 }], totals: { owedToSuppliers: 3, depositsWithSuppliers: 10800, bottlesWithCustomers: 0, depositsHeldForCustomers: 0 } },
    });
    expect(w.map((x) => x.key)).toEqual(["out-of-stock", "low-stock", "old-tabs", "late-debts", "bills-due", "crates-owed"]);
    expect(w.find((x) => x.key === "bills-due")).toMatchObject({ tone: "warn", amount: 20000 });
  });
  it("tickets: late, to tell, unclaimed, left owing, washers owed", () => {
    const w = serviceWarnings({
      domain: "CAR_WASH",
      tickets: [{ id: "1", referenceNo: "TK-1", late: true, status: "RECEIVED", promisedLabel: "07 Oct 10:00" }, { id: "2", referenceNo: "TK-2", status: "READY", notified: false, phone: "677000000" }, { id: "3", referenceNo: "TK-3", status: "READY", notified: true, phone: "6", unclaimed: true, balance: 500, readyKey: "2026-09-01" }],
      owing: [{ id: "4", referenceNo: "TK-4", balance: 1500 }],
      workers: [{ id: "w", name: "Paul", owed: 900, isActive: true }],
    });
    expect(w.map((x) => x.key)).toEqual(["late", "to-notify", "unclaimed", "owing", "workers-owed"]);
    expect(w[0].title).toBe("1 wash(s) late");
  });
  it("the report's line and e-mail sections", () => {
    const income = { moneyIn: 20000, moneyOut: 12000, result: 8000 };
    const d = tradeDigest({ trade: { income, sales: { net: 17000, count: 4, byMethod: { CASH: 12000, MOMO: 0, BANK_TRANSFER: 0, OTHER: 0, CREDIT: 5000 }, margin: 5000, byProduct: [{ name: "Rice", quantity: 2, revenue: 10000, margin: 2000 }] }, purchases: { amount: 9000 }, losses: { lost: 600 }, stock: { value: 40000, rows: [] }, credit: { owed: 3000 } }, services: null }, "daily");
    expect(d.line.replace(/\s/g, " ")).toBe("Sales 17 000 FCFA (4) · margin 5 000 FCFA · stock 40 000 FCFA · owed 3 000 FCFA · profit 8 000 FCFA");
    expect(d.sections.map((s) => s.title)).toEqual(["Sales and stock", "Profit"]);
  });
});
