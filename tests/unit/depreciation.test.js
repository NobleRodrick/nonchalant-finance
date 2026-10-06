import { describe, expect, it } from "vitest";
import { accumulatedAfter, addMonths, assetValue, depreciationBetween, disposalResult, monthsBetween, schedule } from "@/lib/assets/depreciation";

const chairs = { cost: 1500000, salvageValue: 0, usefulLifeMonths: 60, method: "STRAIGHT_LINE", purchaseDate: "2026-01-15" };

describe("depreciation", () => {
  it("whole months from the purchase date", () => {
    expect(monthsBetween("2026-01-15", "2026-02-14")).toBe(0);
    expect(monthsBetween("2026-01-15", "2026-02-15")).toBe(1);
    expect(monthsBetween("2026-01-31", "2026-03-01")).toBe(1);
    expect(monthsBetween("2026-05-01", "2026-01-01")).toBe(0);
    expect(addMonths("2026-01-31", 1)).toBe("2026-02-28");
  });

  it("straight-line: 100 chairs at 15 000 over 5 years = 25 000 a month", () => {
    const s = schedule(chairs);
    expect(s).toHaveLength(60);
    expect(s[0]).toBe(25000);
    expect(s.reduce((a, b) => a + b, 0)).toBe(1500000);
    expect(assetValue(chairs, "2026-07-15")).toMatchObject({ months: 6, monthly: 25000, accumulated: 150000, bookValue: 1350000, remainingMonths: 54, fullyDepreciated: false });
    expect(assetValue(chairs, "2031-06-01")).toMatchObject({ accumulated: 1500000, bookValue: 0, monthly: 0, fullyDepreciated: true });
  });

  it("the last month absorbs rounding; salvage value is never depreciated", () => {
    const a = { cost: 1000, salvageValue: 100, usefulLifeMonths: 7, method: "STRAIGHT_LINE" };
    const s = schedule(a);
    expect(s.reduce((x, y) => x + y, 0)).toBe(900);
    expect(s.slice(0, 6).every((v) => v === 128)).toBe(true);
    expect(s[6]).toBe(132);
  });

  it("declining balance: more at first, then less; ends exactly at the salvage value", () => {
    const a = { cost: 1200000, salvageValue: 200000, usefulLifeMonths: 36, method: "DECLINING_BALANCE" };
    const s = schedule(a);
    expect(s[0]).toBe(Math.round(1200000 * (2 / 36)));
    expect(s[0]).toBeGreaterThan(s[20]);
    expect(s.reduce((x, y) => x + y, 0)).toBe(1000000);
    expect(s.every((v) => v >= 0)).toBe(true);
    expect(accumulatedAfter(a, 36)).toBe(1000000);
  });

  it("depreciation of a period, and disposal stops it with a gain or a loss", () => {
    expect(depreciationBetween(chairs, "2026-02-01", "2026-02-28")).toBe(25000);
    expect(depreciationBetween(chairs, "2026-01-01", "2026-12-31")).toBe(275000); // 11 months end in 2026
    const sold = { ...chairs, disposedOn: "2026-07-15", disposalValue: 1400000 };
    expect(assetValue(sold, "2027-01-01")).toMatchObject({ accumulated: 150000, bookValue: 1350000, monthly: 0 });
    expect(disposalResult(sold)).toBe(50000);
    expect(disposalResult({ ...sold, disposalValue: 0 })).toBe(-1350000);
  });
});
