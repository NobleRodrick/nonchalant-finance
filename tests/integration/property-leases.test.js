import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupPropertyOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { propertyOperation as op } from "@/actions/property";
import { voidRecord } from "@/actions/money";
import { toDateKey } from "@/lib/timezone";
import { addMonths, daysInMonth, monthOf } from "@/lib/property/rent-schedule";
import { loadAccounts } from "@/lib/property/accounts";
import { unitBoard } from "@/lib/property/unit-queries";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const TZ = "Africa/Douala";
const t = toDateKey(new Date(), TZ);
const m0 = monthOf(t);
const first = (m) => `${m}-01`;

async function account(leaseId) {
  const lease = await db.propertyLease.findUnique({ where: { id: leaseId } });
  return (await loadAccounts({ leases: [lease], todayKey: t })).get(leaseId);
}

/**
 * Place Étoilée & Main Building: offices with their charges, a tenant three months in arrears,
 * utilities from meter readings, payments allocated oldest first, a deposit kept apart, an advance,
 * a rent increase, maintenance, move-out with the deposit settled.
 */
describe.skipIf(!hasDb)("property rental: offices, contracts, rent, utilities, payments, deposits", () => {
  let o;
  let a12;
  let o01;
  let xyz;
  beforeAll(async () => {
    o = await setupPropertyOrganization();
    await loginAs(o.head.id, o.rentals.id);
  });

  it("the two buildings exist; offices are added with their rent, deposit and charge settings", async () => {
    expect([o.main.name, o.etoilee.name]).toEqual(["Main Building", "Place Étoilée"]);
    a12 = ok(await op("property.unit.save", { departmentId: o.rentals.id, buildingId: o.etoilee.id, name: "A12", floor: "1st", category: "Single office", size: "24.5", listRent: 150000, depositRequired: 300000, charges: [{ kind: "ELECTRICITY", method: "METER", rate: 100, lastReading: 1000, meterNumber: "ENEO-77" }, { kind: "WATER", method: "FIXED", rate: 10000 }, { kind: "CLEANING", method: "INCLUDED" }] })).unitId;
    o01 = ok(await op("property.unit.save", { departmentId: o.rentals.id, buildingId: o.main.id, name: "Office 01", listRent: 100000 })).unitId;
    fails(await op("property.unit.save", { departmentId: o.rentals.id, buildingId: o.etoilee.id, name: "a12", listRent: 1 }), /already has an office named/);
    fails(await op("property.unit.save", { departmentId: o.rentals.id, buildingId: o.main.id, name: "X", listRent: 5, charges: [{ kind: "WATER", method: "FIXED" }] }), /monthly amount/);
    const board = await unitBoard({ departmentId: o.rentals.id, todayKey: t });
    expect(board.map((u) => [u.name, u.building.name, u.status, u.listRent])).toEqual([["Office 01", "Main Building", "AVAILABLE", 100000], ["A12", "Place Étoilée", "AVAILABLE", 150000]]);
  });

  it("a contract lets the office; a second one on it is refused (no double allocation)", async () => {
    const lease = ok(await op("property.lease.create", { departmentId: o.rentals.id, unitId: a12, tenant: { name: "XYZ Company", phone: "677000111", identification: "RC/YAO/2020/B/123" }, startKey: first(addMonths(m0, -2)), dueDay: 1, status: "ACTIVE" }));
    xyz = lease.leaseId;
    expect(lease.referenceNo).toBe("LC-0001");
    fails(await op("property.lease.create", { departmentId: o.rentals.id, unitId: a12, tenant: { name: "Other" }, startKey: t }), /already let to XYZ Company/);
    const tenant = await db.venueClient.findFirst({ where: { departmentId: o.rentals.id, name: "XYZ Company" } });
    expect(tenant.identification).toBe("RC/YAO/2020/B/123");
    const board = await unitBoard({ departmentId: o.rentals.id, todayKey: t });
    expect(board.find((u) => u.id === a12)).toMatchObject({ status: "OCCUPIED", lease: { client: { name: "XYZ Company" } }, account: { outstanding: 450000, monthsOwed: 3 } });
  });

  it("three unpaid months stay separate debts; electricity from readings and water fixed are billed apart", async () => {
    let a = await account(xyz);
    expect(a.items.filter((i) => i.due).map((i) => [i.monthKey, i.balance])).toEqual([[addMonths(m0, -2), 150000], [addMonths(m0, -1), 150000], [m0, 150000]]);
    const elec = ok(await op("property.charge.add", { departmentId: o.rentals.id, leaseId: xyz, kind: "ELECTRICITY", monthKey: addMonths(m0, -1), currentReading: 1250, dueKey: t }));
    expect(elec).toMatchObject({ previousReading: 1000, units: 250, rate: 100, amount: 25000 });
    fails(await op("property.charge.add", { departmentId: o.rentals.id, leaseId: xyz, kind: "ELECTRICITY", monthKey: addMonths(m0, -1), currentReading: 1300 }), /already billed/);
    const month = ok(await op("property.charge.month", { departmentId: o.rentals.id, monthKey: addMonths(m0, -1) }));
    expect(month.billed.map((b) => [b.kind, b.amount])).toEqual([["WATER", 10000]]);
    expect(ok(await op("property.charge.month", { departmentId: o.rentals.id, monthKey: addMonths(m0, -1) })).billed).toEqual([]);
    await db.propertyCharge.updateMany({ where: { leaseId: xyz, kind: "WATER" }, data: { dueDate: new Date(`${t}T00:00:00Z`) } });
    a = await account(xyz);
    expect(a.byKind).toEqual({ RENT: 450000, ELECTRICITY: 25000, WATER: 10000 });
    expect(a.outstanding).toBe(485000);
  });

  it("a deposit is held apart (never income) and never above what is required", async () => {
    fails(await op("property.deposit.receive", { departmentId: o.rentals.id, leaseId: xyz, amount: 300001, idempotencyKey: key() }), /Only 300 000 FCFA of deposit is still due/);
    const d = ok(await op("property.deposit.receive", { departmentId: o.rentals.id, leaseId: xyz, amount: 300000, paymentMethod: "MOMO", reference: "MP.123", idempotencyKey: key() }));
    expect(d).toMatchObject({ referenceNo: "DP-0001", held: 300000, stillDue: 0 });
    expect((await account(xyz)).outstanding).toBe(485000);
  });

  it("a payment pays the oldest months first; a split chosen by hand is checked", async () => {
    const p = ok(await op("property.payment.record", { departmentId: o.rentals.id, leaseId: xyz, amount: 170000, idempotencyKey: key() }));
    expect(p).toMatchObject({ referenceNo: "RC-0001", previousBalance: 485000, remaining: 315000, advance: 0 });
    expect(p.covered.map((c) => [c.monthKey, c.amount])).toEqual([[addMonths(m0, -2), 150000], [addMonths(m0, -1), 20000]]);
    const charge = await db.propertyCharge.findFirst({ where: { leaseId: xyz, kind: "ELECTRICITY" } });
    fails(await op("property.payment.record", { departmentId: o.rentals.id, leaseId: xyz, amount: 30000, lines: [{ chargeId: charge.id, amount: 30000 }], idempotencyKey: key() }), /only 25000/);
    const p2 = ok(await op("property.payment.record", { departmentId: o.rentals.id, leaseId: xyz, amount: 25000, paymentMethod: "BANK_TRANSFER", reference: "VIR-9", lines: [{ chargeId: charge.id, amount: 25000 }], idempotencyKey: key() }));
    expect(p2.remaining).toBe(290000);
    const a = await account(xyz);
    expect(a.byKind).toEqual({ RENT: 280000, WATER: 10000 });
    expect(a.monthsOwed).toBe(2);
  });

  it("money beyond the debts is an advance that pays the next months", async () => {
    const lease = ok(await op("property.lease.create", { departmentId: o.rentals.id, unitId: o01, clientId: undefined, tenant: { name: "Tenant B", email: "b@test.local" }, startKey: first(m0), dueDay: 1, status: "ACTIVE" }));
    const p = ok(await op("property.payment.record", { departmentId: o.rentals.id, leaseId: lease.leaseId, amount: 250000, idempotencyKey: key() }));
    expect(p.covered.map((c) => [c.monthKey, c.amount])).toEqual([[m0, 100000], [addMonths(m0, 1), 100000], [addMonths(m0, 2), 50000]]);
    const a = await account(lease.leaseId);
    expect(a).toMatchObject({ outstanding: 0, status: "ADVANCE", paidAhead: 150000 });
    fails(await op("property.refund.record", { departmentId: o.rentals.id, leaseId: lease.leaseId, amount: 1000, reason: "Asked back", idempotencyKey: key() }), /no advance/);
  });

  it("a rent increase applies from its month; the old months keep their price", async () => {
    fails(await op("property.lease.rent", { departmentId: o.rentals.id, leaseId: xyz, amount: 180000, fromMonth: addMonths(m0, 1) }), /reason/);
    ok(await op("property.lease.rent", { departmentId: o.rentals.id, leaseId: xyz, amount: 180000, fromMonth: addMonths(m0, 1), note: "Yearly increase" }));
    const a = await account(xyz);
    expect(a.items.filter((i) => i.kind === "RENT").map((i) => i.amount)).toEqual([150000, 150000, 150000, 180000, 180000]);
  });

  it("part of a month can be forgiven (with a reason), it is not money", async () => {
    ok(await op("property.debt.waive", { departmentId: o.rentals.id, leaseId: xyz, monthKey: m0, amount: 10000, reason: "Water cut for 3 days" }));
    expect((await account(xyz)).byKind.RENT).toBe(270000);
  });

  it("maintenance: reported, approved, completed, paid from the drawer as an expense of the office, billed to the tenant", async () => {
    const r = ok(await op("property.maintenance.report", { departmentId: o.rentals.id, unitId: a12, title: "Leaking sink", reportedBy: "XYZ Company", priority: "URGENT" }));
    ok(await op("property.maintenance.step", { departmentId: o.rentals.id, maintenanceId: r.maintenanceId, step: "approve" }));
    fails(await op("property.maintenance.step", { departmentId: o.rentals.id, maintenanceId: r.maintenanceId, step: "approve" }), /cannot be approved now/);
    const done = ok(await op("property.maintenance.step", { departmentId: o.rentals.id, maintenanceId: r.maintenanceId, step: "complete", cost: 20000, technician: "Plumber Paul", pay: { paymentMethod: "CASH" }, chargeTenant: true, chargeAmount: 5000, idempotencyKey: key() }));
    expect(done).toMatchObject({ status: "COMPLETED", expense: expect.stringMatching(/^E-/), charge: expect.stringMatching(/^UB-/) });
    const expense = await db.transaction.findFirst({ where: { referenceNo: done.expense, departmentId: o.rentals.id } });
    expect(expense).toMatchObject({ category: "property-maintenance", propertyUnitId: a12, buildingId: o.etoilee.id });
    expect((await account(xyz)).byKind.MAINTENANCE).toBe(5000);
  });

  it("move-out: final inspection, damages and rent taken from the deposit, the rest refunded, office awaiting handover", async () => {
    const before = await account(xyz);
    const owed = before.outstanding; // 270 000 rent + 10 000 water + 5 000 repair
    expect(owed).toBe(285000);
    // Leaving today: this month's rent is prorated to the days used (less the 10 000 forgiven).
    const day = Number(t.slice(8, 10));
    const rentOwed = 130000 + Math.max(0, Math.round((150000 * day) / daysInMonth(m0)) - 10000);
    const refund = 300000 - 40000 - rentOwed;
    const end = ok(await op("property.lease.end", { departmentId: o.rentals.id, leaseId: xyz, moveOutKey: t, reason: "Contract ended", inspection: { condition: "FAIR", damageCost: 40000, rows: [{ area: "Door", condition: "NEEDS_REPAIR", note: "Lock broken" }] }, deposit: { damage: 40000, rent: rentOwed }, refund: { amount: refund, paymentMethod: "CASH" }, availableFromKey: t, repairs: "Change the lock", idempotencyKey: key() }));
    expect(end.depositUsed).toEqual([{ kind: "APPLIED_DAMAGE", amount: 40000 }, { kind: "APPLIED_RENT", amount: rentOwed }]);
    expect(end).toMatchObject({ depositRefunded: refund, depositHeld: 0, owedAfter: 15000, utilitiesOwed: 15000 }); // water + repair still owed
    const unit = await db.propertyUnit.findUnique({ where: { id: a12 } });
    expect(unit).toMatchObject({ state: "AWAITING_HANDOVER", condition: "FAIR" });
    const lease = await db.propertyLease.findUnique({ where: { id: xyz } });
    expect(lease.status).toBe("ENDED");
    // A new tenant only once management confirms the office is ready, and only after the move-out.
    fails(await op("property.lease.create", { departmentId: o.rentals.id, unitId: a12, tenant: { name: "Next" }, startKey: t, status: "ACTIVE" }), /not ready to move in|must start after/);
    ok(await op("property.unit.state", { departmentId: o.rentals.id, unitId: a12, state: "AVAILABLE" }));
    fails(await op("property.lease.create", { departmentId: o.rentals.id, unitId: a12, tenant: { name: "Next" }, startKey: t, status: "ACTIVE" }), /must start after/);
    const next = ok(await op("property.lease.create", { departmentId: o.rentals.id, unitId: a12, tenant: { name: "Next tenant" }, startKey: `${addMonths(m0, 1)}-01` }));
    expect((await unitBoard({ departmentId: o.rentals.id, todayKey: t })).find((u) => u.id === a12).status).toBe("RESERVED");
    ok(await op("property.lease.cancel", { departmentId: o.rentals.id, leaseId: next.leaseId, reason: "Changed their mind" }));
  });

  it("voiding a payment makes its months owed again; a deposit already used cannot be voided", async () => {
    const lease = await db.propertyLease.findFirst({ where: { departmentId: o.rentals.id, client: { name: "Tenant B" } } });
    const pay = await db.transaction.findFirst({ where: { leaseId: lease.id, category: "lease-payment" } });
    ok(await voidRecord({ transactionId: pay.id, reason: "Wrong tenant" }));
    expect((await account(lease.id)).outstanding).toBe(100000);
    const dep = await db.transaction.findFirst({ where: { leaseId: xyz, category: "lease-deposit" } });
    fails(await voidRecord({ transactionId: dep.id, reason: "Mistake" }), /already refunded or used/);
  });
});
