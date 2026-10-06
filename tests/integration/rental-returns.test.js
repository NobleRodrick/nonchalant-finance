import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, loginAs, ok, setupRentalOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addRentalCharge, completeRentalRepair, createRentalOrder, dispatchRentalOrder, rentalAvailability, reportRentalIncident, returnRentalItems, saveRentalItem, settleRentalIncident, stepRentalOrder, voidRentalCharge } from "@/actions/rental";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { countersFromMovements } from "@/lib/rental/stock-math";
import { orderDetail } from "@/lib/rental/order-queries";
import { incidentList, incidentTotals } from "@/lib/rental/item-queries";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const today = toDateKey(new Date());
const d = (n) => addDaysToKey(today, n);
const item = (id) => db.rentalItem.findUnique({ where: { id } });

describe.skipIf(!hasDb)("event rental: dispatch, returns, damages and losses", () => {
  let o;
  const it_ = {};
  let order;
  beforeAll(async () => {
    o = await setupRentalOrganization("Returns");
    await loginAs(o.head.id, o.deco.id);
    for (const [name, price, buy, repl, n] of [["Chairs", 500, 15000, 18000, 300], ["Plates", 200, 1500, 0, 400]]) {
      it_[name] = ok(await saveRentalItem({ departmentId: o.deco.id, name, category: name, rentalPrice: price, purchasePrice: buy, replacementValue: repl, openingQuantity: n })).itemId;
    }
    const r = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "John", phone: "677000001" }, eventType: "Wedding", eventDateKey: d(1), dispatchDateKey: d(0), status: "CONFIRMED", lines: [{ itemId: it_.Chairs, quantity: 200 }, { itemId: it_.Plates, quantity: 200 }, { kind: "SERVICE", label: "Decoration", unitPrice: 50000 }] }));
    order = await db.rentalOrder.findUnique({ where: { id: r.orderId }, include: { lines: true } });
  });
  const line = (name) => order.lines.find((l) => l.itemId === it_[name]);

  it("the items leave: fewer may leave than booked, never more; the stock shows them out", async () => {
    fails(await dispatchRentalOrder({ departmentId: o.deco.id, orderId: order.id, lines: [{ lineId: line("Chairs").id, quantity: 201 }] }), /cannot leave, 200 were booked/);
    const r = ok(await dispatchRentalOrder({ departmentId: o.deco.id, orderId: order.id, counterpart: "Driver Paul", lines: [{ lineId: line("Chairs").id, quantity: 200 }, { lineId: line("Plates").id, quantity: 190 }] }));
    expect(r).toMatchObject({ referenceNo: "DN-0001", issued: 390 });
    expect(await item(it_.Chairs)).toMatchObject({ owned: 300, out: 200 });
    expect(await item(it_.Plates)).toMatchObject({ out: 190 });
    expect((await db.rentalOrder.findUnique({ where: { id: order.id } })).status).toBe("DISPATCHED");
    fails(await dispatchRentalOrder({ departmentId: o.deco.id, orderId: order.id }), /already left/);
    // While out, they are not available to others.
    const a = ok(await rentalAvailability({ departmentId: o.deco.id, fromKey: d(1), toKey: d(1) }));
    expect(a.find((x) => x.id === it_.Chairs).available).toBe(100);
    expect(a.find((x) => x.id === it_.Plates).available).toBe(210);
  });

  it("a partial return flags the difference (195 back, 3 damaged, 2 missing) and tells the Boss", async () => {
    fails(await returnRentalItems({ departmentId: o.deco.id, orderId: order.id, lines: [{ lineId: line("Chairs").id, good: 199, damaged: 3 }] }), /200 still out, 202 counted/);
    const r = ok(await returnRentalItems({ departmentId: o.deco.id, orderId: order.id, lines: [{ lineId: line("Chairs").id, good: 195, damaged: 3, missing: 2, reason: "Rain at the venue" }] }));
    expect(r).toMatchObject({ referenceNo: "GR-0001", allBack: false });
    expect(r.differences.map((x) => [x.kind, x.quantity])).toEqual([["DAMAGED", 3], ["MISSING", 2]]);
    expect(await item(it_.Chairs)).toMatchObject({ owned: 300, out: 0, damaged: 3, missing: 2 });
    const incidents = await incidentList({ departmentId: o.deco.id, orderId: order.id });
    expect(incidents.find((x) => x.kind === "MISSING")).toMatchObject({ quantity: 2, estimatedLoss: 2 * 18000, responsibleName: "John", reason: "Rain at the venue" });
    expect(await db.notification.count({ where: { userId: o.boss.id, kind: "RENTAL_RETURN_DIFFERENCE" } })).toBe(1);
    expect((await db.rentalOrder.findUnique({ where: { id: order.id } })).status).toBe("DISPATCHED");
    // The plates: the rest come back; the booking is "Items returned".
    const r2 = ok(await returnRentalItems({ departmentId: o.deco.id, orderId: order.id, lines: [{ lineId: line("Plates").id, good: 188, broken: 2 }] }));
    expect(r2).toMatchObject({ referenceNo: "GR-0002", allBack: true });
    expect((await db.rentalOrder.findUnique({ where: { id: order.id } })).status).toBe("RETURNED");
  });

  it("each record is settled: missing charged to the customer, damaged repaired, broken a loss", async () => {
    fails(await stepRentalOrder({ departmentId: o.deco.id, orderId: order.id, step: "close" }), /3 damaged or missing item record/);
    const list = await incidentList({ departmentId: o.deco.id, orderId: order.id });
    const missing = list.find((x) => x.kind === "MISSING");
    const damaged = list.find((x) => x.kind === "DAMAGED");
    const broken = list.find((x) => x.kind === "BROKEN");
    const c = ok(await settleRentalIncident({ departmentId: o.deco.id, incidentId: missing.id, decision: "charge" }));
    expect(c).toMatchObject({ status: "CHARGED", chargeReference: "CH-0001" });
    expect(await item(it_.Chairs)).toMatchObject({ owned: 298, missing: 0 });
    ok(await settleRentalIncident({ departmentId: o.deco.id, incidentId: damaged.id, decision: "repair", repairBy: "Atelier Mbarga", repairCost: 6000 }));
    expect(await item(it_.Chairs)).toMatchObject({ damaged: 0, inRepair: 3 });
    ok(await settleRentalIncident({ departmentId: o.deco.id, incidentId: broken.id, decision: "loss" }));
    expect(await item(it_.Plates)).toMatchObject({ owned: 398, damaged: 0 });
    const wo = await db.rentalMovement.findFirst({ where: { itemId: it_.Plates, kind: "WRITTEN_OFF" } });
    expect(wo.value).toBe(2 * 1500); // a loss at cost
    fails(await settleRentalIncident({ departmentId: o.deco.id, incidentId: broken.id, decision: "loss" }), /already settled/);
    // The charge is part of what the customer owes.
    const det = await orderDetail({ departmentId: o.deco.id, orderId: order.id, todayKey: today });
    expect(det.order.figures).toMatchObject({ total: 200 * 500 + 200 * 200 + 50000 + 36000, charges: 36000 });
    // The repair comes back: cost paid from the drawer, an expense of the event.
    ok(await completeRentalRepair({ departmentId: o.deco.id, incidentId: damaged.id, cost: 6000, paidFromDrawer: true, counterparty: "Atelier Mbarga" }));
    expect(await item(it_.Chairs)).toMatchObject({ inRepair: 0, owned: 298 });
    const expense = await db.transaction.findFirst({ where: { rentalOrderId: order.id, type: "EXPENSE" } });
    expect(expense).toMatchObject({ category: "rental-repairs", counterparty: "Atelier Mbarga" });
    expect(Number(expense.amount)).toBe(6000);
    expect(incidentTotals(await incidentList({ departmentId: o.deco.id, orderId: order.id, status: "all" }))).toMatchObject({ open: 0, inRepair: 0, charged: 36000, repairCost: 6000 });
    ok(await stepRentalOrder({ departmentId: o.deco.id, orderId: order.id, step: "close" }));
  });

  it("charges: extra days added, voided with a reason; a voided damage charge becomes a loss", async () => {
    const r = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Ann" }, eventType: "Party", eventDateKey: d(5), status: "CONFIRMED", lines: [{ itemId: it_.Plates, quantity: 10 }] }));
    const ch = ok(await addRentalCharge({ departmentId: o.deco.id, orderId: r.orderId, kind: "EXTRA_DAYS", label: "2 extra days", amount: 4000 }));
    fails(await voidRentalCharge({ departmentId: o.deco.id, chargeId: ch.chargeId }), /reason/);
    ok(await voidRentalCharge({ departmentId: o.deco.id, chargeId: ch.chargeId, reason: "Agreed free" }));
    const det = await orderDetail({ departmentId: o.deco.id, orderId: r.orderId, todayKey: today });
    expect(det.order.figures.charges).toBe(0);
    const damageCharge = await db.rentalCharge.findFirst({ where: { orderId: order.id, kind: "DAMAGE" } });
    fails(await voidRentalCharge({ departmentId: o.deco.id, chargeId: damageCharge.id, reason: "Customer refused" }), /closed|CLOSED/i);
  });

  it("damage found in the store: missing then found, broken written off", async () => {
    const m = ok(await reportRentalIncident({ departmentId: o.deco.id, itemId: it_.Chairs, kind: "MISSING", quantity: 4, reason: "Not found at the count" }));
    expect(await item(it_.Chairs)).toMatchObject({ missing: 4 });
    fails(await settleRentalIncident({ departmentId: o.deco.id, incidentId: m.incidentId, decision: "charge" }), /after an event/);
    ok(await settleRentalIncident({ departmentId: o.deco.id, incidentId: m.incidentId, decision: "found" }));
    expect(await item(it_.Chairs)).toMatchObject({ missing: 0, owned: 298 });
    fails(await reportRentalIncident({ departmentId: o.deco.id, itemId: it_.Chairs, kind: "BROKEN", quantity: 1 }), /what happened/i);
  });

  it("the ledger still matches every line", async () => {
    const items = await db.rentalItem.findMany({ where: { departmentId: o.deco.id }, include: { movements: true } });
    for (const i of items) expect(countersFromMovements(i.movements)).toEqual({ owned: i.owned, out: i.out, damaged: i.damaged, inRepair: i.inRepair, missing: i.missing });
  });
});
