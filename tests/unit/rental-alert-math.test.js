import { describe, expect, it } from "vitest";
import { rentalWarnings, warningsLine } from "@/lib/rental/alert-math";

const T = "2026-11-10";
const order = (o) => ({ id: o.ref, referenceNo: o.ref, client: { name: "C" }, eventType: "Wedding", status: "CONFIRMED", eventDateKey: "2026-11-20", dispatchDateKey: "2026-11-19", returnDateKey: "2026-11-21", overdue: false, lateReturn: false, figures: { balance: 0 }, ...o });

describe("event rental: what needs attention", () => {
  it("nothing to say when every booking, payment and item is in order", () => {
    expect(rentalWarnings({ orders: [order({ ref: "B-1" })], items: [{ id: "i", alert: null, damaged: 0 }], todayKey: T })).toEqual([]);
  });

  it("late returns, missing items and overdue balances come first; then soon-unpaid, preparation, stock; then information", () => {
    const w = rentalWarnings({
      todayKey: T,
      orders: [
        order({ ref: "B-1", status: "DISPATCHED", lateReturn: true, returnDateKey: "2026-11-08" }),
        order({ ref: "B-2", status: "RETURNED", overdue: true, figures: { balance: 40000 } }),
        order({ ref: "B-3", eventDateKey: "2026-11-15", figures: { balance: 25000 } }), // unpaid, within 7 days
        order({ ref: "B-4", eventDateKey: "2026-11-12", dispatchDateKey: "2026-11-11" }), // to prepare
        order({ ref: "B-5", eventDateKey: "2026-11-30", figures: { balance: 9000 } }), // unpaid but far
      ],
      items: [{ id: "a", code: "CHR-001", name: "Chairs", inStock: 3, alert: "LOW", damaged: 2 }],
      incidents: [{ id: "x", kind: "MISSING", quantity: 4, item: { name: "Plates" } }, { id: "y", kind: "DAMAGED", quantity: 1, item: { name: "Vase" } }],
      refused: [{ id: "r", label: "Chairs: 400 asked, 100 free", dateKey: "2026-11-09" }],
      unvalidated: { count: 2, amount: 15000 },
    });
    expect(w.map((x) => x.key)).toEqual(["late-returns", "missing", "overdue", "unpaid-soon", "prepare", "low-stock", "damaged", "refused", "approvals"]);
    expect(w.find((x) => x.key === "missing").title).toBe("4 items missing to settle");
    expect(w.find((x) => x.key === "overdue")).toMatchObject({ amount: 40000, tone: "bad" });
    expect(w.find((x) => x.key === "unpaid-soon")).toMatchObject({ count: 1, amount: 25000 });
    expect(w.find((x) => x.key === "prepare").rows.map((r) => r.id)).toEqual(["B-4"]);
    expect(w.find((x) => x.key === "damaged").title).toBe("2 damaged items waiting");
    expect(warningsLine(w.slice(0, 2))).toBe("1 booking not returned on time · 4 items missing to settle");
  });

  it("an overdue booking is not counted again as 'unpaid soon'", () => {
    const w = rentalWarnings({ todayKey: T, orders: [order({ ref: "B-1", eventDateKey: T, overdue: true, figures: { balance: 1000 } })] });
    expect(w.map((x) => x.key)).toEqual(["overdue"]);
  });
});
