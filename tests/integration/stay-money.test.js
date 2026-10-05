import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupStayOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { recordMoney } from "@/actions/money";
import { recordStayCashCount, saveRoom, validateExpense } from "@/actions/rooms";
import { summarizeMoney } from "@/lib/finance/money-math";

describe("assets bought are an investment, not a cost (pure)", () => {
  it("leave the cash but not the result", () => {
    const m = summarizeMoney([
      { type: "EXPENSE", amount: 10000, category: "stay-cleaning", paymentMethod: "CASH", status: "COMPLETED" },
      { type: "EXPENSE", amount: 250000, category: "stay-asset-purchase", paymentMethod: "CASH", status: "COMPLETED" },
    ]);
    expect(m).toMatchObject({ expenses: 10000, assetPurchases: 250000, moneyOut: 10000, result: -10000 });
    expect(m.cash.out).toBe(260000);
  });
});

describe.skipIf(!hasDb)("Executive Stay: expenses by apartment and their validation", () => {
  let o;
  let a1;
  beforeAll(async () => {
    o = await setupStayOrganization("Money");
    await loginAs(o.head.id);
    a1 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 1", nightlyRate: 30000 })).roomId;
  });

  it("an expense names its apartment (or none: shared), what it was, who was paid and who authorized it", async () => {
    const base = { departmentId: o.stay.id, type: "EXPENSE", amount: 15000, category: "stay-cleaning", idempotencyKey: key() };
    fails(await recordMoney({ ...base }), /Describe the expense/);
    fails(await recordMoney({ ...base, description: "Deep cleaning" }), /person or vendor paid/);
    fails(await recordMoney({ ...base, description: "Deep cleaning", counterparty: "CleanCo" }), /who authorized/);
    fails(await recordMoney({ ...base, category: "stay-asset-purchase", description: "TV", counterparty: "Shop", authorizedByName: "Boss" }), /Maintenance or Assets page/);
    const e = ok(await recordMoney({ ...base, description: "Deep cleaning", counterparty: "CleanCo", authorizedByName: "Mr Boss", roomId: a1 }));
    const t = await db.transaction.findUnique({ where: { id: e.transactionId } });
    expect(t).toMatchObject({ roomId: a1, counterparty: "CleanCo", authorizedByName: "Mr Boss", validatedAt: null });
    ok(await recordMoney({ departmentId: o.stay.id, type: "EXPENSE", amount: 20000, category: "opex-electricity", description: "Electricity bill", counterparty: "ENEO", authorizedByName: "Mr Boss", idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.stay.id, type: "OTHER_INCOME", amount: 5000, category: "stay-extra-services", description: "Laundry", roomId: a1, idempotencyKey: key() }));
  });

  it("validated by the Boss or another head, never by the person who recorded it", async () => {
    const e = await db.transaction.findFirst({ where: { departmentId: o.stay.id, category: "stay-cleaning" } });
    fails(await validateExpense({ departmentId: o.stay.id, transactionId: e.id }), /Another person validates your expense/);
    await loginAs(o.head2.id);
    ok(await validateExpense({ departmentId: o.stay.id, transactionId: e.id, note: "Receipt seen" }));
    fails(await validateExpense({ departmentId: o.stay.id, transactionId: e.id }), /already validated/);
    const bill = await db.transaction.findFirst({ where: { departmentId: o.stay.id, category: "opex-electricity" } });
    await loginAs(o.boss.id);
    ok(await validateExpense({ departmentId: o.stay.id, transactionId: bill.id }));
    const inc = await db.transaction.findFirst({ where: { departmentId: o.stay.id, type: "OTHER_INCOME" } });
    fails(await validateExpense({ departmentId: o.stay.id, transactionId: inc.id }), /Only expenses/);
    const after = await db.transaction.findUnique({ where: { id: e.id } });
    expect(after).toMatchObject({ validatedById: o.head2.id, validationNote: "Receipt seen" });
  });

  it("the cash count of the guest house: a difference needs an explanation", async () => {
    await loginAs(o.head.id);
    // Drawer: +5 000 income − 15 000 − 20 000 expenses (opening float 0) → should hold −30 000 → counted 0 is a difference.
    fails(await recordStayCashCount({ departmentId: o.stay.id, countedCash: 0 }), /explain it in the notes/);
    ok(await recordStayCashCount({ departmentId: o.stay.id, countedCash: 0, notes: "Expenses paid from the head's pocket" }));
    expect(await db.venueCashCount.count({ where: { departmentId: o.stay.id } })).toBe(1);
  });
});
