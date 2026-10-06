import { describe, expect, it } from "vitest";
import {
  availableDates, bestPeriods, cashVerification, eventProfitability, outstandingBalances, revenueByMonth, revenueByWeekday, venueCashFlow, venueIncomeStatement,
} from "@/lib/venue/report-math";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";

const money = { otherIncome: 25000, expenses: 30000, otherExpenses: 5000, bookingPayments: 800000, bookingRefunds: 40000, receivedByMethod: { CASH: 500000, MOMO: 300000, BANK_TRANSFER: 25000 }, cash: { in: 525000, out: 75000 } };

describe("venue report math", () => {
  it("event profitability: revenue = price + charges; profit = revenue − expenses − losses; best first", () => {
    const rows = eventProfitability([
      { id: "a", eventDateKey: "2026-10-03", agreedPrice: 500000, charges: 40000, expenses: 30000, losses: 16000 },
      { id: "b", eventDateKey: "2026-10-10", agreedPrice: 800000, charges: 0, expenses: 0, losses: 0 },
      { id: "c", eventDateKey: "2026-10-11", agreedPrice: 0, charges: 0, expenses: 10000, losses: 0 },
    ]);
    expect(rows.map((r) => [r.id, r.revenue, r.profit, r.margin])).toEqual([["b", 800000, 800000, 100], ["a", 540000, 494000, 91.5], ["c", 0, -10000, null]]);
  });

  it("income statement: events + kept cancellations (never negative) + other income − costs", () => {
    const s = venueIncomeStatement({ events: [{ revenue: 540000 }], cancellations: [{ kept: 60000 }, { kept: -5000 }], money, losses: 16000 });
    expect(s).toMatchObject({ eventsRevenue: 540000, cancellationIncome: 60000, revenue: 625000, costs: 51000, result: 574000, margin: 91.8 });
    expect(venueIncomeStatement({ money: {} })).toMatchObject({ revenue: 0, result: 0, margin: null });
  });

  it("cash flow: only recorded/confirmed handovers leave the drawer; disputed ones are shown apart", () => {
    const cf = venueCashFlow({ opening: 10000, money, handovers: [{ amount: 100000, status: "CONFIRMED" }, { amount: 50000, status: "RECORDED" }, { amount: 7000, status: "DISPUTED" }] });
    expect(cf).toMatchObject({ received: 825000, paidOut: 75000, net: 750000, handedOver: 150000, handoverConfirmed: 100000, handoverPending: 50000, disputed: 7000, closingCash: 10000 + 525000 - 75000 - 150000 });
    const v = cashVerification({ receipts: [{ receivedBy: "Aline", method: "CASH", amount: 300000 }, { receivedBy: null, method: "MOMO", amount: 5000 }, { receivedBy: "Aline", method: "MOMO", amount: 1000 }], counts: [{ variance: -5000 }, { variance: 2000 }], cashFlow: cf, drawerNow: { shouldRemain: -3 } });
    expect(v.byPerson).toEqual([
      { receivedBy: "Aline", CASH: 300000, MOMO: 1000, BANK_TRANSFER: 0, OTHER: 0, total: 301000, count: 2 },
      { receivedBy: "Unknown", CASH: 0, MOMO: 5000, BANK_TRANSFER: 0, OTHER: 0, total: 5000, count: 1 },
    ]);
    expect(v).toMatchObject({ countVariance: -3000, discrepancies: 3000 + 7000, toHandOver: 0 });
  });

  it("by month, by weekday (Monday first) and the best periods", () => {
    const rows = [{ eventDateKey: "2026-10-03", revenue: 500000, profit: 450000 }, { eventDateKey: "2026-10-10", revenue: 300000, profit: 300000 }, { eventDateKey: "2026-09-06", revenue: 200000, profit: 150000 }, { eventDateKey: "2025-01-01", revenue: 1, profit: 1 }];
    const m = revenueByMonth(rows, ["2026-09", "2026-10"]);
    expect(m).toEqual([{ monthKey: "2026-09", revenue: 200000, profit: 150000, events: 1 }, { monthKey: "2026-10", revenue: 800000, profit: 750000, events: 2 }]);
    const w = revenueByWeekday(rows);
    expect(w[0].label).toBe("Monday");
    expect(w.find((x) => x.label === "Saturday")).toMatchObject({ revenue: 800000, events: 2, average: 400000 });
    const best = bestPeriods(m, w, 1);
    expect(best.months[0].monthKey).toBe("2026-10");
    expect(best.weekdays[0].label).toBe("Saturday");
  });

  it("balances owed and free dates", () => {
    const o = outstandingBalances([
      { status: "CONFIRMED", figures: { balance: 400000, paid: 200000 } },
      { status: "COMPLETED", figures: { balance: 50000, paid: 500000 } },
      { status: "RESERVED", figures: { balance: 0, paid: 0 } },
    ]);
    expect(o.rows.map((r) => r.figures.balance)).toEqual([400000, 50000]);
    expect(o).toMatchObject({ total: 450000, advances: 200000 });
    expect(availableDates(["2026-10-02", "2026-10-31", "2026-11-05"], "2026-10-02", 30)).toBe(28); // 2 Oct – 31 Oct: both ends held
  });
});

describe("report periods", () => {
  it("resolves presets and custom ranges (swapped if needed)", () => {
    const t = "2026-10-02"; // a Friday
    expect(resolvePeriod({}, t, "today")).toEqual({ preset: "today", fromKey: t, toKey: t });
    expect(resolvePeriod({ period: "week" }, t)).toMatchObject({ fromKey: "2026-09-28", toKey: "2026-10-04" });
    expect(resolvePeriod({ period: "month" }, t)).toMatchObject({ fromKey: "2026-10-01", toKey: "2026-10-31" });
    expect(resolvePeriod({ period: "last-month" }, t)).toMatchObject({ fromKey: "2026-09-01", toKey: "2026-09-30" });
    expect(resolvePeriod({ period: "custom", from: "2026-10-09", to: "2026-10-01" }, t)).toEqual({ preset: "custom", fromKey: "2026-10-01", toKey: "2026-10-09" });
    expect(resolvePeriod({ period: "custom", from: "bad" }, t).preset).toBe("month");
    expect(resolvePeriod({ period: "nope" }, t).preset).toBe("month");
    expect(periodLabel({ fromKey: t, toKey: t })).toBe("Fri, 02 Oct 2026");
  });
});

describe("expense and revenue reports", () => {
  it("groups expenses by category (voided and income left out) and revenue by type of event", async () => {
    const { expensesByCategory, revenueByEventType } = await import("@/lib/venue/report-math");
    const rows = expensesByCategory([
      { type: "EXPENSE", amount: 30000, category: "venue-decoration", bookingId: "a", status: "VALID" },
      { type: "EXPENSE", amount: 10000, category: "opex-electricity", status: "VALID" },
      { type: "OTHER_EXPENSE", amount: 5000, category: "venue-decoration", status: "VALID" },
      { type: "EXPENSE", amount: 99999, category: "opex-electricity", status: "VOIDED" },
      { type: "OTHER_INCOME", amount: 25000, category: "x", status: "VALID" },
    ]);
    expect(rows.map((r) => [r.category, r.amount, r.forEvents, r.count])).toEqual([["venue-decoration", 35000, 30000, 2], ["opex-electricity", 10000, 0, 1]]);
    expect(revenueByEventType([{ eventType: "Wedding", revenue: 500000, profit: 450000 }, { eventType: "Wedding", revenue: 300000, profit: 300000 }, { eventType: "Gala", revenue: 900000, profit: 800000 }])).toEqual([
      { eventType: "Gala", events: 1, revenue: 900000, profit: 800000, average: 900000 },
      { eventType: "Wedding", events: 2, revenue: 800000, profit: 750000, average: 400000 },
    ]);
  });
});
