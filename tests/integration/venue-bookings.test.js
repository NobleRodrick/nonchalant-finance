import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupVenueOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import {
  cancelBooking, completeBooking, confirmBooking, createBooking, extendBookingHold, moveBooking, saveHall, savePriceRule, updateBooking,
} from "@/actions/venue";
import { hallOf } from "@/lib/venue/hall-service";
import { bookingDetail, bookingsBetween, expiredHolds, listBookings } from "@/lib/venue/booking-queries";
import { calendarDays } from "@/lib/venue/booking-math";
import { executeOperation } from "@/lib/operations/execute";
import { dbDate } from "@/lib/venue/dates";

const client = (name, phone = "690000001") => ({ name, phone });

describe.skipIf(!hasDb)("event venue: bookings", () => {
  let o;
  let venueId;
  const d = (n) => addDaysToKey(today(), n);

  beforeAll(async () => {
    o = await setupVenueOrganization("Bookings");
    await loginAs(o.head.id);
    venueId = ok(await saveHall({ departmentId: o.venue.id, name: "Salle Majestueuse", basePrice: 300000, reservationHoldDays: 7 })).venueId;
  });

  it("refuses a booking before the hall is set up, a past date or a missing event type", async () => {
    const fresh = await setupVenueOrganization("Fresh");
    await loginAs(fresh.head.id);
    fails(await createBooking({ departmentId: fresh.venue.id, eventDateKey: d(10), eventType: "Wedding", client: client("A") }), /Set up the hall/);
    await loginAs(o.head.id);
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(-1), eventType: "Wedding", client: client("A") }), /has passed/);
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(10), client: client("A") }), /type of event/);
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(10), eventType: "Wedding", client: { name: "" } }), /client's name/);
  });

  it("books a date with the date's price, a client, a hold date; reference B-0001", async () => {
    const saturday = (() => {
      let k = d(20);
      while (new Date(`${k}T00:00:00Z`).getUTCDay() !== 6) k = addDaysToKey(k, 1);
      return k;
    })();
    ok(await savePriceRule({ departmentId: o.venue.id, venueId, kind: "WEEKDAY", weekday: 6, price: 500000 }));
    const b = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: saturday, eventType: "Wedding", guests: 300, startTime: "14:00", client: client("Ngono Family") }));
    expect(b).toMatchObject({ referenceNo: "B-0001", status: "RESERVED", agreedPrice: 500000, holdUntilKey: d(7) });
    const row = await db.venueBooking.findUnique({ where: { id: b.bookingId }, include: { client: true } });
    expect(row).toMatchObject({ hallPrice: 500000, guests: 300, startTime: "14:00", handledById: o.head.id });
    expect(row.client.name).toBe("Ngono Family");
    // The same client (name + phone) is reused.
    const b2 = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(30), eventType: "Birthday", client: client("ngono family") }));
    expect(b2.clientId).toBe(b.clientId);
  });

  it("prevents double bookings, also when two people book the same date at the same moment", async () => {
    const date = d(40);
    ok(await createBooking({ departmentId: o.venue.id, eventDateKey: date, eventType: "Conference", client: client("Firm A", "1") }));
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: date, eventType: "Wedding", client: client("Firm B", "2") }), /already booked: B-\d+, Conference for Firm A/);

    const race = d(41);
    const user = await db.user.findUnique({ where: { id: o.head.id }, include: { memberships: true, organization: true } });
    const attempts = await Promise.allSettled(
      Array.from({ length: 6 }, (_, i) => executeOperation({ user, kind: "venue.booking.create", key: key(), input: { departmentId: o.venue.id, eventDateKey: race, eventType: "Party", client: client(`Racer ${i}`, String(i)) } }))
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((a) => a.status === "rejected").every((a) => /already booked|just been booked/.test(a.reason.message))).toBe(true);
    expect(await db.venueBooking.count({ where: { venueId, eventDate: dbDate(race), status: { not: "CANCELLED" } } })).toBe(1);
  });

  it("a lower agreed price needs a reason; the agreed price can change later", async () => {
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(50), eventType: "Wedding", agreedPrice: 100000, client: client("Discount", "3") }), /say why/);
    const b = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(50), eventType: "Wedding", agreedPrice: 100000, priceNote: "Loyal client", client: client("Discount", "3") }));
    expect(b.agreedPrice).toBe(100000);
    ok(await updateBooking({ departmentId: o.venue.id, bookingId: b.bookingId, agreedPrice: 600000, guests: 150 }));
    expect(await db.venueBooking.findUnique({ where: { id: b.bookingId } })).toMatchObject({ agreedPrice: 600000, guests: 150 });
    expect(await db.auditEvent.count({ where: { entityId: b.bookingId } })).toBe(2);
  });

  it("confirm, move to a free date, cancel (frees the date); completed and cancelled bookings are final", async () => {
    const b = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(60), eventType: "Gala", client: client("Gala Co", "4") }));
    ok(await confirmBooking({ departmentId: o.venue.id, bookingId: b.bookingId }));
    fails(await confirmBooking({ departmentId: o.venue.id, bookingId: b.bookingId }), /confirmed: it cannot be confirmed/);
    fails(await completeBooking({ departmentId: o.venue.id, bookingId: b.bookingId }), /can be marked as completed from that day/);
    fails(await moveBooking({ departmentId: o.venue.id, bookingId: b.bookingId, eventDateKey: d(40), reason: "Client" }), /already booked/);
    fails(await moveBooking({ departmentId: o.venue.id, bookingId: b.bookingId, eventDateKey: d(61) }), /why the event moves/);
    ok(await moveBooking({ departmentId: o.venue.id, bookingId: b.bookingId, eventDateKey: d(61), reason: "Client asked" }));
    // The old date is free again.
    ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(60), eventType: "Concert", client: client("Band", "5") }));

    fails(await cancelBooking({ departmentId: o.venue.id, bookingId: b.bookingId }), /why the booking is cancelled/);
    ok(await cancelBooking({ departmentId: o.venue.id, bookingId: b.bookingId, reason: "Client cancelled" }));
    fails(await updateBooking({ departmentId: o.venue.id, bookingId: b.bookingId, guests: 1 }), /cancelled: it cannot be changed/);
    // A cancelled booking frees its date.
    ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(61), eventType: "Concert", client: client("Band", "5") }));
  });

  it("an event of today can be completed; a reservation can be held longer, never after the event", async () => {
    const b = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: today(), eventType: "Seminar", client: client("School", "6") }));
    expect(b.holdUntilKey).toBe(today()); // the hold never goes past the event
    fails(await extendBookingHold({ departmentId: o.venue.id, bookingId: b.bookingId, holdUntilKey: d(1) }), /after the event's date/);
    ok(await completeBooking({ departmentId: o.venue.id, bookingId: b.bookingId }));
    fails(await cancelBooking({ departmentId: o.venue.id, bookingId: b.bookingId, reason: "x" }), /completed: it cannot be cancelled/);

    const r = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(70), eventType: "Wedding", client: client("Late", "7") }));
    ok(await extendBookingHold({ departmentId: o.venue.id, bookingId: r.bookingId, holdUntilKey: d(14) }));
    expect((await db.venueBooking.findUnique({ where: { id: r.bookingId } })).holdUntil.toISOString().slice(0, 10)).toBe(d(14));
  });

  it("an expired hold without money is listed (and still holds the date)", async () => {
    const r = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(80), eventType: "Wedding", client: client("Silent", "8") }));
    await db.venueBooking.update({ where: { id: r.bookingId }, data: { holdUntil: dbDate(d(-2)) } });
    const expired = await expiredHolds({ departmentId: o.venue.id, todayKey: today() });
    expect(expired.map((b) => b.id)).toContain(r.bookingId);
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(80), eventType: "Other", client: client("Other", "9") }), /already booked/);
  });

  it("the calendar, the list and the detail read the same bookings", async () => {
    const rows = await bookingsBetween({ departmentId: o.venue.id, fromKey: d(0), toKey: d(90), todayKey: today() });
    const days = calendarDays([d(40), d(60), d(61), d(62)], rows, today());
    expect(days.map((x) => x.state)).toEqual(["RESERVED", "RESERVED", "RESERVED", "AVAILABLE"]);
    expect(days[2].cancelled).toHaveLength(1);
    const list = await listBookings({ departmentId: o.venue.id, q: "gala", todayKey: today() });
    expect(list.rows).toHaveLength(1);
    expect(list.rows[0].status).toBe("CANCELLED");
    const detail = await bookingDetail({ departmentId: o.venue.id, bookingId: list.rows[0].id, todayKey: today() });
    expect(detail.history.map((h) => h.action)).toEqual(["VENUE_BOOKING_CREATED", "VENUE_BOOKING_CONFIRMED", "VENUE_BOOKING_MOVED", "VENUE_BOOKING_CANCELLED"]);
    expect(detail.figures).toMatchObject({ total: 0, balance: 0 });
    // Another department never sees it.
    expect(await bookingDetail({ departmentId: o.restaurant.id, bookingId: list.rows[0].id, todayKey: today() })).toBeNull();
  });

  it("the Boss reads but does not book; a head of another department cannot", async () => {
    await loginAs(o.boss.id);
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(90), eventType: "Wedding", client: client("Boss", "10") }), /role does not allow/);
    await loginAs(o.restHead.id);
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(90), eventType: "Wedding", client: client("Rest", "11") }), /not assigned/);
    await loginAs(o.head.id);
    expect((await hallOf(o.venue.id)).id).toBe(venueId);
  });
});
