import { describe, expect, it } from "vitest";
import { batchFigures as productionFigures, recipeCost, scaleRecipe } from "@/lib/production/production-math";
import { ageInDays, batchFigures, eventKindsFor } from "@/lib/farm/farm-math";
import { farmWarnings } from "@/lib/farm/alert-math";
import { membershipEndKey, membershipState, overlaps, renewalDue, renewalMessage } from "@/lib/salon/salon-math";
import { salonWarnings } from "@/lib/salon/salon-math";
import { stockGroup } from "@/lib/trade/stock-math";

describe("production arithmetic", () => {
  const recipe = { yieldQuantity: 120, lines: [{ materialId: "flour", quantity: 25 }, { materialId: "yeast", quantity: 0.5 }] };
  it("scales a recipe to a batch and costs it", () => {
    expect(scaleRecipe(recipe, 300)).toEqual([{ materialId: "flour", quantity: 62.5 }, { materialId: "yeast", quantity: 1.25 }]);
    expect(scaleRecipe(recipe, 0)).toEqual([]);
    const cost = { flour: 500, yeast: 3000 };
    expect(recipeCost(recipe, (id) => cost[id], 150)).toEqual({ cost: 14000, unitCost: 117, margin: 33, marginPct: 22 });
  });
  it("a batch's unit cost rises with waste", () => {
    expect(productionFigures({ materials: [{ quantity: 50, unitCost: 500 }, { quantity: 1, unitCost: 3000 }], planned: 200, produced: 190 })).toEqual({ totalCost: 28000, unitCost: 147, waste: 10, wastePct: 5 });
    expect(productionFigures({ materials: [], planned: 10, produced: 12 }).waste).toBe(0);
  });
  it("raw materials and finished products go to their own stock accounts", () => {
    expect(stockGroup("PRODUCTION", "RAW")).toBe("RAW");
    expect(stockGroup("PRODUCTION", "GOODS")).toBe("FINISHED");
    expect(stockGroup("FARM", "GOODS")).toBe("FINISHED");
    expect(stockGroup("SHOP", "GOODS")).toBe("GOODS");
  });
});

describe("farm arithmetic", () => {
  const band = { kind: "POULTRY", initialCount: 500 };
  const events = [
    { kind: "ADDITION", quantity: 20 },
    { kind: "MORTALITY", quantity: 12 },
    { kind: "MORTALITY", quantity: 100, voidedAt: "2026-10-01" },
    { kind: "FEED", quantity: 4, unit: "bag", value: 60000 },
    { kind: "PRODUCE", quantity: 30, unit: "tray" },
    { kind: "SALE", quantity: 50 },
    { kind: "WEIGHT", quantity: 1.8, unit: "kg", date: "2026-10-05" },
  ];
  const records = [{ type: "SALE", amount: 175000 }, { type: "EXPENSE", amount: 20000 }, { type: "SALE", amount: 9999, status: "VOIDED" }];
  it("alive, deaths, cost, profit, cost a head", () => {
    expect(batchFigures(band, events, records)).toMatchObject({ started: 520, alive: 458, dead: 12, soldAlive: 50, mortalityPct: 2.3, inputs: 60000, expenses: 20000, cost: 80000, sales: 175000, profit: 95000, costPerHead: Math.round(80000 / 508), lastWeight: { quantity: 1.8, unit: "kg" }, produce: { tray: 30 }, feed: { bag: 4 } });
  });
  it("crops have an area, no head count", () => {
    const f = batchFigures({ kind: "CROP", initialCount: 2 }, [{ kind: "SALE", quantity: 800 }, { kind: "PRODUCE", quantity: 1000, unit: "kg" }], [{ type: "SALE", amount: 160000 }]);
    expect(f).toMatchObject({ live: false, alive: null, soldAlive: 0, mortalityPct: null, costPerHead: null, profit: 160000 });
    expect(eventKindsFor("CROP")).not.toContain("WEIGHT");
    expect(ageInDays("2026-10-01", "2026-10-07")).toBe(6);
  });
  it("what needs attention: many deaths today, past the expected end, nothing recorded", () => {
    const b = (o) => ({ id: "x", name: "Band", referenceNo: "FB-1", status: "ACTIVE", unit: "birds", startKey: "2026-10-01", expectedEndKey: null, today: { deaths: 0 }, figures: { live: true, started: 500 }, ...o });
    const w = farmWarnings([b({ id: "a", today: { deaths: 15 } }), b({ id: "b", expectedEndKey: "2026-10-05" }), b({ id: "c" })], "2026-10-07", { a: "2026-10-07", b: "2026-10-07" });
    expect(w.map((x) => x.key)).toEqual(["deaths", "overdue", "quiet"]);
  });
});

describe("salon / gym arithmetic", () => {
  it("appointments overlap only when their times cross", () => {
    const a = { startAt: "2026-10-07T09:00:00Z", minutes: 60 };
    expect(overlaps(a, { startAt: "2026-10-07T09:30:00Z", minutes: 30 })).toBe(true);
    expect(overlaps(a, { startAt: "2026-10-07T10:00:00Z", minutes: 30 })).toBe(false);
  });
  it("membership states: active, not started, expired, used up, cancelled; renewal", () => {
    expect(membershipEndKey("2026-10-01", 30)).toBe("2026-10-30");
    expect(membershipState({ status: "ACTIVE", startKey: "2026-10-01", endKey: "2026-10-30" }, 4, "2026-10-07")).toMatchObject({ status: "ACTIVE", daysLeft: 24, usable: true });
    expect(membershipState({ status: "ACTIVE", startKey: "2026-11-01", endKey: "2026-11-30" }, 0, "2026-10-07").status).toBe("NOT_STARTED");
    expect(membershipState({ status: "ACTIVE", startKey: "2026-09-01", endKey: "2026-09-30" }, 0, "2026-10-07").status).toBe("EXPIRED");
    expect(membershipState({ status: "ACTIVE", startKey: "2026-10-01", endKey: null, sessionsTotal: 10 }, 10, "2026-10-07")).toMatchObject({ status: "USED_UP", sessionsLeft: 0 });
    expect(membershipState({ status: "CANCELLED", startKey: "2026-10-01" }, 0, "2026-10-07").usable).toBe(false);
    expect(renewalDue(membershipState({ status: "ACTIVE", startKey: "2026-10-01", endKey: "2026-10-10" }, 0, "2026-10-07"))).toBe(true);
    expect(renewalDue(membershipState({ status: "ACTIVE", startKey: "2026-10-01", sessionsTotal: 10 }, 9, "2026-10-07"))).toBe(true);
    expect(renewalDue(membershipState({ status: "ACTIVE", startKey: "2026-10-01", endKey: "2026-12-31" }, 0, "2026-10-07"))).toBe(false);
    expect(renewalMessage({ business: "Gym Bastos", customer: "Paul", plan: "1 month", endKey: "2026-10-30", sessionsLeft: null })).toMatch(/Paul, Gym Bastos: your 1 month membership — it ends on 2026-10-30/);
  });
  it("what needs attention: memberships to renew, appointments not marked", () => {
    const w = salonWarnings({ memberships: [{ id: "m", renew: true, customer: "Paul", plan: "1 month", endKey: "2026-10-10", state: { sessionsLeft: null } }], appointments: [{ id: "a", status: "BOOKED", startAt: "2026-10-07T08:00:00.000Z", time: "09:00", customer: "Ada" }], nowIso: "2026-10-07T12:00:00.000Z" });
    expect(w.map((x) => x.key)).toEqual(["renew", "late"]);
  });
});
