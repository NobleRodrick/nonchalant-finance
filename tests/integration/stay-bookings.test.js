import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupStayOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { cancelStay, createStay, recordStayPayment, recordStayRefund, saveRoom, setRoomState, stepStay, updateStay } from "@/actions/rooms";
import { apartmentsNow, listStaysView, stayDetail, stayReceiptOf, stayViewCounts } from "@/lib/rooms/room-queries";
import { nightlyRevenue, stayRevenueBetween, suggestedPrice } from "@/lib/rooms/stay-math";

describe("stay pricing and nightly revenue (pure)", () => {
  const room = { nightlyRate: 30000, weeklyRate: 180000, monthlyRate: 600000 };
  it("suggests months, weeks and nights at their rates", () => {
    expect(suggestedPrice(room, 3, "NIGHT")).toBe(90000);
    expect(suggestedPrice(room, 10, "WEEK")).toBe(180000 + 3 * 30000);
    expect(suggestedPrice(room, 40, "MONTH")).toBe(600000 + 180000 + 3 * 30000);
    expect(suggestedPrice({ nightlyRate: 30000 }, 10, "WEEK")).toBe(300000);
  });
  it("spreads the price over the nights exactly; counts nights stayed in a period", () => {
    const nights = nightlyRevenue({ checkInKey: "2026-09-29", checkOutKey: "2026-10-02", totalPrice: 100000 });
    expect(nights).toEqual([{ dateKey: "2026-09-29", amount: 33334 }, { dateKey: "2026-09-30", amount: 33333 }, { dateKey: "2026-10-01", amount: 33333 }]);
    const stay = { checkInKey: "2026-09-29", checkOutKey: "2026-10-02", totalPrice: 100000, status: "CHECKED_OUT" };
    expect(stayRevenueBetween(stay, "2026-10-01", "2026-10-31")).toEqual({ revenue: 33333, nights: 1 });
    expect(stayRevenueBetween({ ...stay, status: "CONFIRMED" }, "2026-09-01", "2026-10-31").revenue).toBe(0);
    expect(stayRevenueBetween({ ...stay, complimentary: true }, "2026-09-01", "2026-10-31").revenue).toBe(0);
  });
});

describe.skipIf(!hasDb)("Executive Stay: apartments, bookings and payments", () => {
  let o;
  let a1;
  let a2;
  const t = today();
  const d = (n) => addDaysToKey(t, n);

  beforeAll(async () => {
    o = await setupStayOrganization("Bookings");
    await loginAs(o.head.id);
    a1 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 1", roomType: "2 bedrooms", capacity: 4, nightlyRate: 30000, weeklyRate: 180000, monthlyRate: 600000, description: "Balcony" })).roomId;
    a2 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 2", nightlyRate: 25000 })).roomId;
  });

  it("an apartment under maintenance cannot be booked; its state shows on its card", async () => {
    fails(await setRoomState({ departmentId: o.stay.id, roomId: a2, state: "MAINTENANCE" }), /Say why/);
    ok(await setRoomState({ departmentId: o.stay.id, roomId: a2, state: "MAINTENANCE", note: "Painting" }));
    fails(await createStay({ departmentId: o.stay.id, roomId: a2, checkInKey: d(1), checkOutKey: d(2), guestName: "X" }), /under maintenance \(Painting\)/);
    const cards = await apartmentsNow({ departmentId: o.stay.id, todayKey: t });
    expect(cards.find((r) => r.id === a2).displayState).toBe("MAINTENANCE");
    ok(await setRoomState({ departmentId: o.stay.id, roomId: a2, state: "AVAILABLE" }));
  });

  it("a booking takes the suggested price unless another price is given with a reason; no two bookings share a night", async () => {
    const b = ok(await createStay({ departmentId: o.stay.id, roomId: a1, checkInKey: d(0), checkOutKey: d(3), guestName: "Mr Kamga", guestPhone: "699", guestEmail: "k@x.cm", guestCount: 2 }));
    expect(b).toMatchObject({ nights: 3, totalPrice: 90000 });
    fails(await createStay({ departmentId: o.stay.id, roomId: a1, checkInKey: d(2), checkOutKey: d(4), guestName: "Other" }), /taken/);
    fails(await createStay({ departmentId: o.stay.id, roomId: a2, checkInKey: d(10), checkOutKey: d(17), guestName: "Mme Ndi", bookingType: "WEEK", totalPrice: 150000 }), /usual price is 175 000 FCFA/);
    const w = ok(await createStay({ departmentId: o.stay.id, roomId: a2, checkInKey: d(10), checkOutKey: d(17), guestName: "Mme Ndi", bookingType: "WEEK", totalPrice: 150000, priceNote: "Returning guest" }));
    expect(w.totalPrice).toBe(150000);
    // Six bookings of the same nights at the same moment: exactly one is saved.
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => createStay({ departmentId: o.stay.id, roomId: a2, checkInKey: d(20), checkOutKey: d(22), guestName: `Race ${i}` })));
    expect(results.filter((r) => r.success)).toHaveLength(1);
  });

  it("check-in from the arrival date, changes, early check-out with a new price", async () => {
    const s = await db.roomBooking.findFirst({ where: { departmentId: o.stay.id, guestName: "Mr Kamga" } });
    const w = await db.roomBooking.findFirst({ where: { departmentId: o.stay.id, guestName: "Mme Ndi" } });
    fails(await stepStay({ departmentId: o.stay.id, stayId: w.id, step: "checkin" }), /check in from that day/);
    ok(await stepStay({ departmentId: o.stay.id, stayId: s.id, step: "checkin" }));
    fails(await updateStay({ departmentId: o.stay.id, stayId: s.id, roomId: a2 }), /only the departure date/);
    fails(await updateStay({ departmentId: o.stay.id, stayId: s.id, totalPrice: 80000 }), /why the price changes/);
    ok(await updateStay({ departmentId: o.stay.id, stayId: s.id, totalPrice: 80000, priceNote: "Discount agreed", guestCount: 3 }));
    // Payments: not more than the balance; Mobile Money needs its reference; who received it is kept.
    fails(await recordStayPayment({ departmentId: o.stay.id, stayId: s.id, amount: 90000, idempotencyKey: key() }), /balance of RB-0001 is 80 000 FCFA/);
    fails(await recordStayPayment({ departmentId: o.stay.id, stayId: s.id, amount: 50000, paymentMethod: "MOMO", idempotencyKey: key() }), /transaction reference/);
    const p1 = ok(await recordStayPayment({ departmentId: o.stay.id, stayId: s.id, amount: 50000, receivedByName: "Aline", idempotencyKey: key() }));
    expect(p1).toMatchObject({ referenceNo: "RC-0001", balance: 30000, paymentStatus: "PARTLY_PAID" });
    ok(await recordStayPayment({ departmentId: o.stay.id, stayId: s.id, amount: 30000, paymentMethod: "MOMO", reference: "MP42", receivedByName: "Paul", idempotencyKey: key() }));
    // Leaving early (checked out on the arrival day: 1 night), price lowered: the guest paid too much → refund.
    ok(await stepStay({ departmentId: o.stay.id, stayId: s.id, step: "checkout", totalPrice: 30000, priceNote: "Left after one night" }));
    const after = await stayDetail({ departmentId: o.stay.id, stayId: s.id });
    expect(after).toMatchObject({ status: "CHECKED_OUT", checkOutKey: d(1), nights: 1, totalPrice: 30000 });
    expect(after.checkedInAt).toBeTruthy();
    expect(after.figures).toMatchObject({ total: 30000, paid: 80000, balance: -50000, paymentStatus: "OVERPAID" });
    fails(await recordStayRefund({ departmentId: o.stay.id, stayId: s.id, amount: 60000, reason: "x", idempotencyKey: key() }), /not cancelled and was not overpaid by more than 50 000/);
    ok(await recordStayRefund({ departmentId: o.stay.id, stayId: s.id, amount: 50000, reason: "Left early", idempotencyKey: key() }));
    const final = await stayDetail({ departmentId: o.stay.id, stayId: s.id });
    expect(final.figures).toMatchObject({ paid: 30000, balance: 0, paymentStatus: "PAID" });
    // The receipt of the first payment: what was owed and paid at that moment.
    const r = stayReceiptOf(final, final.transactions.find((x) => x.referenceNo === "RC-0001").id);
    expect(r.figures).toMatchObject({ paid: 50000 });
    expect(final.transactions.map((x) => [x.referenceNo, x.receivedByName, x.paymentMethod])).toEqual([["RC-0001", "Aline", "CASH"], ["RC-0002", "Paul", "MOMO"], ["RF-0001", "Stay head", "CASH"]]);
    // Payments name their apartment (for the revenue and cash of each apartment).
    expect(await db.transaction.count({ where: { stayId: s.id, roomId: a1 } })).toBe(3);
  });

  it("views: upcoming, current, completed, cancelled; a cancelled booking keeps what was paid until refunded", async () => {
    const w = await db.roomBooking.findFirst({ where: { departmentId: o.stay.id, guestName: "Mme Ndi" } });
    ok(await recordStayPayment({ departmentId: o.stay.id, stayId: w.id, amount: 50000, idempotencyKey: key() }));
    ok(await cancelStay({ departmentId: o.stay.id, stayId: w.id, reason: "Trip cancelled" }));
    fails(await recordStayPayment({ departmentId: o.stay.id, stayId: w.id, amount: 1000, idempotencyKey: key() }), /cancelled/);
    const c = await listStaysView({ departmentId: o.stay.id, view: "cancelled" });
    expect(c[0].figures).toMatchObject({ total: 50000, paid: 50000, balance: 0 });
    expect(await stayViewCounts(o.stay.id)).toEqual({ upcoming: 1, current: 0, completed: 1, cancelled: 1 });
    expect((await listStaysView({ departmentId: o.stay.id, view: "upcoming", q: "race" })).length).toBe(1);
  });

  it("another business sees nothing; the Boss cannot record", async () => {
    const other = await setupStayOrganization("Other");
    const s = await db.roomBooking.findFirst({ where: { departmentId: o.stay.id } });
    await loginAs(other.head.id);
    fails(await recordStayPayment({ departmentId: other.stay.id, stayId: s.id, amount: 1000, idempotencyKey: key() }), /not found/);
    expect(await stayDetail({ departmentId: other.stay.id, stayId: s.id })).toBeNull();
    await loginAs(o.boss.id);
    fails(await createStay({ departmentId: o.stay.id, roomId: a1, checkInKey: d(30), checkOutKey: d(31), guestName: "Boss" }), /role does not allow/);
  });
});
