import { describe, expect, it } from "vitest";
import { priceForDate, describeRule } from "@/lib/venue/pricing";
import { dateKeyOf, dbDate, monthBounds, shiftMonth, weekdayOf } from "@/lib/venue/dates";
import { departmentNavigation, moduleForSegment } from "@/lib/domains/registry";

const hall = {
  basePrice: 300000,
  rules: [
    { kind: "WEEKDAY", weekday: 6, price: 500000 }, // Saturdays
    { kind: "WEEKDAY", weekday: 0, price: 450000, isActive: false }, // inactive Sunday price
    { kind: "SEASON", startKey: "2026-12-01", endKey: "2027-01-15", price: 600000, label: "Festive season" },
    { kind: "SEASON", startKey: "2026-12-20", endKey: "2026-12-31", price: 700000, label: "Christmas week" },
    { kind: "SPECIAL_DATE", startKey: "2026-12-31", price: 1200000, label: "New Year's Eve" },
  ],
};

describe("venue dates", () => {
  it("handles calendar dates without time-zone shifts", () => {
    expect(weekdayOf("2026-10-03")).toBe(6); // a Saturday
    expect(dateKeyOf(dbDate("2026-12-31"))).toBe("2026-12-31");
    expect(monthBounds("2026-02-10")).toEqual(["2026-02-01", "2026-02-28"]);
    expect(monthBounds("2028-02-10")).toEqual(["2028-02-01", "2028-02-29"]);
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
  });
});

describe("price of a date", () => {
  it("special date > season (shortest wins) > day of the week > base price", () => {
    expect(priceForDate("2026-12-31", hall)).toMatchObject({ price: 1200000, source: "SPECIAL_DATE" });
    expect(priceForDate("2026-12-26", hall)).toMatchObject({ price: 700000, source: "SEASON", label: "Christmas week" });
    expect(priceForDate("2026-12-05", hall)).toMatchObject({ price: 600000, source: "SEASON", label: "Festive season" }); // a Saturday in the season
    expect(priceForDate("2026-10-03", hall)).toMatchObject({ price: 500000, source: "WEEKDAY" });
    expect(priceForDate("2026-10-04", hall)).toMatchObject({ price: 300000, source: "BASE" }); // inactive Sunday rule ignored
    expect(priceForDate("2026-10-05", { basePrice: 0 })).toMatchObject({ price: 0, source: "BASE" });
  });
  it("reads rules as stored (DATE values) and describes them", () => {
    const stored = { kind: "SEASON", startDate: dbDate("2027-07-01"), endDate: dbDate("2027-08-31"), price: 400000, label: "Summer" };
    expect(priceForDate("2027-07-15", { basePrice: 1, rules: [stored] })).toMatchObject({ price: 400000 });
    expect(describeRule({ kind: "WEEKDAY", weekday: 5 })).toBe("Fridays");
    expect(describeRule(stored)).toBe("1 Jul 2027 – 31 Aug 2027");
  });
});

describe("event venue navigation", () => {
  it("has its own sections; a restaurant page does not exist in a venue", () => {
    const venue = { id: "v1", domain: "EVENT_VENUE" };
    expect(departmentNavigation(venue, "HEAD").map((n) => n.id)).toContain("venue-settings");
    expect(departmentNavigation(venue, "HEAD")[0]).toMatchObject({ label: "Dashboard", href: "/d/v1" });
    expect(moduleForSegment("EVENT_VENUE", "hall")?.key).toBe("venue-settings");
    expect(moduleForSegment("EVENT_VENUE", "sell")).toBeNull();
    expect(moduleForSegment("RESTAURANT", "sell")?.key).toBe("sell");
  });
});
