import { describe, expect, it } from "vitest";
import { addMonths, dayOfMonth, monthsBetween, rateFor, rentSchedule, scheduleHorizon } from "@/lib/property/rent-schedule";
import { checkAllocation, leaseAccount, proposeAllocation } from "@/lib/property/account";
import { statusCounts, unitStatus } from "@/lib/property/unit-math";

describe("property rental: months and rates", () => {
  it("month arithmetic", () => {
    expect(addMonths("2026-11", 3)).toBe("2027-02");
    expect(addMonths("2026-01", -1)).toBe("2025-12");
    expect(monthsBetween("2026-01", "2027-03")).toBe(14);
    expect(dayOfMonth("2026-02", 31)).toBe("2026-02-28");
  });
  it("the price of a month is the latest rate from that month (history kept)", () => {
    const rates = [{ fromMonth: "2026-01", amount: 100000 }, { fromMonth: "2027-01", amount: 120000 }];
    expect(rateFor(rates, "2026-12", 90000)).toBe(100000);
    expect(rateFor(rates, "2027-01", 90000)).toBe(120000);
    expect(rateFor(rates, "2025-12", 90000)).toBe(90000);
  });
});

describe("property rental: rent schedule", () => {
  it("a mid-month start is prorated by days, then full months; due on the contract's day", () => {
    const s = rentSchedule({ startKey: "2026-11-16", rent: 150000, dueDay: 5, monthsPerBill: 1 }, "2027-01");
    expect(s.map((m) => [m.monthKey, m.amount, m.dueKey])).toEqual([
      ["2026-11", 75000, "2026-11-16"], // 15 of 30 days, never due before moving in
      ["2026-12", 150000, "2026-12-05"],
      ["2027-01", 150000, "2027-01-05"],
    ]);
    expect(s[0]).toMatchObject({ prorated: true, days: 15, daysInMonth: 30 });
  });
  it("a rent increase applies from its month; the old months keep the old price", () => {
    const s = rentSchedule({ startKey: "2026-11-01", rent: 100000, dueDay: 5, rates: [{ fromMonth: "2027-01", amount: 120000 }] }, "2027-02");
    expect(s.map((m) => m.amount)).toEqual([100000, 100000, 120000, 120000]);
  });
  it("quarterly billing: the three months of a block are due on its first due day", () => {
    const s = rentSchedule({ startKey: "2026-01-01", rent: 100000, dueDay: 10, monthsPerBill: 3 }, "2026-06");
    expect(s.map((m) => m.dueKey)).toEqual(["2026-01-10", "2026-01-10", "2026-01-10", "2026-04-10", "2026-04-10", "2026-04-10"]);
  });
  it("the move-out month is prorated and nothing is billed after it", () => {
    const s = rentSchedule({ startKey: "2026-01-01", moveOutKey: "2026-03-10", rent: 310000, dueDay: 5 }, "2026-12");
    expect(s.map((m) => [m.monthKey, m.amount])).toEqual([["2026-01", 310000], ["2026-02", 310000], ["2026-03", 100000]]);
  });
  it("the horizon covers the current block and stops at the move-out", () => {
    expect(scheduleHorizon({ startKey: "2026-01-01", monthsPerBill: 1 }, "2026-11-20", 1)).toBe("2026-12");
    expect(scheduleHorizon({ startKey: "2026-01-01", monthsPerBill: 12 }, "2026-11-20", 0)).toBe("2026-12");
    expect(scheduleHorizon({ startKey: "2026-01-01", moveOutKey: "2026-06-30" }, "2026-11-20", 2)).toBe("2026-06");
  });
});

describe("property rental: a tenant's account", () => {
  const schedule = rentSchedule({ startKey: "2026-01-01", rent: 100000, dueDay: 5 }, "2026-04");
  const charges = [
    { id: "e1", kind: "ELECTRICITY", label: "Electricity Feb 2026", monthKey: "2026-02", dueKey: "2026-03-05", amount: 25000 },
    { id: "w1", kind: "WATER", label: "Water Feb 2026", monthKey: "2026-02", dueKey: "2026-03-05", amount: 10000 },
    { id: "x", kind: "OTHER", label: "Voided", monthKey: "2026-02", dueKey: "2026-03-05", amount: 999, voidedAt: "2026-03-01" },
  ];

  it("three unpaid months stay separate debts: 300 000 owed, 3 months, days overdue from the oldest", () => {
    const a = leaseAccount({ schedule, charges: [], todayKey: "2026-03-20" });
    expect(a).toMatchObject({ outstanding: 300000, monthsOwed: 3, rentOutstanding: 300000, status: "OVERDUE", oldestDueKey: "2026-01-05", daysOverdue: 74 });
    expect(a.items.filter((i) => i.due).map((i) => i.balance)).toEqual([100000, 100000, 100000]);
  });

  it("rent, electricity and water owed are told apart; a voided charge counts for nothing", () => {
    const a = leaseAccount({ schedule, charges, allocations: [{ monthKey: "2026-01", amount: 100000 }, { monthKey: "2026-02", amount: 100000 }, { monthKey: "2026-03", amount: 60000 }], received: 260000, todayKey: "2026-03-20" });
    expect(a.byKind).toEqual({ RENT: 40000, ELECTRICITY: 25000, WATER: 10000 });
    expect(a).toMatchObject({ outstanding: 75000, monthsOwed: 1, utilitiesOutstanding: 35000 });
  });

  it("money not allocated is an advance that pays the oldest items first", () => {
    const a = leaseAccount({ schedule, charges: [], allocations: [{ monthKey: "2026-01", amount: 100000 }], received: 350000, todayKey: "2026-03-20" });
    expect(a.items.map((i) => [i.monthKey, i.paid, i.byCredit, i.balance])).toEqual([
      ["2026-01", 100000, 0, 0],
      ["2026-02", 0, 100000, 0],
      ["2026-03", 0, 100000, 0],
      ["2026-04", 0, 50000, 50000],
    ]);
    expect(a).toMatchObject({ outstanding: 0, status: "ADVANCE", paidAhead: 50000, credit: 0 });
  });

  it("a payment is proposed oldest first (rent before the utilities of the same month), the rest is an advance", () => {
    const a = leaseAccount({ schedule, charges, todayKey: "2026-03-20" });
    const p = proposeAllocation(a, 230000);
    expect(p.lines.map((l) => [l.key, l.amount])).toEqual([["rent:2026-01", 100000], ["rent:2026-02", 100000], ["rent:2026-03", 30000]]);
    const all = proposeAllocation(a, 600000);
    expect(all.lines.map((l) => l.key)).toEqual(["rent:2026-01", "rent:2026-02", "rent:2026-03", "charge:e1", "charge:w1", "rent:2026-04"]);
    expect(all.advance).toBe(600000 - 435000);
  });

  it("a split chosen by hand is checked against what is owed", () => {
    const a = leaseAccount({ schedule, charges, todayKey: "2026-03-20" });
    expect(checkAllocation(a, 50000, [{ chargeId: "e1", amount: 25000 }, { monthKey: "2026-03", amount: 20000 }])).toMatchObject({ advance: 5000 });
    expect(() => checkAllocation(a, 50000, [{ chargeId: "e1", amount: 30000 }])).toThrow(/only 25000/);
    expect(() => checkAllocation(a, 10000, [{ monthKey: "2026-01", amount: 20000 }])).toThrow(/more than the amount/);
    expect(() => checkAllocation(a, 10000, [{ monthKey: "2025-01", amount: 1000 }])).toThrow(/not on this contract/);
  });
});

describe("property rental: office status", () => {
  it("contracts decide occupied / reserved; otherwise the state set by managers", () => {
    expect(unitStatus({ state: "AVAILABLE" }, [{ status: "ACTIVE" }])).toBe("OCCUPIED");
    expect(unitStatus({ state: "MAINTENANCE" }, [{ status: "RESERVED" }])).toBe("RESERVED");
    expect(unitStatus({ state: "MAINTENANCE" }, [])).toBe("MAINTENANCE");
    const c = statusCounts([{ status: "OCCUPIED" }, { status: "OCCUPIED" }, { status: "AVAILABLE" }, { status: "AWAITING_HANDOVER" }]);
    expect(c).toMatchObject({ total: 4, OCCUPIED: 2, vacant: 2, occupancyRate: 50 });
  });
});
