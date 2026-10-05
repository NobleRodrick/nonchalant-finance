import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupVenueOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { addBookingCharge, cancelBooking, createBooking, recordBookingPayment, recordBookingRefund, saveHall, voidBookingCharge } from "@/actions/venue";
import { recordMoney, voidRecord } from "@/actions/money";
import { recordHandover } from "@/actions/handovers";
import { bookingDetail } from "@/lib/venue/booking-queries";
import { drawerNow } from "@/lib/finance/posting-service";

describe.skipIf(!hasDb)("event venue: payments, refunds, charges and cash", () => {
  let o;
  let booking;
  const d = (n) => addDaysToKey(today(), n);
  const figures = async (id = booking.bookingId) => (await bookingDetail({ departmentId: o.venue.id, bookingId: id, todayKey: today() })).figures;

  beforeAll(async () => {
    o = await setupVenueOrganization("Payments");
    await loginAs(o.head.id);
    ok(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 500000 }));
    booking = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(20), eventType: "Wedding", client: { name: "Ngono", phone: "1" } }));
  });

  it("records payments with receipts RC-…, who received them and how; the balance follows", async () => {
    const p1 = ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 200000, paymentMethod: "CASH", receivedByName: "Aline", idempotencyKey: key() }));
    expect(p1).toMatchObject({ referenceNo: "RC-0001", balance: 300000, paymentStatus: "PARTLY_PAID" });
    fails(await recordBookingPayment({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 100000, paymentMethod: "MOMO", idempotencyKey: key() }), /transaction reference/);
    const p2 = ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 100000, paymentMethod: "MOMO", reference: "MP2610.1234", idempotencyKey: key() }));
    expect(p2.referenceNo).toBe("RC-0002");
    const t = await db.transaction.findUnique({ where: { id: p1.transactionId } });
    expect(t).toMatchObject({ type: "BOOKING_PAYMENT", receivedByName: "Aline", bookingId: booking.bookingId, customerName: "Ngono" });
    expect(await figures()).toMatchObject({ paid: 300000, balance: 200000 });
  });

  it("refuses more than the balance unless it is an overpayment; the same payment sent twice counts once", async () => {
    fails(await recordBookingPayment({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 250000, idempotencyKey: key() }), /balance of B-0001 is 200 000 FCFA/);
    const k = key();
    ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 250000, overpay: true, idempotencyKey: k }));
    const again = ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 250000, overpay: true, idempotencyKey: k }));
    expect(again.duplicate).toBe(true);
    expect(await figures()).toMatchObject({ paid: 550000, balance: -50000, paymentStatus: "OVERPAID" });
  });

  it("refunds: only what was paid too much while the booking stands; a reason is required", async () => {
    fails(await recordBookingRefund({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 60000, reason: "Overpaid", idempotencyKey: key() }), /not cancelled and was not overpaid by more than 50 000/);
    fails(await recordBookingRefund({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 50000, idempotencyKey: key() }), /why the money is given back/);
    const r = ok(await recordBookingRefund({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 50000, reason: "Paid too much", idempotencyKey: key() }));
    expect(r.referenceNo).toBe("RF-0001");
    expect(await figures()).toMatchObject({ paid: 500000, balance: 0, paymentStatus: "PAID" });
  });

  it("charges add to what the client owes; a removed charge does not count", async () => {
    const c = ok(await addBookingCharge({ departmentId: o.venue.id, bookingId: booking.bookingId, kind: "EXTRA_SERVICE", label: "Two extra hours", amount: 40000 }));
    expect(c.referenceNo).toBe("CH-0001");
    expect(await figures()).toMatchObject({ charges: 40000, total: 540000, balance: 40000 });
    fails(await voidBookingCharge({ departmentId: o.venue.id, chargeId: c.chargeId }), /why the charge is removed/);
    ok(await voidBookingCharge({ departmentId: o.venue.id, chargeId: c.chargeId, reason: "Not used" }));
    expect(await figures()).toMatchObject({ charges: 0, balance: 0 });
  });

  it("a voided payment no longer counts; a cancelled booking takes no payment and refunds what was paid", async () => {
    const b = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(30), eventType: "Party", client: { name: "Mbarga", phone: "2" } }));
    const p = ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: b.bookingId, amount: 100000, idempotencyKey: key() }));
    ok(await voidRecord({ departmentId: o.venue.id, transactionId: p.transactionId, reason: "Entered twice" }));
    expect(await figures(b.bookingId)).toMatchObject({ paid: 0, paymentStatus: "UNPAID" });
    ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: b.bookingId, amount: 150000, idempotencyKey: key() }));
    ok(await cancelBooking({ departmentId: o.venue.id, bookingId: b.bookingId, reason: "Cancelled by client" }));
    fails(await recordBookingPayment({ departmentId: o.venue.id, bookingId: b.bookingId, amount: 1000, idempotencyKey: key() }), /cancelled/);
    // Kept: the money is the cancellation's income; partly refunded.
    expect(await figures(b.bookingId)).toMatchObject({ total: 150000, balance: 0 });
    fails(await recordBookingRefund({ departmentId: o.venue.id, bookingId: b.bookingId, amount: 200000, reason: "x", idempotencyKey: key() }), /Only 150 000 FCFA was paid/);
    ok(await recordBookingRefund({ departmentId: o.venue.id, bookingId: b.bookingId, amount: 100000, reason: "Cancellation, half refunded", idempotencyKey: key() }));
    expect(await figures(b.bookingId)).toMatchObject({ received: 150000, refunded: 100000, paid: 50000, total: 50000, balance: 0 });
  });

  it("cash payments fill the drawer; the head hands the cash to the Boss (never more than the drawer holds)", async () => {
    const drawer = await drawerNow(db, { organizationId: o.org.id, departmentId: o.venue.id });
    // Cash in: 200 000 + 250 000 + 150 000 (the voided 100 000 does not count); cash out: refunds 50 000 + 100 000.
    expect(drawer.cashIn).toBe(600000);
    expect(drawer.cashOut).toBe(150000);
    expect(drawer.electronic.MOMO).toBe(100000);
    fails(await recordHandover({ departmentId: o.venue.id, amount: drawer.shouldRemain + 1, idempotencyKey: key() }), /cannot hand over more/);
    const h = ok(await recordHandover({ departmentId: o.venue.id, amount: 400000, idempotencyKey: key() }));
    expect(h.referenceNo).toMatch(/^H-/);
    expect((await drawerNow(db, { organizationId: o.org.id, departmentId: o.venue.id })).shouldRemain).toBe(50000);
  });

  it("event expenses name their booking and use the venue's categories", async () => {
    const e = ok(await recordMoney({ departmentId: o.venue.id, type: "EXPENSE", amount: 30000, category: "venue-decoration", bookingId: booking.bookingId, idempotencyKey: key() }));
    expect((await db.transaction.findUnique({ where: { id: e.transactionId } })).bookingId).toBe(booking.bookingId);
    fails(await recordMoney({ departmentId: o.venue.id, type: "EXPENSE", amount: 1000, category: "opex-gas", idempotencyKey: key() }), /Choose a category/);
    fails(await recordMoney({ departmentId: o.venue.id, type: "RENT_INCOME", amount: 1000, category: "rent-room", idempotencyKey: key() }), /not used in event venue/);
    await loginAs(o.restHead.id);
    fails(await recordMoney({ departmentId: o.restaurant.id, type: "EXPENSE", amount: 1000, category: "venue-decoration", idempotencyKey: key() }), /Choose a category/);
    fails(await recordMoney({ departmentId: o.restaurant.id, type: "EXPENSE", amount: 1000, category: "opex-other", bookingId: booking.bookingId, idempotencyKey: key() }), /Booking not found in this department/);
  });

  it("the Boss cannot receive payments; another organization cannot see the booking", async () => {
    await loginAs(o.boss.id);
    fails(await recordBookingPayment({ departmentId: o.venue.id, bookingId: booking.bookingId, amount: 1000, idempotencyKey: key() }), /role does not allow/);
    const other = await setupVenueOrganization("Other");
    await loginAs(other.head.id);
    fails(await recordBookingPayment({ departmentId: other.venue.id, bookingId: booking.bookingId, amount: 1000, idempotencyKey: key() }), /Booking not found/);
  });
});
