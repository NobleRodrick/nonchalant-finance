import { describe, expect, it } from "vitest";
import { allowedTransitions, bookingFigures, calendarCounts, calendarDays, holdExpired } from "@/lib/venue/booking-math";
import { applyPendingBookings } from "@/lib/venue/overlay";
import { bookingCreateSpec, bookingMoveSpec, bookingStatusSpec } from "@/lib/venue/specs";

const pay = (amount, status = "COMPLETED") => ({ type: "BOOKING_PAYMENT", amount, status });
const refund = (amount) => ({ type: "BOOKING_REFUND", amount, status: "COMPLETED" });

describe("money of a booking", () => {
  it("total = agreed price + charges; paid = payments − refunds; balance and payment status", () => {
    expect(bookingFigures({ agreedPrice: 500000 })).toMatchObject({ total: 500000, paid: 0, balance: 500000, paymentStatus: "UNPAID" });
    expect(bookingFigures({ agreedPrice: 500000, money: [pay(200000)] })).toMatchObject({ paid: 200000, balance: 300000, paymentStatus: "PARTLY_PAID" });
    expect(bookingFigures({ agreedPrice: 500000, money: [pay(200000), pay(300000)] })).toMatchObject({ balance: 0, paymentStatus: "PAID" });
    expect(bookingFigures({ agreedPrice: 500000, charges: [{ amount: 40000 }, { amount: 10000, voidedAt: new Date() }], money: [pay(500000)] })).toMatchObject({ charges: 40000, total: 540000, balance: 40000, paymentStatus: "PARTLY_PAID" });
    expect(bookingFigures({ agreedPrice: 500000, money: [pay(600000)] })).toMatchObject({ balance: -100000, paymentStatus: "OVERPAID" });
    expect(bookingFigures({ agreedPrice: 500000, money: [pay(100000, "VOIDED")] })).toMatchObject({ paid: 0, paymentStatus: "UNPAID" });
  });
  it("a cancelled booking owes nothing more: kept money is its income; a full refund is refunded", () => {
    expect(bookingFigures({ agreedPrice: 500000, status: "CANCELLED", money: [pay(200000)] })).toMatchObject({ total: 200000, balance: 0, paymentStatus: "PAID" });
    expect(bookingFigures({ agreedPrice: 500000, status: "CANCELLED", money: [pay(200000), refund(200000)] })).toMatchObject({ total: 0, paid: 0, balance: 0, paymentStatus: "REFUNDED" });
  });
});

describe("calendar and hold", () => {
  const today = "2026-10-10";
  const bookings = [
    { id: "a", eventDateKey: "2026-10-11", status: "CONFIRMED" },
    { id: "b", eventDateKey: "2026-10-12", status: "CANCELLED" },
    { id: "c", eventDateKey: "2026-10-12", status: "RESERVED" },
    { id: "d", eventDateKey: "2026-10-05", status: "COMPLETED" },
  ];
  it("each date: available, reserved, confirmed, completed, past; cancelled bookings listed", () => {
    const days = calendarDays(["2026-10-05", "2026-10-06", "2026-10-11", "2026-10-12", "2026-10-13"], bookings, today);
    expect(days.map((d) => d.state)).toEqual(["COMPLETED", "PAST", "CONFIRMED", "RESERVED", "AVAILABLE"]);
    expect(days[3].cancelled.map((b) => b.id)).toEqual(["b"]);
    expect(calendarCounts(days)).toMatchObject({ AVAILABLE: 1, RESERVED: 1, CONFIRMED: 1, COMPLETED: 1, CANCELLED: 1, PAST: 1 });
  });
  it("a hold is over only for a reservation without money after its hold date", () => {
    expect(holdExpired({ status: "RESERVED", holdUntil: "2026-10-09", received: 0 }, today)).toBe(true);
    expect(holdExpired({ status: "RESERVED", holdUntil: "2026-10-10", received: 0 }, today)).toBe(false);
    expect(holdExpired({ status: "RESERVED", holdUntil: "2026-10-09", received: 1000 }, today)).toBe(false);
    expect(holdExpired({ status: "CONFIRMED", holdUntil: "2026-10-09" }, today)).toBe(false);
  });
  it("what a booking allows", () => {
    expect(allowedTransitions({ status: "RESERVED", eventDateKey: "2026-10-11" }, today)).toMatchObject({ confirm: true, complete: false, cancel: true });
    expect(allowedTransitions({ status: "CONFIRMED", eventDateKey: "2026-10-10" }, today)).toMatchObject({ confirm: false, complete: true });
    expect(allowedTransitions({ status: "COMPLETED", eventDateKey: "2026-10-01" }, today)).toMatchObject({ cancel: false, edit: false });
  });
});

describe("bookings recorded on this computer", () => {
  const op = (spec, i, extra = {}) => ({ ...spec, key: `k${i}`, seq: i, status: "pending", ...extra });
  it("a new booking appears with its price; later changes apply in order", () => {
    const create = op(bookingCreateSpec({ departmentId: "d", eventDateKey: "2026-12-12", eventType: "Wedding", client: { name: "Ngono" }, agreedPrice: 500000 }), 1);
    const rows = applyPendingBookings([], [create]);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ id: "local:bookingId:k1", referenceNo: "Not sent yet", status: "RESERVED", pending: true, figures: { total: 500000, balance: 500000 } });
    const move = op(bookingMoveSpec({ departmentId: "d", booking: rows[0], eventDateKey: "2026-12-19", reason: "Asked" }), 2);
    const cancel = op(bookingStatusSpec({ departmentId: "d", booking: rows[0], action: "cancel", reason: "No" }), 3);
    const after = applyPendingBookings([], [cancel, create, move]);
    expect(after[0]).toMatchObject({ eventDateKey: "2026-12-19", status: "CANCELLED", figures: { total: 0 } });
  });
  it("a server booking changed on this computer keeps its money figures", () => {
    const server = { id: "b1", referenceNo: "B-0001", status: "RESERVED", eventDateKey: "2026-12-12", agreedPrice: 500000, figures: bookingFigures({ agreedPrice: 500000, money: [pay(100000)] }) };
    const confirm = op(bookingStatusSpec({ departmentId: "d", booking: server, action: "confirm" }), 1);
    const [row] = applyPendingBookings([server], [confirm]);
    expect(row).toMatchObject({ status: "CONFIRMED", pending: true, figures: { paid: 100000, balance: 400000 } });
  });
});

describe("money recorded on this computer for a booking", () => {
  it("payments, refunds and charges change the balance at once", async () => {
    const { paymentSpec, refundSpec, chargeSpec } = await import("@/lib/venue/specs");
    const server = { id: "b1", referenceNo: "B-0001", status: "CONFIRMED", eventDateKey: "2026-12-12", agreedPrice: 500000, figures: bookingFigures({ agreedPrice: 500000 }) };
    const ops = [
      { ...paymentSpec({ departmentId: "d", booking: server, amount: 300000 }), key: "a", seq: 1, status: "pending" },
      { ...chargeSpec({ departmentId: "d", booking: server, label: "Extra hours", amount: 40000 }), key: "b", seq: 2, status: "pending" },
      { ...refundSpec({ departmentId: "d", booking: server, amount: 10000, reason: "x" }), key: "c", seq: 3, status: "pending" },
    ];
    const [row] = applyPendingBookings([server], ops);
    expect(row.figures).toMatchObject({ total: 540000, received: 300000, refunded: 10000, paid: 290000, balance: 250000, paymentStatus: "PARTLY_PAID" });
  });
});

describe("a payment receipt", () => {
  it("states what was paid up to it and the balance after it (charges dated after it excluded)", async () => {
    const { receiptOf } = await import("@/lib/venue/receipts");
    const booking = {
      agreedPrice: 600000,
      status: "CONFIRMED",
      transactions: [
        { id: "p1", type: "BOOKING_PAYMENT", amount: 200000, status: "COMPLETED", date: "2026-10-01T10:00:00Z" },
        { id: "p0", type: "BOOKING_PAYMENT", amount: 50000, status: "VOIDED", date: "2026-10-01T09:00:00Z" },
        { id: "p2", type: "BOOKING_PAYMENT", amount: 150000, status: "COMPLETED", date: "2026-10-03T10:00:00Z" },
        { id: "e1", type: "EXPENSE", amount: 9000, status: "COMPLETED", date: "2026-10-02T10:00:00Z" },
      ],
      charges: [{ amount: 50000, date: "2026-10-02T12:00:00Z" }],
    };
    expect(receiptOf(booking, "p1").figures).toMatchObject({ total: 600000, paid: 200000, balance: 400000 });
    expect(receiptOf(booking, "p2").figures).toMatchObject({ total: 650000, paid: 350000, balance: 300000 });
    expect(receiptOf(booking, "e1")).toBeNull();
  });
});
