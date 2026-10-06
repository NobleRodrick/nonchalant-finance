import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, loginAs, ok, setupRentalOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { cancelRentalOrder, createRentalOrder, rentalAvailability, saveRentalClient, saveRentalItem, stepRentalOrder, updateRentalOrder } from "@/actions/rental";
import { setHeadRights } from "@/actions/organization";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { customerDetail, customerList, dayAgenda, listOrders, listTotals, orderDetail, rentalCalendar } from "@/lib/rental/order-queries";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const today = toDateKey(new Date());
const d = (n) => addDaysToKey(today, n);

describe.skipIf(!hasDb)("event rental: bookings and double-booking control", () => {
  let o;
  const it_ = {};
  let john;
  let wedding;
  beforeAll(async () => {
    o = await setupRentalOrganization("Bookings");
    await loginAs(o.head.id, o.deco.id);
    for (const [name, price, n] of [["Chairs", 500, 300], ["Tables", 5000, 30], ["Plates", 200, 400], ["Flowers", 5000, 20]]) {
      it_[name] = ok(await saveRentalItem({ departmentId: o.deco.id, name, category: name, rentalPrice: price, purchasePrice: price * 10, openingQuantity: n })).itemId;
    }
  });

  it("books the requirements' example: totals computed automatically (290 000 FCFA)", async () => {
    const r = ok(await createRentalOrder({
      departmentId: o.deco.id,
      client: { name: "John", phone: "677000001", address: "Bonapriso, Douala" },
      eventType: "Wedding",
      eventDateKey: d(20),
      eventLocation: "Hotel Akwa Palace",
      status: "CONFIRMED",
      lines: [{ itemId: it_.Chairs, quantity: 200 }, { itemId: it_.Tables, quantity: 20 }, { itemId: it_.Plates, quantity: 200 }, { itemId: it_.Flowers, quantity: 10 }],
      depositDue: 100000,
      paymentDueDateKey: d(18),
      staffNames: "Aline, Paul",
      specialInstructions: "White tablecloths",
    }));
    expect(r).toMatchObject({ referenceNo: "B-0001", status: "CONFIRMED", agreedPrice: 290000 });
    wedding = await db.rentalOrder.findUnique({ where: { id: r.orderId }, include: { lines: true, client: true } });
    expect(wedding).toMatchObject({ itemsTotal: 290000, servicesTotal: 0, discount: 0, depositDue: 100000, staffNames: ["Aline", "Paul"], handledById: o.head.id });
    expect(wedding.client).toMatchObject({ name: "John", address: "Bonapriso, Douala" });
    // Dispatch the day before, return the day after.
    expect(wedding.dispatchDate.toISOString().slice(0, 10)).toBe(d(19));
    expect(wedding.returnDate.toISOString().slice(0, 10)).toBe(d(21));
    john = wedding.clientId;
  });

  it("refuses to book more chairs than remain for those days, with the requirements' message", async () => {
    const res = fails(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Birthday", eventDateKey: d(20), status: "CONFIRMED", lines: [{ itemId: it_.Chairs, quantity: 150 }] }));
    const day = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${d(20)}T00:00:00Z`));
    expect(res.error).toBe(`Insufficient chairs available for ${day}. Only 100 chairs are available.`);
    // The attempt is in the audit trail (kept although the booking was refused).
    expect(await db.auditEvent.count({ where: { departmentId: o.deco.id, action: "RENTAL_DOUBLE_BOOKING_REFUSED" } })).toBe(1);
    // An inquiry does not hold items; 100 chairs fit.
    ok(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Birthday", eventDateKey: d(20), status: "CONFIRMED", lines: [{ itemId: it_.Chairs, quantity: 100 }] }));
    const inq = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Mary", phone: "690000002" }, eventType: "Funeral", eventDateKey: d(21), lines: [{ itemId: it_.Chairs, quantity: 50 }] }));
    expect(inq.status).toBe("INQUIRY");
    fails(await stepRentalOrder({ departmentId: o.deco.id, orderId: inq.orderId, step: "confirm" }), /Insufficient chairs.*Only 0 chairs/);
    // Days that do not overlap are free.
    ok(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Party", eventDateKey: d(23), status: "CONFIRMED", lines: [{ itemId: it_.Chairs, quantity: 300 }] }));
  });

  it("availability for the booking form: usable, reserved on the busiest day, available", async () => {
    const rows = ok(await rentalAvailability({ departmentId: o.deco.id, fromKey: d(19), toKey: d(21) }));
    expect(rows.find((r) => r.id === it_.Chairs)).toMatchObject({ usable: 300, reserved: 300, available: 0 });
    expect(rows.find((r) => r.id === it_.Tables)).toMatchObject({ reserved: 20, available: 10 });
    const without = ok(await rentalAvailability({ departmentId: o.deco.id, fromKey: d(19), toKey: d(21), excludeOrderId: wedding.id }));
    expect(without.find((r) => r.id === it_.Chairs).available).toBe(200);
  });

  it("only six concurrent bookings of 100 chairs: exactly what is left is booked", async () => {
    const results = await Promise.all(Array.from({ length: 6 }, (_, i) => createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Meeting / conference", eventDateKey: d(40), status: "CONFIRMED", lines: [{ itemId: it_.Chairs, quantity: 100 }], notes: `try ${i}` })));
    expect(results.filter((r) => r.success)).toHaveLength(3);
    expect(results.filter((r) => !r.success).every((r) => /Insufficient chairs/.test(r.error))).toBe(true);
  });

  it("prices other than the list price need the right and a reason; services and discounts", async () => {
    const lines = [{ itemId: it_.Chairs, quantity: 10, unitPrice: 400 }, { kind: "SERVICE", label: "Decoration of the church", quantity: 1, unitPrice: 75000 }, { kind: "SERVICE", label: "Transport", unitPrice: 15000 }];
    fails(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Church service", eventDateKey: d(50), lines }), /Say why/);
    const r = ok(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Church service", eventDateKey: d(50), lines, discount: 5000, priceNote: "Parish discount" }));
    expect(r.agreedPrice).toBe(10 * 400 + 75000 + 15000 - 5000);
    await loginAs(o.boss.id);
    ok(await setHeadRights({ employeeId: o.head2.id, departmentId: o.deco.id, grants: ["APPROVE"] }));
    await loginAs(o.head2.id, o.deco.id);
    fails(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Party", eventDateKey: d(51), lines, priceNote: "x" }), /may not change prices/);
    ok(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Party", eventDateKey: d(51), lines: [{ itemId: it_.Plates, quantity: 10 }] }));
    fails(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Party", eventDateKey: d(51), lines: [] }), /at least one/);
    fails(await createRentalOrder({ departmentId: o.deco.id, clientId: john, eventType: "Party", eventDateKey: d(51), dispatchDateKey: d(52), lines: [{ itemId: it_.Plates, quantity: 1 }] }), /leave on or before/);
  });

  it("changes a confirmed booking (checked again), steps it, cancels one (items free again)", async () => {
    await loginAs(o.head.id, o.deco.id);
    const lines = wedding.lines.map((l) => ({ itemId: l.itemId, quantity: l.itemId === it_.Chairs ? 250 : l.quantity }));
    fails(await updateRentalOrder({ departmentId: o.deco.id, orderId: wedding.id, eventType: "Wedding", eventDateKey: d(20), lines }), /Insufficient chairs.*Only 200/);
    ok(await updateRentalOrder({ departmentId: o.deco.id, orderId: wedding.id, eventType: "Wedding", eventDateKey: d(20), eventLocation: "Hotel Akwa Palace, salle 2", lines: wedding.lines.map((l) => ({ itemId: l.itemId, quantity: l.quantity })), depositDue: 100000 }));
    ok(await stepRentalOrder({ departmentId: o.deco.id, orderId: wedding.id, step: "prepare" }));
    fails(await stepRentalOrder({ departmentId: o.deco.id, orderId: wedding.id, step: "quote" }), /cannot be quoted/);
    const party = (await db.rentalOrder.findFirst({ where: { departmentId: o.deco.id, eventType: "Party", status: "CONFIRMED" } }));
    fails(await cancelRentalOrder({ departmentId: o.deco.id, orderId: party.id }), /Say why/);
    ok(await cancelRentalOrder({ departmentId: o.deco.id, orderId: party.id, reason: "Event postponed" }));
    const rows = ok(await rentalAvailability({ departmentId: o.deco.id, fromKey: d(22), toKey: d(24) }));
    expect(rows.find((r) => r.id === it_.Chairs).available).toBe(300);
    expect(await db.notification.count({ where: { userId: o.boss.id, kind: "RENTAL_BOOKING_CANCELLED" } })).toBe(1);
  });

  it("lists, filters, calendar and day agenda; customers with their history", async () => {
    const all = await listOrders({ departmentId: o.deco.id, todayKey: today, status: "all" });
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect((await listOrders({ departmentId: o.deco.id, todayKey: today, q: "Mary" })).map((r) => r.client.name)).toEqual(["Mary"]);
    expect((await listOrders({ departmentId: o.deco.id, todayKey: today, eventType: "Wedding" }))[0].stage.label).toBe("Preparation");
    expect(listTotals(await listOrders({ departmentId: o.deco.id, todayKey: today, clientId: john })).count).toBeGreaterThan(3);
    const cal = await rentalCalendar({ departmentId: o.deco.id, monthKey: d(20).slice(0, 7), todayKey: today });
    expect(cal.days.find((x) => x.dateKey === d(20)).events.map((e) => e.referenceNo)).toContain("B-0001");
    const agenda = await dayAgenda({ departmentId: o.deco.id, dateKey: d(19), todayKey: today });
    expect(agenda.find((a) => a.referenceNo === "B-0001").roles).toEqual(["Dispatch"]);
    const detail = await orderDetail({ departmentId: o.deco.id, orderId: wedding.id, todayKey: today });
    expect(detail.order.figures).toMatchObject({ total: 290000, paid: 0, balance: 290000, paymentStatus: "UNPAID" });
    const customers = await customerList({ departmentId: o.deco.id, todayKey: today });
    expect(customers.find((c) => c.name === "John")).toMatchObject({ phone: "677000001" });
    ok(await saveRentalClient({ departmentId: o.deco.id, id: john, name: "John Ndi", phone: "677000001", email: "john@example.cm", notes: "Prefers white" }));
    const cd = await customerDetail({ departmentId: o.deco.id, clientId: john, todayKey: today });
    expect(cd.client.name).toBe("John Ndi");
    expect(cd.eventTypes).toEqual(expect.arrayContaining(["Wedding", "Birthday"]));
  });
});
