import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, loginAs, ok, setupVenueOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { createDepartment, updateEmployee } from "@/actions/organization";
import { allocatePackageRoom, cancelBooking, createBooking, releasePackageRoom, removePackage, saveHall, savePackage, setPackageActive } from "@/actions/venue";
import { cancelStay, createStay, saveRoom, stepStay } from "@/actions/rooms";
import { packageStays, roomsSummary, staysBetween } from "@/lib/rooms/room-queries";
import { occupancyGrid, occupancyRate } from "@/lib/rooms/stay-math";

describe.skipIf(!hasDb)("venue packages and Executive Stay rooms", () => {
  let o;
  let stayDept;
  let room101;
  let room102;
  let pkgId;
  const d = (n) => addDaysToKey(today(), n);

  beforeAll(async () => {
    o = await setupVenueOrganization("Packages");
    await loginAs(o.boss.id);
    stayDept = ok(await createDepartment({ name: "Executive Stay", domain: "ROOM_RENTAL" }));
    stayDept = await db.department.findFirst({ where: { organizationId: o.org.id, name: "Executive Stay" } });
    // The restaurant's head also heads Executive Stay.
    const rh = await db.user.findUnique({ where: { id: o.restHead.id }, include: { memberships: true } });
    ok(await updateEmployee({ employeeId: rh.id, memberships: [...rh.memberships.map((m) => ({ departmentId: m.departmentId, isPrimary: m.isPrimary })), { departmentId: stayDept.id, isPrimary: false }] }));
    await loginAs(o.restHead.id);
    room101 = ok(await saveRoom({ departmentId: stayDept.id, name: "101", roomType: "Executive", nightlyRate: 35000 })).roomId;
    room102 = ok(await saveRoom({ departmentId: stayDept.id, name: "102", nightlyRate: 35000 })).roomId;
    await loginAs(o.head.id);
    ok(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 500000 }));
  });

  it("the venue's head creates, changes, withdraws and removes packages; items are validated", async () => {
    fails(await savePackage({ departmentId: o.venue.id, name: "X", price: 10 }), /Name the package/);
    fails(await savePackage({ departmentId: o.venue.id, name: "Royal", price: 1, items: [{ kind: "ROOM", label: "Room", quantity: 1, nights: 0 }] }), /how many nights/);
    pkgId = ok(await savePackage({ departmentId: o.venue.id, name: "Royal wedding", price: 100000, items: [{ kind: "ROOM", label: "Free room at Executive Stay", quantity: 1, nights: 1 }, { kind: "SERVICE", label: "Decoration" }] })).packageId;
    ok(await savePackage({ departmentId: o.venue.id, id: pkgId, name: "Royal wedding", price: 120000, items: [{ kind: "ROOM", label: "Free rooms at Executive Stay", quantity: 2, nights: 1 }, { kind: "SERVICE", label: "Decoration" }] }));
    const pkg = await db.venuePackage.findUnique({ where: { id: pkgId }, include: { items: true } });
    expect(pkg.price).toBe(120000);
    expect(pkg.items.map((i) => [i.kind, i.quantity])).toEqual(expect.arrayContaining([["ROOM", 2], ["SERVICE", 1]]));
    const tmp = ok(await savePackage({ departmentId: o.venue.id, name: "Old offer", price: 0 })).packageId;
    ok(await setPackageActive({ departmentId: o.venue.id, packageId: tmp, active: false }));
    fails(await createBooking({ departmentId: o.venue.id, eventDateKey: d(5), eventType: "Party", packageId: tmp, client: { name: "Old", phone: "0" } }), /not offered any more/);
    ok(await removePackage({ departmentId: o.venue.id, packageId: tmp }));
    expect((await db.venuePackage.findUnique({ where: { id: tmp } })).archivedAt).not.toBeNull();
  });

  it("a booking with a package: the price includes it, the package is copied as sold", async () => {
    const b = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(10), eventType: "Wedding", packageId: pkgId, client: { name: "Ngono", phone: "1" } }));
    expect(b.agreedPrice).toBe(620000);
    // Changing the package later does not change the booking.
    ok(await savePackage({ departmentId: o.venue.id, id: pkgId, name: "Royal wedding", price: 999999, items: [{ kind: "ROOM", label: "Free rooms at Executive Stay", quantity: 2, nights: 1 }] }));
    const row = await db.venueBooking.findUnique({ where: { id: b.bookingId } });
    expect(row.packagePrice).toBe(120000);
    expect(row.packageSnapshot.items.map((i) => i.label)).toEqual(["Free rooms at Executive Stay", "Decoration"]);
    ok(await savePackage({ departmentId: o.venue.id, id: pkgId, name: "Royal wedding", price: 120000, items: [{ kind: "ROOM", label: "Free rooms at Executive Stay", quantity: 2, nights: 1 }] }));
  });

  it("package rooms become free stays of specific rooms at Executive Stay (occupied there, heads notified)", async () => {
    const b = await db.venueBooking.findFirst({ where: { departmentId: o.venue.id, eventType: "Wedding" } });
    const r1 = ok(await allocatePackageRoom({ departmentId: o.venue.id, bookingId: b.id, roomsDepartmentId: stayDept.id, roomId: room101 }));
    expect(r1).toMatchObject({ referenceNo: "RB-0001", roomName: "101", nights: 1, totalPrice: 0 });
    // The same room on the same night cannot be given twice.
    fails(await allocatePackageRoom({ departmentId: o.venue.id, bookingId: b.id, roomsDepartmentId: stayDept.id, roomId: room101 }), /room is taken/);
    ok(await allocatePackageRoom({ departmentId: o.venue.id, bookingId: b.id, roomsDepartmentId: stayDept.id, roomId: room102, guestName: "Best man" }));
    fails(await allocatePackageRoom({ departmentId: o.venue.id, bookingId: b.id, roomsDepartmentId: stayDept.id, roomId: room102, checkInKey: d(11) }), /all are allocated/);
    const stays = await packageStays(b.id);
    expect(stays.map((s) => [s.room.name, s.complimentary, s.checkInKey, s.checkOutKey])).toEqual([["101", true, d(10), d(11)], ["102", true, d(10), d(11)]]);
    const notes = await db.notification.count({ where: { userId: o.restHead.id, kind: "ROOM_ALLOCATED" } });
    expect(notes).toBe(2);

    // Executive Stay sees them: a paying guest cannot take room 101 that night.
    await loginAs(o.restHead.id);
    fails(await createStay({ departmentId: stayDept.id, roomId: room101, checkInKey: d(9), checkOutKey: d(11), guestName: "Walk-in" }), /room is taken/);
    const ok2 = ok(await createStay({ departmentId: stayDept.id, roomId: room101, checkInKey: d(11), checkOutKey: d(13), guestName: "Walk-in" }));
    expect(ok2).toMatchObject({ nights: 2, totalPrice: 70000 });
    const grid = occupancyGrid([{ id: room101 }, { id: room102 }], await staysBetween({ departmentId: stayDept.id, fromKey: d(10), toKey: d(12) }), d(10), d(12));
    expect(grid[0].nights.map((n) => n.stay?.guestName || null)).toEqual(["Ngono", "Walk-in", "Walk-in"]);
    expect(occupancyRate(grid)).toBe(67);
    // The Boss's card: both rooms taken that night, given free with the package; 4 of 14 nights that week.
    expect(await roomsSummary({ departmentId: stayDept.id, dateKey: d(10) })).toEqual({ rooms: 2, occupied: 2, rateTonight: 100, rateWeek: 29, arrivals: 2, departures: 0, complimentaryTonight: 2 });
    expect(await roomsSummary({ departmentId: stayDept.id, dateKey: d(11) })).toMatchObject({ occupied: 1, arrivals: 1, departures: 2 });
  });

  it("stays: check in, check out, cancel; another department's head cannot touch them", async () => {
    await loginAs(o.restHead.id);
    const s = ok(await createStay({ departmentId: stayDept.id, roomId: room102, checkInKey: d(0), checkOutKey: d(2), guestName: "Guest" }));
    fails(await stepStay({ departmentId: stayDept.id, stayId: ok(await createStay({ departmentId: stayDept.id, roomId: room102, checkInKey: d(20), checkOutKey: d(22), guestName: "Later" })).stayId, step: "checkin" }), /check in from that day/);
    fails(await stepStay({ departmentId: stayDept.id, stayId: s.stayId, step: "checkout" }), /is confirmed/);
    ok(await stepStay({ departmentId: stayDept.id, stayId: s.stayId, step: "checkin" }));
    ok(await stepStay({ departmentId: stayDept.id, stayId: s.stayId, step: "checkout" }));
    fails(await cancelStay({ departmentId: stayDept.id, stayId: s.stayId, reason: "x" }), /cannot be cancelled/);
    await loginAs(o.head.id);
    fails(await createStay({ departmentId: stayDept.id, roomId: room102, checkInKey: d(30), checkOutKey: d(31), guestName: "Intruder" }), /not assigned/);
  });

  it("cancelling the venue booking frees its package rooms; a released room is free again", async () => {
    await loginAs(o.head.id);
    const b = await db.venueBooking.findFirst({ where: { departmentId: o.venue.id, eventType: "Wedding" } });
    const [first] = await packageStays(b.id);
    ok(await releasePackageRoom({ departmentId: o.venue.id, stayId: first.id, reason: "Client does not need it" }));
    ok(await allocatePackageRoom({ departmentId: o.venue.id, bookingId: b.id, roomsDepartmentId: stayDept.id, roomId: room101 }));
    ok(await cancelBooking({ departmentId: o.venue.id, bookingId: b.id, reason: "Wedding postponed" }));
    const stays = await packageStays(b.id);
    expect(stays.every((x) => x.status === "CANCELLED")).toBe(true);
    await loginAs(o.restHead.id);
    ok(await createStay({ departmentId: stayDept.id, roomId: room102, checkInKey: d(10), checkOutKey: d(11), guestName: "Now free" }));
  });
});
