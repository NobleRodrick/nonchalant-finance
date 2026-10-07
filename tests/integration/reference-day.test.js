import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupOrganization, today, yesterday } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { updateDepartment } from "@/actions/organization";
import { addDish, addStockToDish, setDayOpeningStock } from "@/actions/menu-stock";
import { recordSale } from "@/actions/sales";
import { recordMoney, voidRecord } from "@/actions/money";
import { recordOldDebt, recordRepayment } from "@/actions/debts";
import { recordHandover, reviewHandover } from "@/actions/handovers";
import { sendReportToBoss, saveReportDraft } from "@/actions/daily-report";
import { buildDailyReport } from "@/lib/reports/daily-report";
import { buildStatements } from "@/lib/finance/statements";
import { dayPositions } from "@/lib/restaurant/stock-math";
import { addDaysToKey, dayBounds, startOfDateKey } from "@/lib/timezone";
import { checkLedger } from "../support/ledger-check";

/**
 * The reference day of the implementation plan (§10.4), recorded through the real server
 * actions. Every figure is hand-computed in the plan and asserted here.
 */
describe.skipIf(!hasDb)("reference day (plan §10.4)", () => {
  let o;
  let A;
  let B;
  let saleRefs = {};
  const D = today();

  beforeAll(async () => {
    o = await setupOrganization("RefDay");
    await loginAs(o.boss.id);
    ok(await updateDepartment({ departmentId: o.deptA.id, openingCashFloat: 10000 }));
    await loginAs(o.manager.id);
    A = ok(await addDish({ departmentId: o.deptA.id, name: "Dish A", unitPrice: 2000, openingPlates: 0 })).dish;
    B = ok(await addDish({ departmentId: o.deptA.id, name: "Dish B", unitPrice: 3000, openingPlates: 0 })).dish;
    // State at the start of D: A 20, B 10 plates (set as the opening of D), Customer 1 owes 9 000 since D−1.
    ok(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: D, reason: "Initial count", entries: [{ dishId: A.id, actual: 20 }, { dishId: B.id, actual: 10 }] }));
    ok(await recordOldDebt({ departmentId: o.deptA.id, dateKey: yesterday(), debtor: { name: "Customer 1" }, amount: 9000, description: "Old debt" }));
  });

  it("1. the head corrects Dish B's opening from 10 to 9", async () => {
    const res = ok(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: D, reason: "Morning count", entries: [{ dishId: A.id, actual: 20 }, { dishId: B.id, actual: 9 }] }));
    expect(res).toEqual([expect.objectContaining({ name: "Dish B", from: 10, to: 9 })]);
  });

  it("2. adds 10 plates of Dish A bought for 12 000 cash", async () => {
    const res = ok(await addStockToDish({ departmentId: o.deptA.id, dishId: A.id, plates: 10, bought: true, amountPaid: 12000, supplier: "Market", paymentMethod: "CASH", idempotencyKey: key() }));
    expect(res.movement.referenceNo).toBe("A-0001");
    expect(res.purchase.referenceNo).toBe("P-0001");
  });

  it("3–8. sales: cash, credit, discount, refused oversell, sale then void", async () => {
    await loginAs(o.cashier.id); // a head titled "Cashier"
    saleRefs.s1 = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: A.id, quantity: 15 }], paymentMethod: "CASH", idempotencyKey: key() }));
    saleRefs.s2 = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: A.id, quantity: 3 }], paymentMethod: "CREDIT", debtor: { name: "Customer 2" }, idempotencyKey: key() }));
    // A head of other departments cannot sell here.
    await loginAs(o.multi.id);
    fails(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: B.id, quantity: 8 }], idempotencyKey: key() }), /not assigned/);
    await loginAs(o.manager.id);
    saleRefs.s3 = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: B.id, quantity: 8 }], discountAmount: 1000, discountReason: "Promotion", idempotencyKey: key() }));
    await loginAs(o.cashier.id);
    fails(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: B.id, quantity: 2 }], idempotencyKey: key() }), /Only 1 plate\(s\) of "Dish B" left/);
    saleRefs.s4 = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: A.id, quantity: 1 }], idempotencyKey: key() }));
    // The Boss does not void; the department's heads do.
    await loginAs(o.boss.id);
    fails(await voidRecord({ transactionId: saleRefs.s4.transactionId, reason: "Entered twice" }), /does not allow/);
    await loginAs(o.manager.id);
    ok(await voidRecord({ transactionId: saleRefs.s4.transactionId, reason: "Entered twice" }));
    expect([saleRefs.s1.referenceNo, saleRefs.s2.referenceNo, saleRefs.s3.referenceNo, saleRefs.s4.referenceNo]).toEqual(["S-0001", "S-0002", "S-0003", "S-0004"]);
    expect(saleRefs.s2.debtReference).toBe("D-0002");
    expect(saleRefs.s3.totals).toEqual({ grossAmount: 24000, discountAmount: 1000, netAmount: 23000 });
  });

  it("9–13. rent, other income, expense, other expense, repayment", async () => {
    await loginAs(o.manager.id);
    expect(ok(await recordMoney({ departmentId: o.deptA.id, type: "RENT_INCOME", amount: 15000, category: "rent-space", counterparty: "Stall 3", idempotencyKey: key() })).referenceNo).toBe("R-0001");
    expect(ok(await recordMoney({ departmentId: o.deptA.id, type: "OTHER_INCOME", amount: 2000, category: "income-event-fee", idempotencyKey: key() })).referenceNo).toBe("I-0001");
    expect(ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 5000, category: "opex-gas", idempotencyKey: key() })).referenceNo).toBe("E-0001");
    expect(ok(await recordMoney({ departmentId: o.deptA.id, type: "OTHER_EXPENSE", amount: 1000, category: "other-expense-bank-fees", idempotencyKey: key() })).referenceNo).toBe("X-0001");
    await loginAs(o.cashier.id);
    const oldDebt = await db.debt.findFirst({ where: { departmentId: o.deptA.id, debtorName: "Customer 1" } });
    fails(await recordRepayment({ departmentId: o.deptA.id, debtId: oldDebt.id, amount: 9001, idempotencyKey: key() }), /owes 9000/);
    expect(ok(await recordRepayment({ departmentId: o.deptA.id, debtId: oldDebt.id, amount: 4000, idempotencyKey: key() })).referenceNo).toBe("Y-0001");
  });

  it("14–15. cash handed to the Boss (not more than the drawer) and confirmed", async () => {
    await loginAs(o.manager.id);
    fails(await recordHandover({ departmentId: o.deptA.id, amount: 66001, idempotencyKey: key() }), /should hold 66000/);
    const h = ok(await recordHandover({ departmentId: o.deptA.id, amount: 60000, idempotencyKey: key() }));
    expect(h.referenceNo).toBe("H-0001");
    await loginAs(o.boss.id);
    const handover = await db.cashHandover.findFirst({ where: { departmentId: o.deptA.id } });
    ok(await reviewHandover({ handoverId: handover.id, status: "CONFIRMED" }));
  });

  it("the live report shows every hand-computed figure", async () => {
    const r = await buildDailyReport({ organizationId: o.org.id, departmentId: o.deptA.id, dateKey: D, countedCash: 5500 });
    const byName = Object.fromEntries(r.stock.rows.map((row) => [row.name, row]));
    expect(byName["Dish A"]).toMatchObject({ opening: 20, added: 10, sold: 18, closing: 12, value: 24000 });
    expect(byName["Dish B"]).toMatchObject({ opening: 9, added: 0, sold: 8, closing: 1, value: 3000 });
    expect(r.stock.totals).toMatchObject({ closing: 13, openingValue: 67000, value: 27000 });
    expect(r.money).toMatchObject({ salesGross: 60000, saleDiscounts: 1000, netSales: 59000, rentIncome: 15000, otherIncome: 2000, moneyIn: 77000 });
    expect(r.money).toMatchObject({ discounts: 1000, purchases: 12000, expenses: 5000, otherExpenses: 1000, moneyOut: 19000, result: 58000, debtRepayments: 4000 });
    expect(r.cash).toMatchObject({ opening: 10000, cashIn: 74000, cashOut: 18000, expected: 66000, handedOver: 60000, shouldRemain: 6000, counted: 5500, variance: -500 });
    expect(r.debts).toMatchObject({ opening: 9000, given: 6000, repaid: 4000, closing: 11000 });
    expect(r.sales.byDish).toEqual([
      expect.objectContaining({ name: "Dish A", plates: 18, gross: 36000 }),
      expect.objectContaining({ name: "Dish B", plates: 8, gross: 24000 }),
    ]);
    // Every record is listed with its reference, including the voided sale.
    const refs = r.records.map((x) => x.referenceNo).filter(Boolean);
    for (const ref of ["C-0001", "C-0002", "C-0003", "A-0001", "P-0001", "S-0001", "S-0002", "S-0003", "S-0004", "R-0001", "I-0001", "E-0001", "X-0001", "Y-0001", "H-0001"]) expect(refs).toContain(ref);
    expect(r.records.find((x) => x.referenceNo === "S-0004").status).toBe("VOIDED");
  });

  it("invariants: cached plates = movements; nothing negative; stock value from all history", async () => {
    const dishes = await db.menuItem.findMany({ where: { departmentId: o.deptA.id } });
    const all = await db.stockMovement.findMany({ where: { departmentId: o.deptA.id } });
    const { start, end } = dayBounds(startOfDateKey(D));
    const full = dayPositions(dishes, all, start, end);
    for (const d of dishes) {
      const p = full.find((x) => x.dishId === d.id);
      expect(Number(d.currentQuantity)).toBe(p.closing);
      expect(p.closing).toBeGreaterThanOrEqual(0);
    }
  });

  it("16. sending needs the cash count; then the day is locked and the Boss is notified", async () => {
    await loginAs(o.manager.id);
    fails(await sendReportToBoss({ departmentId: o.deptA.id, dateKey: D }), /Count the cash/);
    ok(await saveReportDraft({ departmentId: o.deptA.id, dateKey: D, countedCash: 5500, notes: "Busy day" }));
    const sent = ok(await sendReportToBoss({ departmentId: o.deptA.id, dateKey: D, countedCash: 5500, notes: "Busy day" }));
    expect(sent).toMatchObject({ status: "SUBMITTED", referenceNo: "DR-0001" });
    expect(sent.totals).toMatchObject({ moneyIn: 77000, moneyOut: 19000, result: 58000, variance: -500, stockValue: 27000, debtsClosing: 11000 });
    // Locked day: every write refused.
    fails(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: A.id, quantity: 1 }], idempotencyKey: key() }), /report .* submitted/i);
    fails(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas", idempotencyKey: key() }), /submitted/);
    fails(await addStockToDish({ departmentId: o.deptA.id, dishId: A.id, plates: 1 }), /submitted/);
    fails(await setDayOpeningStock({ departmentId: o.deptA.id, dateKey: D, reason: "x count", entries: [{ dishId: A.id, actual: 21 }] }), /submitted/);
    fails(await voidRecord({ transactionId: saleRefs.s1.transactionId, reason: "late change" }), /submitted/);
    const notes = await db.notification.findMany({ where: { userId: o.boss.id, kind: "REPORT_SUBMITTED" } });
    expect(notes).toHaveLength(1);
    const report = await db.dailyReport.findFirst({ where: { departmentId: o.deptA.id }, include: { inventorySnapshots: true } });
    expect(report.inventorySnapshots.map((s) => [s.name, Number(s.closingQuantity), Number(s.closingValue)]).sort()).toEqual([["Dish A", 12, 24000], ["Dish B", 1, 3000]]);
  });

  it("the next day opens with yesterday's closing (plates and cash)", async () => {
    const next = addDaysToKey(D, 1);
    const { start, end } = dayBounds(startOfDateKey(next));
    const dishes = await db.menuItem.findMany({ where: { departmentId: o.deptA.id } });
    const all = await db.stockMovement.findMany({ where: { departmentId: o.deptA.id } });
    const pos = Object.fromEntries(dayPositions(dishes, all, start, end).map((p) => [p.name, p.opening]));
    expect(pos).toEqual({ "Dish A": 12, "Dish B": 1 });
    const { openingCashBefore } = await import("@/lib/finance/posting-service");
    expect(await openingCashBefore(db, o.deptA.id, start)).toBe(6000);
  });

  it("the statement for the day equals the daily report (R1)", async () => {
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.deptA], fromKey: D, toKey: D });
    expect(st.income).toMatchObject({ moneyIn: 77000, moneyOut: 19000, result: 58000, salesGross: 60000 });
    expect(st.cash).toMatchObject({ opening: 10000, cashIn: 74000, cashOut: 18000, handedOver: 60000, confirmed: 60000, closing: 6000 });
    expect(st.debts).toMatchObject({ opening: 9000, given: 6000, repaid: 4000, closing: 11000 });
    expect(st.stock.totals).toMatchObject({ value: 27000, sold: 26 });
    expect(st.coverage).toMatchObject({ expected: 1, sent: 1, approved: 0, final: false });
  });

  it("the ledger (Full accounting) agrees with the statements, month by month", async () => {
    const r = await checkLedger({ organizationId: o.org.id, boss: o.boss });
    expect(r.built.posted).toBeGreaterThan(0);
  });
});
