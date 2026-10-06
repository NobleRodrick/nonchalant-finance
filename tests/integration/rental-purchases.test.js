import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupRentalOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { createRentalOrder, disposeRentalAsset, recordRentalPurchase, saveRentalAsset, saveRentalItem, voidRentalPurchase } from "@/actions/rental";
import { approveExpense, recordMoney, voidRecord } from "@/actions/money";
import { setHeadRights } from "@/actions/organization";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { assetRegister, depreciationOfPeriod, registerTotals } from "@/lib/assets/asset-queries";
import { summarizeMoney } from "@/lib/finance/money-math";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const today = toDateKey(new Date());

describe.skipIf(!hasDb)("event rental: expenses with approval, purchases into stock, assets and depreciation", () => {
  let o;
  let chairs;
  let wedding;
  beforeAll(async () => {
    o = await setupRentalOrganization("Purchases");
    await loginAs(o.head.id, o.deco.id);
    chairs = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Chairs", category: "Chairs", rentalPrice: 500, purchasePrice: 14000, openingQuantity: 300 })).itemId;
    wedding = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "John" }, eventType: "Wedding", eventDateKey: addDaysToKey(today, 5), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 100 }] })).orderId;
  });

  it("an expense of an event: category, description, payee, who spent it; approved by someone else", async () => {
    const e = ok(await recordMoney({ departmentId: o.deco.id, type: "EXPENSE", amount: 30000, category: "opex-transport", paymentMethod: "CASH", description: "Truck to the wedding venue", counterparty: "Transport Ndjock", spentByName: "Paul", rentalOrderId: wedding, idempotencyKey: key() }));
    const t = await db.transaction.findUnique({ where: { id: e.transactionId } });
    expect(t).toMatchObject({ rentalOrderId: wedding, receivedByName: "Paul", counterparty: "Transport Ndjock", validatedAt: null });
    fails(await approveExpense({ departmentId: o.deco.id, transactionId: e.transactionId }), /Another person validates/);
    // The second head approves it once the Boss gave the right… which every head has by default.
    await loginAs(o.boss.id);
    ok(await setHeadRights({ employeeId: o.head2.id, departmentId: o.deco.id, grants: ["EXPORT"] }));
    await loginAs(o.head2.id, o.deco.id);
    fails(await approveExpense({ departmentId: o.deco.id, transactionId: e.transactionId }), /role does not allow/);
    await loginAs(o.boss.id);
    ok(await setHeadRights({ employeeId: o.head2.id, departmentId: o.deco.id, grants: ["APPROVE", "EXPORT"] }));
    await loginAs(o.head2.id, o.deco.id);
    ok(await approveExpense({ departmentId: o.deco.id, transactionId: e.transactionId, note: "Receipt checked" }));
    expect(await db.transaction.findUnique({ where: { id: e.transactionId } })).toMatchObject({ validatedById: o.head2.id, validationNote: "Receipt checked" });
    fails(await recordMoney({ departmentId: o.deco.id, type: "EXPENSE", amount: 100, category: "rental-stock", description: "x", counterparty: "y", idempotencyKey: key() }), /Record this from/);
  });

  it("a purchase adds its units to the stock (an investment, not an expense) and can register them as an asset", async () => {
    await loginAs(o.head.id, o.deco.id);
    fails(await recordRentalPurchase({ departmentId: o.deco.id, supplier: "", lines: [{ itemId: chairs, quantity: 1, unitCost: 1 }] }), /supplier/);
    const p = ok(await recordRentalPurchase({
      departmentId: o.deco.id,
      supplier: "Meubles Akwa",
      paymentMethod: "BANK_TRANSFER",
      reference: "VIR-889",
      boughtByName: "Diva manager",
      lines: [
        { itemId: chairs, quantity: 100, unitCost: 15000, asset: { usefulLifeMonths: 60, method: "STRAIGHT_LINE" } },
        { newItem: { name: "Gold vases", category: "Vases & centrepieces", rentalPrice: 2000 }, quantity: 40, unitCost: 3500 },
      ],
      idempotencyKey: key(),
    }));
    expect(p).toMatchObject({ referenceNo: "P-0001", total: 1500000 + 140000, assets: ["AS-0001"] });
    expect(await db.rentalItem.findUnique({ where: { id: chairs } })).toMatchObject({ owned: 400, purchasePrice: 15000, supplier: "Meubles Akwa" });
    const vases = await db.rentalItem.findFirst({ where: { departmentId: o.deco.id, name: "Gold vases" } });
    expect(vases).toMatchObject({ code: "GLD-001", owned: 40, rentalPrice: 2000, purchasePrice: 3500 });
    const t = await db.transaction.findUnique({ where: { id: p.transactionId } });
    expect(t).toMatchObject({ type: "EXPENSE", category: "rental-stock", paymentMethod: "BANK_TRANSFER", counterparty: "Meubles Akwa" });
    const money = summarizeMoney([t]);
    expect(money).toMatchObject({ expenses: 0, assetPurchases: 1640000 });
    fails(await voidRecord({ transactionId: t.id, reason: "wrong" }), /void it from Purchases/);
  });

  it("the asset register computes depreciation; assets are added by hand too and disposed of", async () => {
    const reg = await assetRegister({ departmentId: o.deco.id, asOfKey: addDaysToKey(today, 31 * 6) });
    const a1 = reg.find((a) => a.code === "AS-0001");
    expect(a1).toMatchObject({ quantity: 100, cost: 1500000, rentalItem: { id: chairs } });
    expect(a1.value.monthly).toBe(25000);
    expect(a1.value.accumulated).toBe(6 * 25000);
    const van = ok(await saveRentalAsset({ departmentId: o.deco.id, name: "Toyota Hiace van", category: "Vehicles", purchaseDateKey: "2025-10-01", cost: 9000000, salvageValue: 1800000, usefulLifeMonths: 60, method: "DECLINING_BALANCE", responsibleName: "Paul" }));
    expect(van.code).toBe("AS-0002");
    fails(await saveRentalAsset({ departmentId: o.deco.id, name: "Bad", purchaseDateKey: "2025-10-01", cost: 100, salvageValue: 200, usefulLifeMonths: 12 }), /cannot be more/);
    const period = await depreciationOfPeriod({ departmentId: o.deco.id, fromKey: "2025-10-01", toKey: "2025-12-31" });
    expect(period.depreciation).toBe(300000 + 290000); // double-declining: 9 000 000 × 2/60, then 8 700 000 × 2/60
    ok(await disposeRentalAsset({ departmentId: o.deco.id, assetId: van.assetId, dateKey: "2026-04-01", reason: "Sold", disposalValue: 7000000 }));
    const reg2 = await assetRegister({ departmentId: o.deco.id, asOfKey: today, status: "all" });
    expect(reg2.find((a) => a.code === "AS-0002").disposalResult).not.toBe(0);
    expect(registerTotals(reg2).count).toBe(1);
  });

  it("a purchase recorded by mistake is voided: its units leave the stock, its asset is closed without depreciation", async () => {
    const purchase = await db.purchase.findFirst({ where: { departmentId: o.deco.id } });
    ok(await voidRentalPurchase({ departmentId: o.deco.id, purchaseId: purchase.id, reason: "Entered twice" }));
    expect(await db.rentalItem.findUnique({ where: { id: chairs } })).toMatchObject({ owned: 300 });
    expect((await db.transaction.findUnique({ where: { id: purchase.transactionId } })).status).toBe("VOIDED");
    const a1 = (await assetRegister({ departmentId: o.deco.id, asOfKey: addDaysToKey(today, 365), status: "all" })).find((a) => a.code === "AS-0001");
    expect(a1.value.accumulated).toBe(0);
    expect(a1.disposalResult).toBe(0);
    fails(await voidRentalPurchase({ departmentId: o.deco.id, purchaseId: purchase.id, reason: "again" }), /already void/);
  });
});
