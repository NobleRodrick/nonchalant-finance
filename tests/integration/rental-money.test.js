import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, loginAs, ok, setupRentalOrganization, key } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { cancelRentalOrder, createRentalOrder, recordRentalPayment, recordRentalRefund, saveRentalItem, saveRentalProfile } from "@/actions/rental";
import { voidRecord } from "@/actions/money";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { customerList, listOrders, orderDetail } from "@/lib/rental/order-queries";
import { readProfile } from "@/lib/business-profile";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const today = toDateKey(new Date());
const d = (n) => addDaysToKey(today, n);

describe.skipIf(!hasDb)("event rental: payments, refunds, overdue balances, business details", () => {
  let o;
  let chairs;
  let wedding;
  beforeAll(async () => {
    o = await setupRentalOrganization("Money");
    await loginAs(o.head.id, o.deco.id);
    chairs = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Chairs", category: "Chairs", rentalPrice: 500, openingQuantity: 300 })).itemId;
    wedding = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "John", phone: "677000001" }, eventType: "Wedding", eventDateKey: d(10), status: "CONFIRMED", depositDue: 40000, lines: [{ itemId: chairs, quantity: 200 }] })).orderId;
  });

  it("a deposit by Mobile Money (reference required), then the balance in cash; never more than owed", async () => {
    fails(await recordRentalPayment({ departmentId: o.deco.id, orderId: wedding, amount: 40000, paymentMethod: "MOMO", idempotencyKey: key() }), /transaction reference/);
    const p = ok(await recordRentalPayment({ departmentId: o.deco.id, orderId: wedding, amount: 40000, paymentMethod: "MOMO", reference: "MP2610.1234", receivedByName: "Aline", idempotencyKey: key() }));
    expect(p).toMatchObject({ referenceNo: "RC-0001", balance: 60000 });
    fails(await recordRentalPayment({ departmentId: o.deco.id, orderId: wedding, amount: 70000, idempotencyKey: key() }), /balance of B-0001 is 60 000/);
    ok(await recordRentalPayment({ departmentId: o.deco.id, orderId: wedding, amount: 60000, paymentMethod: "OTHER", reference: "Cheque 0042", idempotencyKey: key() }));
    const det = await orderDetail({ departmentId: o.deco.id, orderId: wedding, todayKey: today });
    expect(det.order.figures).toMatchObject({ total: 100000, paid: 100000, balance: 0, paymentStatus: "PAID" });
    expect(det.order.stage.label).toBe("Deposit paid");
    const t = await db.transaction.findFirst({ where: { rentalOrderId: wedding, referenceNo: "RC-0001" } });
    expect(t).toMatchObject({ type: "BOOKING_PAYMENT", paymentMethod: "MOMO", receivedByName: "Aline", category: "rental-payment", customerName: "John" });
    fails(await recordRentalPayment({ departmentId: o.deco.id, orderId: wedding, amount: 1, idempotencyKey: key() }), /already paid in full/);
  });

  it("voids a payment with a reason (the balance comes back)", async () => {
    const t = await db.transaction.findFirst({ where: { rentalOrderId: wedding, paymentMethod: "OTHER" } });
    ok(await voidRecord({ transactionId: t.id, reason: "Cheque bounced" }));
    expect((await orderDetail({ departmentId: o.deco.id, orderId: wedding, todayKey: today })).order.figures.balance).toBe(60000);
  });

  it("refunds only what was paid on a cancelled booking (or paid too much)", async () => {
    fails(await recordRentalRefund({ departmentId: o.deco.id, orderId: wedding, amount: 10000, reason: "x" }), /not cancelled/);
    const party = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Ann" }, eventType: "Party", eventDateKey: d(3), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 20 }] })).orderId;
    ok(await recordRentalPayment({ departmentId: o.deco.id, orderId: party, amount: 5000, idempotencyKey: key() }));
    ok(await cancelRentalOrder({ departmentId: o.deco.id, orderId: party, reason: "Rain" }));
    fails(await recordRentalPayment({ departmentId: o.deco.id, orderId: party, amount: 1000, idempotencyKey: key() }), /cancelled/);
    fails(await recordRentalRefund({ departmentId: o.deco.id, orderId: party, amount: 6000, reason: "Rain" }), /Only 5 000/);
    ok(await recordRentalRefund({ departmentId: o.deco.id, orderId: party, amount: 3000, reason: "Kept 2000 for costs", idempotencyKey: key() }));
    const det = await orderDetail({ departmentId: o.deco.id, orderId: party, todayKey: today });
    // A cancelled booking owes nothing more; what was kept (2 000) is its income.
    expect(det.order.figures).toMatchObject({ total: 2000, paid: 2000, balance: 0 });
  });

  it("overdue: a balance still owed after its deadline", async () => {
    const late = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Paul" }, eventType: "Funeral", eventDateKey: d(1), dispatchDateKey: d(-1), returnDateKey: d(2), paymentDueDateKey: d(-1), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 10 }] })).orderId;
    const rows = await listOrders({ departmentId: o.deco.id, todayKey: today, payment: "overdue" });
    expect(rows.map((r) => r.id)).toEqual([late]);
    expect(rows[0].figures.balance).toBe(5000);
    const people = await customerList({ departmentId: o.deco.id, todayKey: today });
    expect(people.find((c) => c.name === "Paul")).toMatchObject({ balance: 5000, overdue: 5000 });
    expect(people.find((c) => c.name === "John")).toMatchObject({ bookings: 1, spent: 100000, paid: 40000, balance: 60000 });
  });

  it("business details printed on documents (heads with the right; the e-mail checked)", async () => {
    fails(await saveRentalProfile({ departmentId: o.deco.id, email: "not-an-email" }), /does not look right/);
    ok(await saveRentalProfile({ departmentId: o.deco.id, legalName: "Deco Diva Events", phone: "+237 6 99 00 00 00", taxId: "M0123456789", contractTerms: "1. Items stay ours." }));
    const dept = await db.department.findUnique({ where: { id: o.deco.id } });
    expect(readProfile(dept)).toMatchObject({ legalName: "Deco Diva Events", taxId: "M0123456789", contractTerms: "1. Items stay ours.", logoId: null, address: null });
  });
});
