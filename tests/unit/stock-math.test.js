import { describe, expect, it } from "vitest";
import { dayPositions, dayPositionsFromCurrent, valuePositions, movementDelta, minimumOpening } from "@/lib/restaurant/stock-math";

const D = (iso) => new Date(iso);
const start = D("2026-10-05T00:00:00+01:00");
const end = new Date(D("2026-10-06T00:00:00+01:00").getTime() - 1);
const dishes = [
  { id: "a", name: "Dish A", sellingPrice: 2000, costPrice: 0, isActive: true, currentQuantity: 12 },
  { id: "b", name: "Dish B", sellingPrice: 3000, costPrice: 1200, isActive: true, currentQuantity: 1 },
];
// Reference day (plan §10.4): A 20 +10 −15 −3 −1 +1(void) ; B 10, opening correction −1, −8.
const history = [
  { menuItemId: "a", type: "OPENING", quantity: 20, date: D("2026-10-04T09:00:00+01:00") },
  { menuItemId: "b", type: "OPENING", quantity: 10, date: D("2026-10-04T09:00:00+01:00") },
  { menuItemId: "b", type: "OPENING_CORRECTION", quantity: -1, date: start },
  { menuItemId: "a", type: "STOCK_ADDED", quantity: 10, date: D("2026-10-05T08:30:00+01:00") },
  { menuItemId: "a", type: "SOLD", quantity: 15, date: D("2026-10-05T11:00:00+01:00") },
  { menuItemId: "a", type: "SOLD", quantity: 3, date: D("2026-10-05T12:10:00+01:00") },
  { menuItemId: "b", type: "SOLD", quantity: 8, date: D("2026-10-05T13:00:00+01:00") },
  { menuItemId: "a", type: "SOLD", quantity: 1, date: D("2026-10-05T14:00:00+01:00") },
  { menuItemId: "a", type: "SOLD", quantity: -1, date: D("2026-10-05T14:00:00+01:00") },
];

describe("plate stock arithmetic", () => {
  it("computes Opening, Added, Sold and Closing for the reference day", () => {
    const [a, b] = dayPositions(dishes, history, start, end);
    expect(a).toMatchObject({ opening: 20, added: 10, sold: 18, spoiled: 0, corrected: 0, closing: 12 });
    expect(b).toMatchObject({ opening: 9, openingCorrection: -1, added: 0, sold: 8, closing: 1 });
  });

  it("the anchored computation (from current plates) gives the same result", () => {
    const since = history.filter((m) => m.date >= start);
    expect(dayPositionsFromCurrent(dishes, since, start, end)).toEqual(dayPositions(dishes, history, start, end));
  });

  it("values stock at the unit price and totals every column", () => {
    const v = valuePositions(dayPositions(dishes, history, start, end));
    expect(v.totals).toMatchObject({ opening: 29, added: 10, sold: 26, closing: 13, openingValue: 67000, value: 27000, soldValue: 60000 });
    expect(v.rows[1].costValue).toBe(1200);
    expect(v.rows[0].costValue).toBeNull();
    expect(v.showSpoiled).toBe(false);
    expect(v.showCorrected).toBe(false);
    expect(v.rows[1].lowStock).toBe(false);
  });

  it("next day's opening equals this day's closing", () => {
    const nextStart = new Date(end.getTime() + 1);
    const nextEnd = new Date(nextStart.getTime() + 86400000 - 1);
    const [a, b] = dayPositions(dishes, history, nextStart, nextEnd);
    expect([a.opening, b.opening]).toEqual([12, 1]);
  });

  it("an opening correction later in the day counts as a correction, not opening", () => {
    const m = [...history, { menuItemId: "b", type: "OPENING_CORRECTION", quantity: 2, date: D("2026-10-05T15:00:00+01:00") }];
    const [, b] = dayPositions(dishes, m, start, end);
    expect(b.opening).toBe(9);
    expect(b.corrected).toBe(2);
    expect(b.closing).toBe(3);
  });

  it("spoiled plates and corrections are separate columns", () => {
    const m = [...history, { menuItemId: "a", type: "SPOILED", quantity: 2, date: D("2026-10-05T20:00:00+01:00") }, { menuItemId: "a", type: "CORRECTION", quantity: 1, date: D("2026-10-05T21:00:00+01:00") }];
    const v = valuePositions(dayPositions(dishes, m, start, end));
    expect(v.rows[0]).toMatchObject({ spoiled: 2, corrected: 1, closing: 11 });
    expect(v.showSpoiled && v.showCorrected).toBe(true);
  });

  it("maps legacy movement types", () => {
    expect(movementDelta({ type: "PREPARATION", quantity: 5 })).toBe(5);
    expect(movementDelta({ type: "USAGE", quantity: 2 })).toBe(-2);
    expect(movementDelta({ type: "WASTE", quantity: -1 })).toBe(-1);
    expect(movementDelta({ type: "ADJUSTMENT", quantity: -3 })).toBe(-3);
    expect(movementDelta({ type: "REVERSAL", quantity: 2 })).toBe(2);
  });

  it("minimum opening keeps every later balance at zero or more", () => {
    expect(minimumOpening([{ type: "SOLD", quantity: 5 }, { type: "STOCK_ADDED", quantity: 10 }, { type: "SOLD", quantity: 12 }])).toBe(7);
    expect(minimumOpening([{ type: "STOCK_ADDED", quantity: 10 }])).toBe(0);
    expect(minimumOpening([])).toBe(0);
  });

  it("a dish created during the day has opening 0 and its opening plates as added", () => {
    const [n] = dayPositions([{ id: "n", name: "New", sellingPrice: 1000 }], [{ menuItemId: "n", type: "OPENING", quantity: 4, date: D("2026-10-05T10:00:00+01:00") }], start, end);
    expect(n).toMatchObject({ opening: 0, added: 4, closing: 4 });
  });
});
