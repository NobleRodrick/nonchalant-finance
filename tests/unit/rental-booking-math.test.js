import { describe, expect, it } from "vitest";
import { availability, defaultRange, lineHolds, orderStage, orderTotals, shortages } from "@/lib/rental/booking-math";

const chairs = { id: "c", name: "Chairs", owned: 300, damaged: 0, inRepair: 0, missing: 0 };
const order = (id, from, to, q, status = "CONFIRMED", extra = {}) => ({ id, status, dispatchDateKey: from, returnDateKey: to, lines: [{ itemId: "c", quantity: q, ...extra }] });

describe("event rental bookings", () => {
  it("totals of the requirements' example", () => {
    const lines = [{ quantity: 200, unitPrice: 500 }, { quantity: 20, unitPrice: 5000 }, { quantity: 200, unitPrice: 200 }, { quantity: 10, unitPrice: 5000 }, { kind: "SERVICE", quantity: 1, unitPrice: 30000 }];
    expect(orderTotals(lines, 20000)).toEqual({ itemsTotal: 290000, servicesTotal: 30000, discount: 20000, agreedPrice: 300000 });
  });

  it("dispatch the day before and return the day after by default", () => {
    expect(defaultRange("2026-11-20")).toEqual({ dispatchDateKey: "2026-11-19", returnDateKey: "2026-11-21" });
  });

  it("availability counts every booking overlapping the days (dispatch to return)", () => {
    const orders = [order("a", "2026-11-19", "2026-11-21", 200), order("b", "2026-11-21", "2026-11-23", 50), order("c", "2026-11-25", "2026-11-26", 300), order("d", "2026-11-19", "2026-11-21", 99, "INQUIRY")];
    expect(availability([chairs], orders, "2026-11-20", "2026-11-20").c).toMatchObject({ reserved: 200, available: 100, busiestDay: "2026-11-20" });
    expect(availability([chairs], orders, "2026-11-19", "2026-11-23").c).toMatchObject({ reserved: 250, available: 50, busiestDay: "2026-11-21" });
    expect(availability([chairs], orders, "2026-11-24", "2026-11-24").c).toMatchObject({ reserved: 0, available: 300 });
  });

  it("damaged, in repair and missing units cannot be booked; dispatched lines hold what is still out", () => {
    const tired = { ...chairs, damaged: 15, inRepair: 3, missing: 2 };
    expect(availability([tired], [], "2026-11-20", "2026-11-20").c.available).toBe(280);
    expect(lineHolds({ quantity: 200, issued: 200, returned: 150, damaged: 3, missing: 2 }, "DISPATCHED")).toBe(45);
    const late = order("x", "2026-11-01", "2026-11-03", 100, "DISPATCHED", { issued: 100 });
    // Not back after its return date: still held until today.
    expect(availability([chairs], [late], "2026-11-05", "2026-11-05", "2026-11-05").c.reserved).toBe(100);
    expect(availability([chairs], [late], "2026-11-06", "2026-11-06", "2026-11-05").c.reserved).toBe(0);
  });

  it("the message of a shortage", () => {
    const avail = availability([chairs], [order("a", "2026-11-19", "2026-11-21", 200)], "2026-11-19", "2026-11-21", null, "2026-11-20");
    const s = shortages([{ itemId: "c", quantity: 100 }, { itemId: "c", quantity: 50 }], avail, [chairs], () => "20 Nov 2026");
    expect(s).toEqual([{ itemId: "c", name: "Chairs", requested: 150, available: 100, day: "2026-11-20", message: "Insufficient chairs available for 20 Nov 2026. Only 100 chairs are available." }]);
    expect(shortages([{ itemId: "c", quantity: 100 }], avail, [chairs])).toEqual([]);
  });

  it("the stage shown: deposit paid, event completed, fully paid are computed", () => {
    expect(orderStage({ status: "CONFIRMED", eventDateKey: "2026-11-20" }, { paid: 0 }).label).toBe("Booking confirmed");
    expect(orderStage({ status: "CONFIRMED", eventDateKey: "2026-11-20" }, { paid: 100000, balance: 190000 }).label).toBe("Deposit paid");
    expect(orderStage({ status: "DISPATCHED", eventDateKey: "2026-11-20" }, {}, "2026-11-21").label).toBe("Event completed");
    expect(orderStage({ status: "DISPATCHED", eventDateKey: "2026-11-20" }, {}, "2026-11-20").label).toBe("Items dispatched");
    expect(orderStage({ status: "RETURNED", eventDateKey: "2026-11-20" }, { total: 290000, balance: 0 }).label).toBe("Fully paid");
    expect(orderStage({ status: "RETURNED", eventDateKey: "2026-11-20" }, { total: 290000, balance: 10 }).label).toBe("Items returned");
    expect(orderStage({ status: "QUOTED" }).label).toBe("Quotation sent");
  });
});
