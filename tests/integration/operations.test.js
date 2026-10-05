import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupOrganization, today, yesterday } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDish, editDish, removeDish, restoreRemovedDish, addStockToDish, correctDishCount, setDayOpeningStock, voidStockRecord } from "@/actions/menu-stock";
import { recordSale } from "@/actions/sales";
import { recordMoney, recordPurchase, voidRecord } from "@/actions/money";
import { recordDebt, recordOldDebt, recordRepayment, cancelOldDebt } from "@/actions/debts";
import { sendReportToBoss, reviewReport } from "@/actions/daily-report";
import { createDepartment, updateDepartment, updateEmployee } from "@/actions/organization";
import { loadDayStock } from "@/lib/restaurant/stock-service";
import { buildDailyReport } from "@/lib/reports/daily-report";

const plates = async (id) => Number((await db.menuItem.findUnique({ where: { id } })).currentQuantity);

describe.skipIf(!hasDb)("menu & stock", () => {
  let o;
  let fish;
  beforeAll(async () => {
    o = await setupOrganization("Stock");
    await loginAs(o.manager.id);
    fish = ok(await addDish({ departmentId: o.deptA.id, name: "Fried fish", unitPrice: 3000, openingPlates: 10, lowStockLevel: 3 })).dish;
  });

  it("adds a dish with its opening plates (reference A-…) and refuses duplicates and bad input", async () => {
    expect(await plates(fish.id)).toBe(10);
    fails(await addDish({ departmentId: o.deptA.id, name: "fried FISH", unitPrice: 100 }), /already on the menu/);
    fails(await addDish({ departmentId: o.deptA.id, name: "Soup", unitPrice: 0 }), /Unit price/);
    fails(await addDish({ departmentId: o.deptA.id, name: "Soup", unitPrice: 1000, openingPlates: 2.5 }), /whole number/);
    const mv = await db.stockMovement.findFirst({ where: { menuItemId: fish.id } });
    expect(mv).toMatchObject({ type: "OPENING", referenceNo: "A-0001" });
  });

  it("edits name and price (audited); only this department's heads can", async () => {
    ok(await editDish({ departmentId: o.deptA.id, id: fish.id, name: "Fried fish & plantain", unitPrice: 3500 }));
    const audit = await db.auditEvent.findFirst({ where: { entityId: fish.id, action: "DISH_UPDATED" } });
    expect(Number(audit.beforeJson.unitPrice)).toBe(3000);
    expect(Number(audit.afterJson.unitPrice)).toBe(3500);
    await loginAs(o.multi.id); // heads other departments
    fails(await editDish({ departmentId: o.deptA.id, id: fish.id, unitPrice: 1 }), /not assigned/);
    fails(await addStockToDish({ departmentId: o.deptA.id, dishId: fish.id, plates: 5 }), /not assigned/);
    await loginAs(o.boss.id); // oversees, does not record
    fails(await editDish({ departmentId: o.deptA.id, id: fish.id, unitPrice: 1 }), /does not allow/);
    await loginAs(o.manager.id);
  });

  it("adds stock with a new dish created inline", async () => {
    const res = ok(await addStockToDish({ departmentId: o.deptA.id, newDish: { name: "Rice & stew", unitPrice: 2000 }, plates: 6 }));
    expect(res.createdDish.name).toBe("Rice & stew");
    expect(await plates(res.createdDish.id)).toBe(6);
  });

  it("corrects a count (with reason) and records spoiled plates; refuses a count that equals the system", async () => {
    fails(await correctDishCount({ departmentId: o.deptA.id, dishId: fish.id, counted: 10, reasonType: "COUNT" }), /matches the system/);
    ok(await correctDishCount({ departmentId: o.deptA.id, dishId: fish.id, counted: 8, reasonType: "SPOILED" }));
    ok(await correctDishCount({ departmentId: o.deptA.id, dishId: fish.id, counted: 9, reasonType: "COUNT" }));
    fails(await correctDishCount({ departmentId: o.deptA.id, dishId: fish.id, counted: 5, reasonType: "OTHER" }), /Describe the reason/);
    const day = await loadDayStock({ departmentId: o.deptA.id, dateKey: today() });
    const row = day.rows.find((r) => r.dishId === fish.id);
    expect(row).toMatchObject({ opening: 0, added: 10, spoiled: 2, corrected: 1, closing: 9, value: 31500 });
    expect(day.showSpoiled && day.showCorrected).toBe(true);
  });

  it("opening stock cannot go below what was already sold from that day on", async () => {
    await loginAs(o.cashier.id);
    ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: fish.id, quantity: 7 }], idempotencyKey: key() }));
    await loginAs(o.manager.id);
    // A dish whose day opened with 5 plates and sold 4: the opening cannot be lowered below 4.
    const soup = ok(await addDish({ departmentId: o.deptA.id, name: "Soup", unitPrice: 1000 })).dish;
    ok(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: today(), reason: "Morning count", entries: [{ dishId: soup.id, actual: 5 }] }));
    await loginAs(o.cashier.id);
    ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: soup.id, quantity: 4 }], idempotencyKey: key() }));
    await loginAs(o.manager.id);
    fails(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: today(), reason: "Recount", entries: [{ dishId: soup.id, actual: 3 }] }), /cannot be lower than 4/);
    ok(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: today(), reason: "Recount", entries: [{ dishId: soup.id, actual: 4 }] }));
    expect(await plates(soup.id)).toBe(0);
    const soupRow = (await loadDayStock({ departmentId: o.deptA.id, dateKey: today() })).rows.find((r) => r.dishId === soup.id);
    expect(soupRow).toMatchObject({ opening: 4, sold: 4, closing: 0 });
    fails(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: today(), reason: "x", entries: [{ dishId: fish.id, actual: 3 }] }), /reason/);
    ok(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: today(), reason: "Found 3 plates", entries: [{ dishId: fish.id, actual: 3 }] }));
    expect(await plates(fish.id)).toBe(5);
    const row = (await loadDayStock({ departmentId: o.deptA.id, dateKey: today() })).rows.find((r) => r.dishId === fish.id);
    expect(row).toMatchObject({ opening: 3, closing: 5 });
  });

  it("voids a stock addition; cannot void below what was sold", async () => {
    const rice = await db.menuItem.findFirst({ where: { departmentId: o.deptA.id, name: "Rice & stew" } });
    const add = ok(await addStockToDish({ departmentId: o.deptA.id, dishId: rice.id, plates: 4 }));
    ok(await voidStockRecord({ departmentId: o.deptA.id, movementId: add.movement.id, reason: "Typed twice" }));
    expect(await plates(rice.id)).toBe(6);
    fails(await voidStockRecord({ departmentId: o.deptA.id, movementId: add.movement.id, reason: "again" }), /already voided/);
  });

  it("removing a dish needs 0 plates; a removed dish can be restored and cannot be sold", async () => {
    fails(await removeDish({ departmentId: o.deptA.id, dishId: fish.id }), /still has 5 plate/);
    ok(await correctDishCount({ departmentId: o.deptA.id, dishId: fish.id, counted: 0, reasonType: "OTHER", reasonText: "Dish removed" }));
    ok(await removeDish({ departmentId: o.deptA.id, dishId: fish.id }));
    fails(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: fish.id, quantity: 1 }], idempotencyKey: key() }), /removed from the menu/);
    ok(await restoreRemovedDish({ departmentId: o.deptA.id, dishId: fish.id }));
  });

  it("two cashiers can never sell more plates than exist (10 parallel sales of 1 for 5 plates)", async () => {
    const d = ok(await addDish({ departmentId: o.deptA.id, name: "Last plates", unitPrice: 1000, openingPlates: 5 })).dish;
    await loginAs(o.cashier.id);
    const results = await Promise.all(Array.from({ length: 10 }, () => recordSale({ departmentId: o.deptA.id, lines: [{ dishId: d.id, quantity: 1 }], idempotencyKey: key() })));
    expect(results.filter((r) => r.success)).toHaveLength(5);
    expect(await plates(d.id)).toBe(0);
    const refs = results.filter((r) => r.success).map((r) => r.data.referenceNo);
    expect(new Set(refs).size).toBe(5);
    await loginAs(o.manager.id);
  });

  it("the same idempotency key records a sale once", async () => {
    const d = ok(await addDish({ departmentId: o.deptA.id, name: "Once", unitPrice: 500, openingPlates: 3 })).dish;
    const k = key();
    const a = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: d.id, quantity: 1 }], idempotencyKey: k }));
    const b = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: d.id, quantity: 1 }], idempotencyKey: k }));
    expect(b.duplicate).toBe(true);
    expect(b.referenceNo).toBe(a.referenceNo);
    expect(await plates(d.id)).toBe(2);
  });
});

describe.skipIf(!hasDb)("money, purchases, debts and voids", () => {
  let o;
  let dish;
  beforeAll(async () => {
    o = await setupOrganization("Money");
    await loginAs(o.manager.id);
    dish = ok(await addDish({ departmentId: o.deptA.id, name: "Plate", unitPrice: 2500, openingPlates: 10 })).dish;
  });

  it("records each money type with its reference; categories must match the type", async () => {
    fails(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "rent-space", idempotencyKey: key() }), /category/);
    fails(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 10.5, category: "opex-gas", idempotencyKey: key() }), /whole number/);
    const d = ok(await recordMoney({ departmentId: o.deptA.id, type: "DISCOUNT", amount: 500, category: "discount-customer", idempotencyKey: key() }));
    expect(d.referenceNo).toBe("K-0001");
  });

  it("a purchase with item lines and plates added; voiding it removes both money and plates", async () => {
    const p = ok(await recordPurchase({ departmentId: o.deptA.id, supplier: "Market", lines: [{ description: "Fish 5 kg", quantity: 5, totalCost: 10000 }, { description: "Oil 1 L", quantity: 1, totalCost: 1500 }], stockAdds: [{ dishId: dish.id, plates: 4 }], idempotencyKey: key() }));
    const t = await db.transaction.findUnique({ where: { id: p.transactionId }, include: { purchase: { include: { lines: true } } } });
    expect(Number(t.amount)).toBe(11500);
    expect(t.purchase.lines.map((l) => l.description)).toEqual(["Fish 5 kg", "Oil 1 L"]);
    expect(await plates(dish.id)).toBe(14);
    fails(await recordPurchase({ departmentId: o.deptA.id, lines: [{ description: "Rice", quantity: 1, totalCost: 100 }], amount: 200, idempotencyKey: key() }), /add up to 100/);
    ok(await voidRecord({ transactionId: p.transactionId, reason: "Wrong supplier" }));
    expect(await plates(dish.id)).toBe(10);
    const after = await buildDailyReport({ organizationId: o.org.id, departmentId: o.deptA.id, dateKey: today() });
    expect(after.money.purchases).toBe(0);
  });

  it("every head of the department records everything, whatever their title", async () => {
    await loginAs(o.accountant.id); // titled "Accountant"
    ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 300, category: "opex-water", idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.deptA.id, type: "RENT_INCOME", amount: 300, category: "rent-space", idempotencyKey: key() }));
    ok(await recordPurchase({ departmentId: o.deptA.id, amount: 300, idempotencyKey: key() }));
    await loginAs(o.manager.id);
  });

  it("debts: with dishes (plates leave stock), amount only (unlisted items), old debt; repayments partial and full", async () => {
    const withDishes = ok(await recordDebt({ departmentId: o.deptA.id, debtor: { name: "Paul", phone: "677000000" }, lines: [{ dishId: dish.id, quantity: 2 }], idempotencyKey: key() }));
    expect(await plates(dish.id)).toBe(8);
    const amountOnly = ok(await recordDebt({ departmentId: o.deptA.id, debtor: { name: "paul" }, amount: 1500, description: "Takeaway delivered", idempotencyKey: key() }));
    const old = ok(await recordOldDebt({ departmentId: o.deptA.id, debtor: { name: "Marthe" }, amount: 7000, dateKey: yesterday() }));
    const debtors = await db.debtor.findMany({ where: { departmentId: o.deptA.id } });
    expect(debtors.map((d) => d.name).sort()).toEqual(["Marthe", "Paul"]);
    const paulDebts = await db.debt.findMany({ where: { departmentId: o.deptA.id, debtorName: "Paul" } });
    expect(paulDebts.map((d) => d.source).sort()).toEqual(["MANUAL", "MANUAL"]);
    const r = await buildDailyReport({ organizationId: o.org.id, departmentId: o.deptA.id, dateKey: today() });
    expect(r.money.salesGross).toBe(5000 + 1500);
    expect(r.money.unlistedSales).toBe(1500);
    expect(r.debts).toMatchObject({ opening: 7000, given: 6500, closing: 13500 });
    const debt = await db.debt.findFirst({ where: { referenceNo: withDishes.referenceNo, departmentId: o.deptA.id } });
    ok(await recordRepayment({ departmentId: o.deptA.id, debtId: debt.id, amount: 2000, paymentMethod: "MOMO", idempotencyKey: key() }));
    expect((await db.debt.findUnique({ where: { id: debt.id } })).status).toBe("PARTIALLY_PAID");
    ok(await recordRepayment({ departmentId: o.deptA.id, debtId: debt.id, amount: 3000, idempotencyKey: key() }));
    expect((await db.debt.findUnique({ where: { id: debt.id } })).status).toBe("PAID");
    fails(await recordRepayment({ departmentId: o.deptA.id, debtId: debt.id, amount: 1, idempotencyKey: key() }), /fully paid/);
    // Old debt cancellation; debts from sales are cancelled by voiding the sale.
    const oldDebt = await db.debt.findFirst({ where: { referenceNo: old.referenceNo, departmentId: o.deptA.id } });
    ok(await cancelOldDebt({ departmentId: o.deptA.id, debtId: oldDebt.id, reason: "Recorded by mistake" }));
    fails(await cancelOldDebt({ departmentId: o.deptA.id, debtId: debt.id, reason: "nope" }), /Void the sale/);
    expect(amountOnly.referenceNo).toMatch(/^D-/);
  });

  it("a credit sale with repayments cannot be voided until the repayments are voided", async () => {
    const s = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 1 }], paymentMethod: "CREDIT", debtor: { name: "Ali" }, idempotencyKey: key() }));
    const debt = await db.debt.findFirst({ where: { transactionId: s.transactionId } });
    const rep = ok(await recordRepayment({ departmentId: o.deptA.id, debtId: debt.id, amount: 1000, idempotencyKey: key() }));
    fails(await voidRecord({ transactionId: s.transactionId, reason: "mistake" }), /Void the repayments first/);
    const repTx = await db.transaction.findFirst({ where: { departmentId: o.deptA.id, referenceNo: rep.referenceNo } });
    ok(await voidRecord({ transactionId: repTx.id, reason: "mistake" }));
    ok(await voidRecord({ transactionId: s.transactionId, reason: "mistake" }));
    expect((await db.debt.findUnique({ where: { id: debt.id } })).status).toBe("CANCELLED");
  });

  it("the head corrects a previous day until its report is sent; the Boss never records or voids", async () => {
    const past = ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas", dateKey: yesterday(), idempotencyKey: key() }));
    await loginAs(o.boss.id);
    fails(await voidRecord({ transactionId: past.transactionId, reason: "old one" }), /does not allow/);
    fails(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas", idempotencyKey: key() }), /does not allow/);
    fails(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 1 }], idempotencyKey: key() }), /does not allow/);
    fails(await addDish({ departmentId: o.deptA.id, name: "Boss dish", unitPrice: 1000 }), /does not allow/);
    await loginAs(o.manager.id);
    ok(await voidRecord({ transactionId: past.transactionId, reason: "old one" }));
  });

  it("nothing can be recorded on a future date", async () => {
    fails(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas", dateKey: "2999-01-01", idempotencyKey: key() }), /future/);
  });
});

describe.skipIf(!hasDb)("report review, access and department types", () => {
  let o;
  beforeAll(async () => {
    o = await setupOrganization("Review");
    await loginAs(o.manager.id);
    ok(await addDish({ departmentId: o.deptA.id, name: "Dish", unitPrice: 1000, openingPlates: 5 }));
  });

  it("the Boss returns a report with a note, the head corrects and sends version 2, the Boss approves", async () => {
    ok(await sendReportToBoss({ departmentId: o.deptA.id, dateKey: yesterday(), countedCash: 0 }));
    await loginAs(o.boss.id);
    const report = await db.dailyReport.findFirst({ where: { departmentId: o.deptA.id } });
    fails(await reviewReport({ reportId: report.id, decision: "RETURNED" }), /Explain/);
    ok(await reviewReport({ reportId: report.id, decision: "RETURNED", note: "Add the gas expense" }));
    const returned = await db.notification.findFirst({ where: { userId: o.manager.id, kind: "REPORT_RETURNED" } });
    expect(returned.body).toBe("Add the gas expense");
    await loginAs(o.manager.id);
    ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 2000, category: "opex-gas", dateKey: yesterday(), idempotencyKey: key() }));
    const v2 = ok(await sendReportToBoss({ departmentId: o.deptA.id, dateKey: yesterday(), countedCash: 0 }));
    expect(v2.version).toBe(2);
    expect(v2.totals.moneyOut).toBe(2000);
    await loginAs(o.manager.id);
    fails(await reviewReport({ reportId: report.id, decision: "APPROVED" }), /Boss/);
    await loginAs(o.boss.id);
    ok(await reviewReport({ reportId: report.id, decision: "APPROVED" }));
  });

  it("a person with two departments of different types works in each; restaurant actions are refused for other types", async () => {
    await loginAs(o.multi.id);
    ok(await addDish({ departmentId: o.deptB.id, name: "Dish B", unitPrice: 1000 }));
    fails(await addDish({ departmentId: o.laundry.id, name: "Shirt", unitPrice: 500 }), /only available in restaurant departments/);
    fails(await addDish({ departmentId: o.deptA.id, name: "Intruder", unitPrice: 500 }), /not assigned/);
  });

  it("the Boss creates departments of every type with automatic short codes and a cash drawer", async () => {
    await loginAs(o.boss.id);
    const bar = ok(await createDepartment({ name: "Bar terrace", domain: "BAR" }));
    const rst = ok(await createDepartment({ name: "Restaurant C", domain: "RESTAURANT" }));
    expect(bar.code).toBe("BAR");
    expect(rst.code).toMatch(/^RST\d+$/);
    expect(await db.account.count({ where: { departmentId: rst.id } })).toBe(1);
    fails(await createDepartment({ name: "restaurant c", domain: "RESTAURANT" }), /already exists/);
    fails(await createDepartment({ name: "X", domain: "SPACESHIP" }), /Unknown department type/);
    // The type is locked once the department has dishes or records.
    fails(await updateDepartment({ departmentId: o.deptA.id, domain: "BAR" }), /cannot change/);
    ok(await updateDepartment({ departmentId: bar.id, domain: "SHOP" }));
  });

  it("the Boss reassigns a person; access follows the memberships", async () => {
    await loginAs(o.boss.id);
    ok(await updateEmployee({ employeeId: o.cashier.id, memberships: [{ departmentId: o.deptB.id, isPrimary: true }] }));
    await loginAs(o.cashier.id);
    const dishB = await db.menuItem.findFirst({ where: { departmentId: o.deptB.id } });
    // Access is granted (the refusal is about stock, not about the department).
    fails(await recordSale({ departmentId: o.deptB.id, lines: [{ dishId: dishB.id, quantity: 1 }], idempotencyKey: key() }), /Only 0 plate/);
    const dishA = await db.menuItem.findFirst({ where: { departmentId: o.deptA.id } });
    fails(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: dishA.id, quantity: 1 }], idempotencyKey: key() }), /not assigned/);
  });

  it("a Boss of another organization cannot touch this one", async () => {
    const other = await setupOrganization("Other");
    await loginAs(other.boss.id);
    fails(await addDish({ departmentId: o.deptA.id, name: "Hack", unitPrice: 1 }), /not found/);
    const report = await db.dailyReport.findFirst({ where: { departmentId: o.deptA.id } });
    fails(await reviewReport({ reportId: report.id, decision: "RETURNED", note: "x" }), /not found/);
  });
});
