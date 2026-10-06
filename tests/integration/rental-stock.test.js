import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupRentalOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { adjustRentalItem, archiveRentalItem, saveRentalItem } from "@/actions/rental";
import { setHeadRights } from "@/actions/organization";
import { voidRecord, recordMoney } from "@/actions/money";
import { countersFromMovements, inStock } from "@/lib/rental/stock-math";
import { stockSheet, stockTotals } from "@/lib/rental/item-queries";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

/** Every stock line's counters equal the sum of its movements. */
async function ledgerMatches(departmentId) {
  const items = await db.rentalItem.findMany({ where: { departmentId }, include: { movements: true } });
  for (const i of items) {
    expect(countersFromMovements(i.movements), i.name).toEqual({ owned: i.owned, out: i.out, damaged: i.damaged, inRepair: i.inRepair, missing: i.missing });
  }
  return items.length;
}

describe.skipIf(!hasDb)("event rental: the stock sheet", () => {
  let o;
  let chairs;
  beforeAll(async () => {
    o = await setupRentalOrganization("Stock");
  });

  it("adds items with their opening count; codes come from the name and are unique", async () => {
    await loginAs(o.head.id, o.deco.id);
    const a = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Chairs", category: "Chairs", rentalPrice: 500, purchasePrice: 15000, openingQuantity: 300, location: "Store A", lowStockLevel: 50 }));
    expect(a.code).toBe("CHR-001");
    const b = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Chairs gold", category: "Chairs", rentalPrice: 1000, purchasePrice: 25000, openingQuantity: 100 }));
    expect(b.code).toBe("CHR-002");
    ok(await saveRentalItem({ departmentId: o.deco.id, name: "Tables", category: "Tables", rentalPrice: 5000, purchasePrice: 40000, replacementValue: 45000, openingQuantity: 30 }));
    fails(await saveRentalItem({ departmentId: o.deco.id, name: "chairs" }), /already exists/);
    fails(await saveRentalItem({ departmentId: o.deco.id, name: "Plates", code: "CHR-001" }), /already used by Chairs/);
    fails(await saveRentalItem({ departmentId: o.deco.id, name: "Plates", rentalPrice: -5 }), /whole number/);
    fails(await saveRentalItem({ departmentId: o.deco.id, name: "Plates", code: "bad code!" }), /letters, digits/);
    chairs = await db.rentalItem.findFirst({ where: { departmentId: o.deco.id, code: "CHR-001" } });
    expect(chairs).toMatchObject({ owned: 300, rentalPrice: 500, location: "Store A" });
    const opening = await db.rentalMovement.findFirst({ where: { itemId: chairs.id } });
    expect(opening).toMatchObject({ kind: "OPENING", quantity: 300, dOwned: 300, value: 300 * 15000, referenceNo: "SM-0001" });
  });

  it("edits details without touching quantities", async () => {
    ok(await saveRentalItem({ departmentId: o.deco.id, id: chairs.id, name: "Chairs", category: "Chairs", rentalPrice: 600, purchasePrice: 15000, openingQuantity: 999 }));
    expect(await db.rentalItem.findUnique({ where: { id: chairs.id } })).toMatchObject({ owned: 300, rentalPrice: 600, code: "CHR-001" });
  });

  it("corrects a count (reason required) and moves items to another place", async () => {
    fails(await adjustRentalItem({ departmentId: o.deco.id, itemId: chairs.id, kind: "count", counted: 297 }), /reason/);
    fails(await adjustRentalItem({ departmentId: o.deco.id, itemId: chairs.id, kind: "count", counted: 300, reason: "count" }), /already 300/);
    expect(ok(await adjustRentalItem({ departmentId: o.deco.id, itemId: chairs.id, kind: "count", counted: 297, reason: "Stock count 30 Sept" })).change).toBe(-3);
    ok(await adjustRentalItem({ departmentId: o.deco.id, itemId: chairs.id, kind: "transfer", toLocation: "Store B" }));
    const c = await db.rentalItem.findUnique({ where: { id: chairs.id } });
    expect(c).toMatchObject({ owned: 297, location: "Store B" });
    expect(inStock(c)).toBe(297);
  });

  it("lists, searches and totals the stock; flags low lines", async () => {
    const all = await stockSheet({ departmentId: o.deco.id });
    expect(all.map((i) => i.code)).toEqual(["CHR-001", "CHR-002", "TBL-001"]);
    expect(stockTotals(all)).toMatchObject({ lines: 3, owned: 427, inStock: 427, value: 297 * 15000 + 100 * 25000 + 30 * 40000 });
    expect((await stockSheet({ departmentId: o.deco.id, q: "store b" })).map((i) => i.code)).toEqual(["CHR-001"]);
    expect((await stockSheet({ departmentId: o.deco.id, category: "Tables" }))[0].lossValue).toBe(45000);
    await loginAs(o.head.id, o.deco.id);
    const plates = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Plates", category: "Tableware", rentalPrice: 200, openingQuantity: 40, lowStockLevel: 50 }));
    expect((await stockSheet({ departmentId: o.deco.id, status: "low" })).map((i) => i.id)).toEqual([plates.itemId]);
  });

  it("archives with a reason (history kept) and brings back; per-person rights decide who may", async () => {
    const tables = await db.rentalItem.findFirst({ where: { departmentId: o.deco.id, code: "TBL-001" } });
    // The Boss takes the right to archive away from the second head.
    await loginAs(o.boss.id);
    ok(await setHeadRights({ employeeId: o.head2.id, departmentId: o.deco.id, grants: ["APPROVE", "EXPORT"] }));
    fails(await setHeadRights({ employeeId: o.boss.id, departmentId: o.deco.id, grants: [] }), /does not head|always/);
    await loginAs(o.head2.id, o.deco.id);
    fails(await archiveRentalItem({ departmentId: o.deco.id, itemId: tables.id, reason: "Old" }), /role does not allow/);
    await loginAs(o.head.id, o.deco.id);
    fails(await archiveRentalItem({ departmentId: o.deco.id, itemId: tables.id }), /reason/);
    ok(await archiveRentalItem({ departmentId: o.deco.id, itemId: tables.id, reason: "All sold" }));
    expect((await stockSheet({ departmentId: o.deco.id })).map((i) => i.code)).not.toContain("TBL-001");
    expect((await stockSheet({ departmentId: o.deco.id, status: "archived" })).map((i) => i.code)).toEqual(["TBL-001"]);
    fails(await adjustRentalItem({ departmentId: o.deco.id, itemId: tables.id, kind: "count", counted: 1, reason: "x x x" }), /archived/);
    ok(await archiveRentalItem({ departmentId: o.deco.id, itemId: tables.id, restore: true }));
    expect(await db.auditEvent.count({ where: { entityId: tables.id, action: { in: ["RENTAL_ITEM_ARCHIVED", "RENTAL_ITEM_RESTORED"] } } })).toBe(2);
  });

  it("rights also limit voids: a head without it cannot void a money record", async () => {
    await loginAs(o.head.id, o.deco.id);
    const r = ok(await recordMoney({ departmentId: o.deco.id, type: "EXPENSE", amount: 2000, category: "rental-fuel", paymentMethod: "CASH", description: "Fuel for the van", counterparty: "Total", idempotencyKey: key() }));
    fails(await recordMoney({ departmentId: o.deco.id, type: "EXPENSE", amount: 2000, category: "rental-fuel", description: "", counterparty: "Total", idempotencyKey: key() }), /Describe/);
    await loginAs(o.head2.id, o.deco.id);
    fails(await voidRecord({ transactionId: r.transactionId, reason: "Wrong amount" }), /role does not allow/);
    await loginAs(o.head.id, o.deco.id);
    ok(await voidRecord({ transactionId: r.transactionId, reason: "Wrong amount" }));
  });

  it("other departments cannot touch this stock", async () => {
    const other = await setupRentalOrganization("Other");
    await loginAs(other.head.id, other.deco.id);
    fails(await adjustRentalItem({ departmentId: other.deco.id, itemId: chairs.id, kind: "count", counted: 1, reason: "steal" }), /not found/);
    fails(await adjustRentalItem({ departmentId: o.deco.id, itemId: chairs.id, kind: "count", counted: 1, reason: "steal" }), /not found|not assigned/i);
  });

  it("every line's counters equal the sum of its movements", async () => {
    expect(await ledgerMatches(o.deco.id)).toBeGreaterThan(0);
  });
});
