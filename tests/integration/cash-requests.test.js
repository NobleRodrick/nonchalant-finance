import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupOrganization, today, yesterday } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { addDish } from "@/actions/menu-stock";
import { recordSale } from "@/actions/sales";
import { recordMoney, voidRecord } from "@/actions/money";
import { recordHandover } from "@/actions/handovers";
import { requestCash, cancelCashRequestAction } from "@/actions/cash-requests";
import { listCashRequests, cashDue } from "@/lib/finance/cash-requests";

describe("cash due for a period (pure)", () => {
  it("is cash in − cash out − handed over, never below zero", () => {
    const tx = [
      { type: "SALE", amount: 10000, grossAmount: 10000, discountAmount: 0, paymentMethod: "CASH", status: "COMPLETED" },
      { type: "SALE", amount: 4000, grossAmount: 4000, discountAmount: 0, paymentMethod: "MOMO", status: "COMPLETED" },
      { type: "EXPENSE", amount: 1500, paymentMethod: "CASH", status: "COMPLETED" },
    ];
    expect(cashDue({ transactions: tx, handovers: [{ amount: 3000, status: "CONFIRMED" }, { amount: 999, status: "DISPUTED" }] })).toMatchObject({ cashIn: 10000, cashOut: 1500, net: 8500, handedOver: 3000, outstanding: 5500 });
    expect(cashDue({ transactions: tx, handovers: [{ amount: 9000, status: "RECORDED" }] }).outstanding).toBe(0);
  });
});

describe.skipIf(!hasDb)("cash to the Boss: only heads hand over; the Boss requests", () => {
  let o;
  let dish;
  beforeAll(async () => {
    o = await setupOrganization("Cash");
    await loginAs(o.manager.id);
    dish = ok(await addDish({ departmentId: o.deptA.id, name: "Rice", unitPrice: 2000, openingPlates: 20 })).dish;
    ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 5 }], paymentMethod: "CASH", idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 1000, category: "opex-gas", paymentMethod: "CASH", idempotencyKey: key() }));
  });

  it("the Boss and heads of other departments cannot record a handover here", async () => {
    await loginAs(o.boss.id);
    fails(await recordHandover({ departmentId: o.deptA.id, amount: 1000, idempotencyKey: key() }), /does not allow|department head/);
    await loginAs(o.multi.id);
    fails(await recordHandover({ departmentId: o.deptA.id, amount: 1000, idempotencyKey: key() }), /not assigned/);
  });

  it("the Boss requests today's cash (default); the head is notified; a second identical request is skipped", async () => {
    await loginAs(o.boss.id);
    const res = ok(await requestCash({ departmentIds: [o.deptA.id], note: "Before 20:00" }));
    expect(res.created).toHaveLength(1);
    const req = await db.cashRequest.findFirst({ where: { departmentId: o.deptA.id } });
    expect(req).toMatchObject({ fromKey: today(), toKey: today(), status: "OPEN", note: "Before 20:00" });
    const note = await db.notification.findFirst({ where: { userId: o.manager.id, kind: "CASH_REQUESTED" } });
    expect(note.href).toBe(`/d/${o.deptA.id}/cash-handover`);
    const again = ok(await requestCash({ departmentIds: [o.deptA.id] }));
    expect(again.created).toHaveLength(0);
    expect(again.skipped).toEqual(["Restaurant A"]);
    const [live] = await listCashRequests({ organizationId: o.org.id, departmentIds: [o.deptA.id] });
    expect(live.figures).toMatchObject({ cashIn: 10000, cashOut: 1000, net: 9000, handedOver: 0, outstanding: 9000 });
  });

  it("refuses future periods, reversed periods, other organizations and non-Boss users", async () => {
    await loginAs(o.boss.id);
    fails(await requestCash({ departmentIds: [o.deptA.id], fromKey: addDaysToKey(today(), 1) }), /not come yet/);
    fails(await requestCash({ departmentIds: [o.deptA.id], fromKey: today(), toKey: yesterday() }), /starts after/);
    fails(await requestCash({ departmentIds: [o.laundry.id] }), /Choose the departments/);
    const other = await setupOrganization("Other");
    await loginAs(other.boss.id);
    fails(await requestCash({ departmentIds: [o.deptA.id] }), /Choose the departments/);
    await loginAs(o.manager.id);
    fails(await requestCash({ departmentIds: [o.deptA.id] }), /Boss/);
  });

  it("a request to all departments reaches every restaurant department", async () => {
    await loginAs(o.boss.id);
    const res = ok(await requestCash({ fromKey: yesterday(), toKey: yesterday() }));
    expect(res.created.map((c) => c.department).sort()).toEqual(["Restaurant A", "Restaurant B"]);
    const noteB = await db.notification.findFirst({ where: { userId: o.multi.id, kind: "CASH_REQUESTED" } });
    expect(noteB).toBeTruthy();
  });

  it("the head hands over against the request: it becomes answered and the amount due falls", async () => {
    const req = await db.cashRequest.findFirst({ where: { departmentId: o.deptA.id, fromKey: today() } });
    await loginAs(o.manager.id);
    const h = ok(await recordHandover({ departmentId: o.deptA.id, amount: 6000, cashRequestId: req.id, idempotencyKey: key() }));
    expect((await db.cashRequest.findUnique({ where: { id: req.id } })).status).toBe("ANSWERED");
    const handover = await db.cashHandover.findFirst({ where: { referenceNo: h.referenceNo, departmentId: o.deptA.id } });
    expect(handover.cashRequestId).toBe(req.id);
    const boss = await db.notification.findFirst({ where: { userId: o.boss.id, kind: "HANDOVER_RECORDED" }, orderBy: { createdAt: "desc" } });
    expect(boss.body).toMatch(/for your request of/);
    const [live] = await listCashRequests({ organizationId: o.org.id, departmentIds: [o.deptA.id], statuses: ["ANSWERED"] });
    expect(live.figures).toMatchObject({ net: 9000, handedOver: 6000, againstRequest: 6000, outstanding: 3000 });
    // A request of another department cannot be answered from this one.
    const reqB = await db.cashRequest.findFirst({ where: { departmentId: o.deptB.id } });
    fails(await recordHandover({ departmentId: o.deptA.id, amount: 100, cashRequestId: reqB.id, idempotencyKey: key() }), /does not exist in this department/);
  });

  it("voiding the only handover of a request puts the request back to waiting", async () => {
    const req = await db.cashRequest.findFirst({ where: { departmentId: o.deptA.id, fromKey: today() } });
    const handover = await db.cashHandover.findFirst({ where: { cashRequestId: req.id } });
    await loginAs(o.manager.id);
    ok(await voidRecord({ transactionId: handover.transactionId, reason: "Wrong amount" }));
    expect((await db.cashRequest.findUnique({ where: { id: req.id } })).status).toBe("OPEN");
  });

  it("the Boss cancels a waiting request (head notified); a cancelled request cannot be answered", async () => {
    await loginAs(o.boss.id);
    const req = await db.cashRequest.findFirst({ where: { departmentId: o.deptA.id, fromKey: yesterday() } });
    ok(await cancelCashRequestAction({ requestId: req.id }));
    fails(await cancelCashRequestAction({ requestId: req.id }), /still waiting/);
    expect(await db.notification.findFirst({ where: { userId: o.manager.id, kind: "CASH_REQUEST_CANCELLED" } })).toBeTruthy();
    await loginAs(o.manager.id);
    fails(await recordHandover({ departmentId: o.deptA.id, amount: 100, cashRequestId: req.id, idempotencyKey: key() }), /cancelled/);
    fails(await cancelCashRequestAction({ requestId: req.id }), /Boss/);
  });
});
