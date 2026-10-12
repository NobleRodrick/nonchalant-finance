import { describe, expect, it } from "vitest";
import { shareVat, stockMovement } from "@/lib/trade/stock-math";

/** Runs movements on a product and returns it with the movements' values. */
function run(moves) {
  let p = { quantity: 0, held: 0, costPrice: 0 };
  const values = [];
  for (const [kind, q, extra = {}] of moves) {
    const s = stockMovement(p, q, { kind, ...extra });
    values.push(s.value);
    p = { quantity: Math.round((p.quantity + q) * 1000) / 1000, held: s.held, costPrice: s.costPrice };
  }
  return { ...p, values, sum: values.reduce((a, b) => a + b, 0) };
}

describe("exact stock value (average cost without residue)", () => {
  it("3 for 1 000 then 1 for 500, all sold: nothing left in value", () => {
    const r = run([["PURCHASE", 3, { value: 1000 }], ["PURCHASE", 1, { value: 500 }], ["SALE", -4]]);
    expect(r).toMatchObject({ quantity: 0, held: 0, sum: 0 });
  });

  it("10 at 100, 10 at 200, sell 10, void the second purchase: stock and value both zero", () => {
    const r = run([["PURCHASE", 10, { unitCost: 100 }], ["PURCHASE", 10, { unitCost: 200 }], ["SALE", -10], ["PURCHASE_VOID", -10, { value: -2000 }]]);
    expect(r).toMatchObject({ quantity: 0, held: 0, sum: 0 });
  });

  it("1 000 sachets for 12 500: the stock is worth 12 500 (not 13 000); sold one by one it ends at zero", () => {
    let r = run([["PURCHASE", 1000, { value: 12500 }]]);
    expect(r).toMatchObject({ held: 12500, costPrice: 13 });
    const moves = [["PURCHASE", 1000, { value: 12500 }], ...Array.from({ length: 1000 }, () => ["SALE", -1])];
    r = run(moves);
    expect(r).toMatchObject({ quantity: 0, held: 0, sum: 0 });
  });

  it("a void never takes more value than is held; a count that finds more adds at the average", () => {
    const r = run([["PURCHASE", 10, { value: 1000 }], ["SALE", -5], ["PURCHASE_VOID", -2, { value: -900 }]]);
    expect(r.held).toBe(0 + 500 - 500); // 500 held, the void takes at most 500
    const c = run([["PURCHASE", 4, { value: 1000 }], ["COUNT", 1]]);
    expect(c).toMatchObject({ quantity: 5, held: 1250, costPrice: 250 });
  });

  it("the VAT deducted is shared across the lines, the last takes the remainder", () => {
    const lines = shareVat([{ total: 59625, quantity: 10 }, { total: 59625, quantity: 3 }], 19250, 119250);
    expect(lines.map((l) => l.cost)).toEqual([50000, 50000]);
    expect(lines.reduce((s, l) => s + (l.total - l.cost), 0)).toBe(19250);
    expect(lines[0].unitCost).toBe(5000);
  });
});
