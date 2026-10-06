import { describe, expect, it } from "vitest";
import { rentSchedule } from "@/lib/property/rent-schedule";
import { chargeTotals, occupancyRate, performanceBy, propertyIncome, rentInPeriod } from "@/lib/property/report-math";
import { tenantStatement } from "@/lib/property/statement";
import { propertyWarnings } from "@/lib/property/alert-math";
import { reminderText, waNumber, whatsappLink } from "@/lib/property/reminder-text";
import { owingThreshold } from "@/lib/property/search-query";

describe("property rental: rent in a period", () => {
  const items = rentSchedule({ startKey: "2026-01-16", rent: 100000, dueDay: 5 }, "2026-03");
  it("a month counts whole in its month; a day counts its share; the first month is prorated", () => {
    expect(rentInPeriod(items, "2026-01-16", null, "2026-02-01", "2026-02-28")).toBe(100000);
    expect(rentInPeriod(items, "2026-01-16", null, "2026-01-01", "2026-01-31")).toBe(51613); // 16 of 31 days
    expect(rentInPeriod(items, "2026-01-16", null, "2026-03-10", "2026-03-10")).toBe(Math.round(100000 / 31));
    expect(rentInPeriod(items, "2026-01-16", null, "2026-01-01", "2026-03-31")).toBe(251613);
  });
  it("income statement: rent less forgiven, utilities and other charges apart, expenses, net", () => {
    const charges = chargeTotals([{ kind: "ELECTRICITY", amount: 25000 }, { kind: "WATER", amount: 10000 }, { kind: "DAMAGE", amount: 5000 }]);
    expect(charges).toMatchObject({ utilities: 35000, other: 5000 });
    expect(propertyIncome({ rent: 5000000, waived: 0, charges: { utilities: 800000, other: 0, byKind: {} }, otherIncome: 200000, expenses: 1000000 })).toMatchObject({ revenue: 6000000, net: 5000000 });
  });
  it("by building, office and tenant (an office's expense counts for its building)", () => {
    const by = performanceBy({ rows: [{ buildingId: "b1", unitId: "u1", unit: "A12", tenantId: "t1", tenant: "XYZ", rent: 150000, charges: 20000 }], expenses: [{ unitId: "u1", amount: 30000 }, { buildingId: "b1", amount: 10000 }, { amount: 5000 }], buildings: [{ id: "b1", name: "Place Étoilée" }], units: [{ id: "u1", name: "A12", buildingId: "b1", building: "Place Étoilée" }] });
    expect(by.buildings[0]).toMatchObject({ revenue: 170000, expenses: 40000, net: 130000 });
    expect(by.units[0]).toMatchObject({ revenue: 170000, expenses: 30000 });
    expect(by.tenants[0]).toMatchObject({ name: "XYZ", revenue: 170000, offices: "A12" });
    expect(by.generalExpenses).toBe(5000);
  });
  it("occupancy over a period: office-days let ÷ office-days", () => {
    expect(occupancyRate([{}, {}], [{ status: "ACTIVE", startKey: "2026-01-16" }], "2026-01-01", "2026-01-31")).toBe(25.8);
  });
});

describe("property rental: tenant statement", () => {
  it("opening + rent + utilities + other − payments = closing, line by line", () => {
    const items = [{ dueKey: "2026-01-05", label: "Rent Jan", kind: "RENT", amount: 100000 }, { dueKey: "2026-02-05", label: "Rent Feb", kind: "RENT", amount: 100000 }, { dueKey: "2026-02-05", label: "Electricity Jan", kind: "ELECTRICITY", amount: 25000 }];
    const credits = [{ dateKey: "2026-01-10", label: "Payment", kind: "PAYMENT", amount: 100000, referenceNo: "RC-0001" }, { dateKey: "2026-02-20", label: "Refund", kind: "REFUND", amount: 5000 }];
    const all = tenantStatement({ items, credits });
    expect(all).toMatchObject({ opening: 0, closing: 130000, totals: { rent: 200000, utilities: 25000, payments: 100000, refunds: 5000 } });
    const feb = tenantStatement({ items, credits, fromKey: "2026-02-01" });
    expect(feb.opening).toBe(0);
    expect(feb.lines.map((l) => l.balance)).toEqual([100000, 125000, 130000]);
  });
});

describe("property rental: alerts and reminders", () => {
  const lease = (o) => ({ id: o.id, status: "ACTIVE", client: { name: o.id }, unit: { name: "A1", building: { name: "Main Building" } }, expiring: false, deposit: { required: 0, received: 0, held: 0 }, account: { rentOutstanding: 0, utilitiesOutstanding: 0, overdue: 0, outstanding: 0, monthsOwed: 0, daysOverdue: 0, next: null }, ...o });
  it("overdue rent, unpaid utilities, expiring contracts, vacant offices, deposits, maintenance, inspections", () => {
    const w = propertyWarnings({
      todayKey: "2026-11-10",
      leases: [
        lease({ id: "a", account: { rentOutstanding: 200000, utilitiesOutstanding: 25000, overdue: 225000, outstanding: 225000, monthsOwed: 2, daysOverdue: 40, next: null } }),
        lease({ id: "b", expiring: true, endKey: "2026-12-01", account: { rentOutstanding: 0, utilitiesOutstanding: 0, overdue: 0, outstanding: 0, monthsOwed: 0, daysOverdue: 0, next: { dueKey: "2026-11-12", balance: 100000, label: "Rent Nov" } } }),
        lease({ id: "c", status: "ENDED", deposit: { required: 300000, received: 300000, held: 300000 } }),
      ],
      units: [{ id: "u", name: "B2", building: { name: "Place Étoilée" }, status: "AVAILABLE", listRent: 90000 }, { id: "v", name: "B3", building: { name: "Place Étoilée" }, status: "OCCUPIED", listRent: 1 }],
      maintenance: [{ id: "m", referenceNo: "MR-0001", unit: { name: "A1" }, title: "Leak", priority: "URGENT", status: "REPORTED" }],
      inspections: [{ id: "i", referenceNo: "IS-0001", unit: { name: "A1" }, scheduledKey: "2026-11-11" }],
      unvalidated: { count: 1, amount: 5000 },
    });
    expect(w.map((x) => x.key)).toEqual(["overdue-rent", "unpaid-utilities", "rent-due", "expiring", "vacant", "deposits", "maintenance", "inspections", "approvals"]);
    expect(w.find((x) => x.key === "maintenance").tone).toBe("bad");
    expect(w.find((x) => x.key === "vacant")).toMatchObject({ amount: 90000, count: 1 });
  });
  it("WhatsApp links use the Cameroon code; the message says what is owed by kind", () => {
    expect(waNumber("677 00 01 11")).toBe("237677000111");
    expect(waNumber("+237 677000111")).toBe("237677000111");
    expect(waNumber("12")).toBeNull();
    const text = reminderText({ business: "Rentals", tenant: "XYZ", office: "A12 · Place Étoilée", outstanding: 140000, byKind: { RENT: 100000, ELECTRICITY: 25000, WATER: 10000, OTHER: 5000 }, monthsOwed: 1 });
    expect(text).toMatch(/140 000 FCFA is due/);
    expect(text).toMatch(/Electricity: 25 000 FCFA/);
    expect(whatsappLink("677000111", "hi")).toBe("https://wa.me/237677000111?text=hi");
  });
  it("search: “owing more than 100000” lists the tenants who owe more", () => {
    expect(owingThreshold("owing more than 100000")).toBe(100000);
    expect(owingThreshold("tenants owing more than 100 000 FCFA")).toBe(100000);
    expect(owingThreshold("> 50000")).toBe(50000);
    expect(owingThreshold("XYZ")).toBeNull();
  });
});
