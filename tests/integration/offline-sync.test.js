import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, loginAs, ok, setupOrganization, today, yesterday, uid } from "../support/fixtures";
import { cookieJar } from "../support/request-context";
import { db } from "@/lib/prisma";
import { POST as sync } from "@/app/api/sync/route";
import { POST as upload } from "@/app/api/attachments/route";
import { GET as health } from "@/app/api/health/route";
import { addDish } from "@/actions/menu-stock";
import { recordSale } from "@/actions/sales";
import { operationInstant, MAX_OFFLINE_DAYS } from "@/lib/operations/execute";
import { toDateKey, addDaysToKey } from "@/lib/timezone";

const k = () => `op${uid()}xxxxxxxx`.replace(/[^A-Za-z0-9_-]/g, "");
const ref = (key, field) => ({ $ref: key, field });

/** Sends a batch as a device would (same origin, the signed-in person's cookies). */
async function send(ops, { origin = "http://localhost:3000" } = {}) {
  const req = new Request("http://localhost:3000/api/sync", {
    method: "POST",
    headers: { "content-type": "application/json", host: "localhost:3000", origin },
    body: JSON.stringify({ ops }),
  });
  const res = await sync(req);
  return { status: res.status, body: await res.json() };
}
const byKey = (body) => Object.fromEntries(body.results.map((r) => [r.key, r]));
const plates = async (id) => Number((await db.menuItem.findUnique({ where: { id } })).currentQuantity);

describe("operation dates (pure)", () => {
  const tz = "Africa/Douala";
  const now = new Date("2026-09-29T15:00:00Z");
  it("uses the device time when it falls on the requested day (or no day was chosen)", () => {
    expect(operationInstant({ occurredAt: "2026-09-29T09:30:00Z", timeZone: tz, now }).toISOString()).toBe("2026-09-29T09:30:00.000Z");
    expect(operationInstant({ occurredAt: "2026-09-28T20:00:00Z", timeZone: tz, now }).toISOString()).toBe("2026-09-28T20:00:00.000Z");
    expect(operationInstant({ dateKey: "2026-09-28", occurredAt: "2026-09-28T20:00:00Z", timeZone: tz, now }).toISOString()).toBe("2026-09-28T20:00:00.000Z");
  });
  it("clamps a device clock ahead of the server, refuses the future and very old records", () => {
    expect(operationInstant({ occurredAt: "2026-09-29T18:00:00Z", timeZone: tz, now }).toISOString()).toBe(now.toISOString());
    expect(() => operationInstant({ dateKey: "2026-09-30", timeZone: tz, now })).toThrow(/future/);
    expect(() => operationInstant({ occurredAt: new Date(now.getTime() - (MAX_OFFLINE_DAYS + 1) * 86400000).toISOString(), timeZone: tz, now })).toThrow(/days ago/);
  });
  it("a past day chosen on the page without device time is dated at noon of that day", () => {
    const at = operationInstant({ dateKey: "2026-09-27", timeZone: tz, now });
    expect(toDateKey(at, tz)).toBe("2026-09-27");
  });
});

describe.skipIf(!hasDb)("offline sync: /api/sync applies a device's outbox exactly once, in order", () => {
  let o;
  beforeAll(async () => {
    o = await setupOrganization("Sync");
    await loginAs(o.manager.id);
  });

  it("the health check answers without a session", async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });

  it("applies a whole offline session: a new dish, sales of it, a credit sale, its repayment and an undo", async () => {
    const dishKey = k();
    const sale1 = k();
    const credit = k();
    const repay = k();
    const undo = k();
    const ops = [
      { key: dishKey, kind: "dish.create", input: { departmentId: o.deptA.id, name: "Offline stew", unitPrice: 1500, openingPlates: 10 }, occurredAt: new Date().toISOString() },
      { key: sale1, kind: "sale.record", input: { departmentId: o.deptA.id, lines: [{ dishId: ref(dishKey, "dishId"), quantity: 3 }], paymentMethod: "CASH" }, occurredAt: new Date().toISOString() },
      { key: credit, kind: "sale.record", input: { departmentId: o.deptA.id, lines: [{ dishId: ref(dishKey, "dishId"), quantity: 2 }], paymentMethod: "CREDIT", debtor: { name: "Offline customer" } }, occurredAt: new Date().toISOString() },
      { key: repay, kind: "debt.repay", input: { departmentId: o.deptA.id, debtId: ref(credit, "debtId"), amount: 1000, paymentMethod: "CASH" }, occurredAt: new Date().toISOString() },
      { key: undo, kind: "record.void", input: { transactionId: ref(sale1, "transactionId"), reason: "Entered by mistake" }, occurredAt: new Date().toISOString() },
    ];
    const { status, body } = await send(ops);
    expect(status).toBe(200);
    expect(body.results.map((r) => r.status)).toEqual(["applied", "applied", "applied", "applied", "applied"]);
    const r = byKey(body);
    const dishId = r[dishKey].result.dishId;
    expect(await plates(dishId)).toBe(8); // 10 − 3 − 2 + 3 (undo)
    expect(r[sale1].result.referenceNo).toMatch(/^S-\d{4}$/);
    const debt = await db.debt.findUnique({ where: { id: r[credit].result.debtId } });
    expect(Number(debt.amountPaid)).toBe(1000);
    expect((await db.transaction.findUnique({ where: { id: r[sale1].result.transactionId } })).status).toBe("VOIDED");
    expect(r[sale1].appliedAt).toBeGreaterThan(0);

    // The device did not get the answer and sends everything again: nothing is recorded twice.
    const again = await send(ops);
    expect(again.body.results.map((x) => x.status)).toEqual(["duplicate", "duplicate", "duplicate", "duplicate", "duplicate"]);
    expect(byKey(again.body)[sale1].result.referenceNo).toBe(r[sale1].result.referenceNo);
    expect(await plates(dishId)).toBe(8);
    expect(await db.transaction.count({ where: { departmentId: o.deptA.id, type: "SALE" } })).toBe(2);
    expect(await db.syncOperation.count({ where: { organizationId: o.org.id, key: { in: ops.map((x) => x.key) } } })).toBe(5);
  });

  it("two copies of the same operation at the same moment record it once", async () => {
    const dish = ok(await addDish({ departmentId: o.deptA.id, name: `Twin ${uid()}`, unitPrice: 1000, openingPlates: 5 })).dish;
    const key = k();
    const one = { key, kind: "sale.record", input: { departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 1 }] }, occurredAt: new Date().toISOString() };
    const [a, b] = await Promise.all([send([one]), send([one])]);
    const statuses = [a.body.results[0].status, b.body.results[0].status].sort();
    expect(statuses).toEqual(["applied", "duplicate"]);
    expect(a.body.results[0].result.referenceNo).toBe(b.body.results[0].result.referenceNo);
    expect(await plates(dish.id)).toBe(4);
  });

  it("dates an offline record when it was made (yesterday), not when it was sent", async () => {
    const dish = ok(await addDish({ departmentId: o.deptA.id, name: `Late ${uid()}`, unitPrice: 1000, openingPlates: 5 })).dish;
    const at = new Date(Date.now() - 26 * 3600 * 1000);
    const key = k();
    const { body } = await send([{ key, kind: "money.record", input: { departmentId: o.deptA.id, type: "EXPENSE", amount: 1200, category: "opex-gas" }, occurredAt: at.toISOString() }]);
    expect(body.results[0].status).toBe("applied");
    const t = await db.transaction.findUnique({ where: { id: body.results[0].result.transactionId } });
    expect(Math.abs(new Date(t.date).getTime() - at.getTime())).toBeLessThan(1000);
    expect(toDateKey(t.date)).toBe(toDateKey(at));
    expect(await plates(dish.id)).toBe(5);
  });

  it("a refused operation needs attention; operations that depend on it are refused too; the others go through", async () => {
    const dish = ok(await addDish({ departmentId: o.deptA.id, name: `Few ${uid()}`, unitPrice: 1000, openingPlates: 2 })).dish;
    const oversell = k();
    const undoIt = k();
    const fine = k();
    const { body } = await send([
      { key: oversell, kind: "sale.record", input: { departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 5 }] }, occurredAt: new Date().toISOString() },
      { key: undoIt, kind: "record.void", input: { transactionId: ref(oversell, "transactionId"), reason: "Mistake" }, occurredAt: new Date().toISOString() },
      { key: fine, kind: "sale.record", input: { departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 2 }] }, occurredAt: new Date().toISOString() },
    ]);
    const r = byKey(body);
    expect(r[oversell]).toMatchObject({ status: "rejected", code: "CONFLICT" });
    expect(r[oversell].error).toMatch(/Only 2 plate/);
    expect(r[undoIt]).toMatchObject({ status: "rejected", code: "DEPENDENCY" });
    expect(r[fine].status).toBe("applied");
    expect(await plates(dish.id)).toBe(0);
    // A refused operation left no trace: trying it again is evaluated again.
    expect(await db.syncOperation.count({ where: { key: oversell } })).toBe(0);
  });

  it("a sale after the report was sent (offline, in the same batch) is refused: the day is locked", async () => {
    await loginAs(o.multi.id);
    const dish = ok(await addDish({ departmentId: o.deptB.id, name: `Lock ${uid()}`, unitPrice: 1000, openingPlates: 5 })).dish;
    const sendKey = k();
    const after = k();
    const { body } = await send([
      { key: sendKey, kind: "report.send", input: { departmentId: o.deptB.id, dateKey: today(), countedCash: 0, notes: "Sent offline" }, occurredAt: new Date().toISOString() },
      { key: after, kind: "sale.record", input: { departmentId: o.deptB.id, lines: [{ dishId: dish.id, quantity: 1 }] }, occurredAt: new Date().toISOString() },
    ]);
    const r = byKey(body);
    expect(r[sendKey].status).toBe("applied");
    expect(r[sendKey].result.status).toBe("SUBMITTED");
    expect(r[after]).toMatchObject({ status: "rejected", code: "CONFLICT" });
    expect(await plates(dish.id)).toBe(5);
    await loginAs(o.manager.id);
  });

  it("an operation is checked like a form: permissions, departments of another person, unknown kinds, missing keys", async () => {
    // The Boss never records in a department.
    await loginAs(o.boss.id);
    const bossTry = k();
    let res = await send([{ key: bossTry, kind: "money.record", input: { departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas" } }]);
    expect(res.body.results[0]).toMatchObject({ status: "rejected", code: "FORBIDDEN" });
    // A head cannot record in a department he does not head.
    await loginAs(o.manager.id);
    res = await send([
      { key: k(), kind: "money.record", input: { departmentId: o.deptB.id, type: "EXPENSE", amount: 100, category: "opex-gas" } },
      { key: k(), kind: "users.delete", input: {} },
      { key: "short", kind: "sale.record", input: {} },
    ]);
    expect(res.body.results.map((x) => x.status)).toEqual(["rejected", "rejected", "rejected"]);
    expect(res.body.results[0].code).toBe("FORBIDDEN");
  });

  it("a reference to another organization's operation does not resolve", async () => {
    const other = await setupOrganization("Other");
    await loginAs(other.manager.id);
    const theirDish = k();
    const mine = await send([{ key: theirDish, kind: "dish.create", input: { departmentId: other.deptA.id, name: "Theirs", unitPrice: 1000, openingPlates: 3 } }]);
    expect(mine.body.results[0].status).toBe("applied");
    await loginAs(o.manager.id);
    const res = await send([{ key: k(), kind: "sale.record", input: { departmentId: o.deptA.id, lines: [{ dishId: ref(theirDish, "dishId"), quantity: 1 }] } }]);
    expect(res.body.results[0]).toMatchObject({ status: "rejected", code: "DEPENDENCY" });
  });

  it("refuses requests without a session or from another site", async () => {
    cookieJar.clear();
    expect((await send([])).status).toBe(401);
    await loginAs(o.manager.id);
    expect((await send([], { origin: "https://evil.example" })).status).toBe(403);
  });

  it("server actions and the outbox share the same keys (a sale recorded online is not recorded again by sync)", async () => {
    const dish = ok(await addDish({ departmentId: o.deptA.id, name: `Shared ${uid()}`, unitPrice: 1000, openingPlates: 4 })).dish;
    const key = k();
    const online = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 1 }], idempotencyKey: key }));
    const { body } = await send([{ key, kind: "sale.record", input: { departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 1 }] } }]);
    expect(body.results[0]).toMatchObject({ status: "duplicate" });
    expect(body.results[0].result.referenceNo).toBe(online.referenceNo);
    expect(await plates(dish.id)).toBe(3);
  });

  it("proof files kept on a device are uploaded once (a retry returns the same file) and linked by the record", async () => {
    const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 73, 72, 68, 82, 0, 0, 0, 1, 0, 0, 0, 1, 8, 6, 0, 0, 0, 31, 21, 196, 137, uid().length]);
    const post = async (file) => {
      const fd = new FormData();
      fd.append("departmentId", o.deptA.id);
      fd.append("file", file);
      const res = await upload(new Request("http://localhost:3000/api/attachments", { method: "POST", body: fd }));
      return { status: res.status, body: await res.json() };
    };
    const first = await post(new File([PNG], "slip.png", { type: "image/png" }));
    expect(first.status).toBe(200);
    const again = await post(new File([PNG], "slip.png", { type: "image/png" }));
    expect(again.body.id).toBe(first.body.id);
    const refused = await post(new File([new TextEncoder().encode("not an image")], "x.txt", { type: "text/plain" }));
    expect(refused.status).toBe(422);
    const key = k();
    const { body } = await send([{ key, kind: "money.record", input: { departmentId: o.deptA.id, type: "EXPENSE", amount: 900, category: "opex-gas", attachmentIds: [first.body.id] } }]);
    const linked = await db.attachment.findUnique({ where: { id: first.body.id } });
    expect(linked.entityId).toBe(body.results[0].result.transactionId);
  });

  it("a record dated too long ago on the device must be entered again", async () => {
    const { body } = await send([{ key: k(), kind: "money.record", input: { departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas" }, occurredAt: new Date(`${addDaysToKey(yesterday(), -60)}T12:00:00Z`).toISOString() }]);
    expect(body.results[0]).toMatchObject({ status: "rejected", code: "VALIDATION" });
  });
});
