import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupStayOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addRoomAssets, moveRoomAssets, saveRoom } from "@/actions/rooms";
import { assetMovements, assetRegister, movementTotals, registerTotals } from "@/lib/rooms/asset-queries";
import { summarizeMoney } from "@/lib/finance/money-math";

describe.skipIf(!hasDb)("Executive Stay: the asset register of each apartment", () => {
  let o;
  let a1;
  let a2;
  const line = async (roomId, name) => (await assetRegister({ departmentId: o.stay.id, includeEmpty: true })).find((l) => (l.roomId || null) === roomId && l.name === name);

  beforeAll(async () => {
    o = await setupStayOrganization("Assets");
    await loginAs(o.head.id);
    a1 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 1", nightlyRate: 30000 })).roomId;
    a2 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 2", nightlyRate: 30000 })).roomId;
  });

  it("assets already owned and bought from the drawer (an investment: cash out, not a cost)", async () => {
    ok(await addRoomAssets({ departmentId: o.stay.id, roomId: a1, name: "Chair", category: "CHAIR", quantity: 6, unitValue: 15000, alreadyOwned: true, idempotencyKey: key() }));
    fails(await addRoomAssets({ departmentId: o.stay.id, roomId: a1, name: "TV 43", category: "TV", quantity: 1, unitValue: 250000, paidFromDrawer: true, idempotencyKey: key() }), /person or vendor paid/);
    const tv = ok(await addRoomAssets({ departmentId: o.stay.id, roomId: a1, name: "TV 43", category: "TV", quantity: 1, unitValue: 250000, paidFromDrawer: true, counterparty: "Electro Shop", authorizedByName: "Mr Boss", idempotencyKey: key() }));
    expect(tv.transactionReference).toMatch(/^E-/);
    const t = await db.transaction.findFirst({ where: { departmentId: o.stay.id, category: "stay-asset-purchase" } });
    expect(t).toMatchObject({ roomId: a1, counterparty: "Electro Shop", authorizedByName: "Mr Boss" });
    expect(summarizeMoney([t])).toMatchObject({ expenses: 0, assetPurchases: 250000, result: 0 });
    // Adding the same item again joins its line.
    ok(await addRoomAssets({ departmentId: o.stay.id, roomId: a1, name: "chair", category: "CHAIR", quantity: 2, unitValue: 15000, alreadyOwned: true, idempotencyKey: key() }));
    expect((await line(a1, "Chair")).quantity).toBe(8);
  });

  it("moved, damaged, repaired, missing, replaced, removed: counts and values stay right", async () => {
    const chairs = await line(a1, "Chair");
    fails(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "transfer", quantity: 9, toRoomId: a2 }), /Only 8 Chair in good condition/);
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "transfer", quantity: 2, toRoomId: a2, note: "Guests needed more" }));
    expect((await line(a1, "Chair")).quantity).toBe(6);
    expect((await line(a2, "Chair")).quantity).toBe(2);
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "damaged", quantity: 2, note: "Broken legs" }));
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "repaired", quantity: 1, cost: 5000, paidFromDrawer: true, counterparty: "Carpenter", authorizedByName: "Mr Boss", idempotencyKey: key() }));
    const repair = await db.transaction.findFirst({ where: { departmentId: o.stay.id, category: "stay-repairs" } });
    expect(repair).toMatchObject({ roomId: a1, amount: expect.anything() });
    expect(Number(repair.amount)).toBe(5000);
    fails(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "missing", quantity: 1 }), /Say what is known/);
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "missing", quantity: 1, note: "After guest RB-0003" }));
    // Replaced: the damaged one leaves (loss), a new one is bought at a new value into its own line.
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "replaced", quantity: 1, newUnitValue: 18000, note: "Beyond repair" }));
    const now = await line(a1, "Chair");
    expect(now).toMatchObject({ quantity: 4, damaged: 0 });
    expect((await assetRegister({ departmentId: o.stay.id, roomId: a1 })).find((l) => l.name === "Chair" && l.unitValue === 18000).quantity).toBe(1);
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.id, kind: "removed", quantity: 1, note: "Sold" }));
    const lines = await assetRegister({ departmentId: o.stay.id });
    const totals = registerTotals(lines);
    // Apartment 1: 3 chairs × 15 000 + 1 × 18 000 + TV 250 000; Apartment 2: 2 × 15 000.
    expect(totals.byRoom[a1].value).toBe(3 * 15000 + 18000 + 250000);
    expect(totals.byRoom[a2].value).toBe(30000);
    const mt = movementTotals(await assetMovements({ departmentId: o.stay.id }));
    expect(mt).toMatchObject({ missing: 1, replaced: 1, removed: 1, repaired: 1, repairCost: 5000, transfers: 2, loss: 3 * 15000 });
  });

  it("another business cannot touch the register", async () => {
    const other = await setupStayOrganization("Other");
    const chairs = await line(a1, "Chair");
    await loginAs(other.head.id);
    fails(await moveRoomAssets({ departmentId: other.stay.id, assetId: chairs.id, kind: "damaged", quantity: 1 }), /Asset not found/);
  });
});
