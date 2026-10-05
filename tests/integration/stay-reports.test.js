import { beforeAll, describe, expect, it } from "vitest";
import { hasDb, key, loginAs, ok, setupStayOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey } from "@/lib/timezone";
import { addRoomAssets, cancelStay, completeRepair, createStay, moveRoomAssets, recordStayCashCount, recordStayPayment, recordStayRefund, reportRepair, saveRoom, stepStay } from "@/actions/rooms";
import { recordMoney } from "@/actions/money";
import { recordHandover } from "@/actions/handovers";
import { staysReport, staySummary } from "@/lib/rooms/reports";
import { buildStatements } from "@/lib/finance/statements";
import { bossOverview } from "@/lib/boss/overview";
import { apartmentProfitability, guestBalances, occupancy, registerValueAt } from "@/lib/rooms/report-math";

describe("guest house report math (pure)", () => {
  it("guest balances: owed for nights stayed vs advances for nights to come", () => {
    const s = (o) => ({ status: "CHECKED_IN", complimentary: false, roomId: "a", ...o });
    const b = guestBalances([
      s({ id: "1", checkInKey: "2026-10-01", checkOutKey: "2026-10-04", totalPrice: 90000, money: [{ type: "BOOKING_PAYMENT", amount: 30000, status: "COMPLETED", dateKey: "2026-10-01" }] }),
      s({ id: "2", status: "CONFIRMED", checkInKey: "2026-10-10", checkOutKey: "2026-10-12", totalPrice: 40000, money: [{ type: "BOOKING_PAYMENT", amount: 40000, status: "COMPLETED", dateKey: "2026-10-02" }] }),
      s({ id: "3", status: "CANCELLED", checkInKey: "2026-10-01", checkOutKey: "2026-10-02", totalPrice: 10000, money: [] }),
    ], "2026-10-02");
    // Stay 1: 2 nights earned (60 000) − 30 000 paid; stay 2: 40 000 paid ahead.
    expect(b).toMatchObject({ receivable: 30000, advances: 40000, owedTotal: 60000 });
  });
  it("occupancy counts past nights only when the guest came; ranking best first; register value back in time", () => {
    const rooms = [{ id: "a", name: "A" }, { id: "b", name: "B" }];
    const stays = [
      { roomId: "a", status: "CHECKED_OUT", checkInKey: "2026-10-01", checkOutKey: "2026-10-03" },
      { roomId: "b", status: "CONFIRMED", checkInKey: "2026-10-01", checkOutKey: "2026-10-05" }, // no-show in the past, booked from today
    ];
    const o = occupancy(rooms, stays, "2026-10-01", "2026-10-04", "2026-10-03");
    expect(o.byRoom.a).toMatchObject({ occupied: 2, available: 4, rate: 50 });
    expect(o.byRoom.b).toMatchObject({ occupied: 2 });
    const p = apartmentProfitability({ rooms, nights: { byRoom: { a: { revenue: 10, nights: 1 }, b: { revenue: 50, nights: 2 } } }, money: { "": { expenses: 7 } }, cancellations: {}, losses: {}, occupancy: o });
    expect(p.rows.map((r) => r.name)).toEqual(["B", "A"]);
    expect(p.best.name).toBe("B");
    expect(p.shared.expenses).toBe(7);
    expect(registerValueAt(1000, [{ kind: "BOUGHT", value: 300, loss: 0 }, { kind: "MISSING", value: 0, loss: 50 }])).toBe(750);
  });
});

describe.skipIf(!hasDb)("Executive Stay: reports agree with the records", () => {
  let o;
  let a1;
  let a2;
  let report;
  const t = today();
  const d = (n) => addDaysToKey(t, n);

  beforeAll(async () => {
    o = await setupStayOrganization("Reports");
    await loginAs(o.head.id);
    a1 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 1", nightlyRate: 30000 })).roomId;
    a2 = ok(await saveRoom({ departmentId: o.stay.id, name: "Apartment 2", nightlyRate: 20000 })).roomId;

    // S1: A1, arrived 2 days ago, 3 nights (90 000), in the apartment; 60 000 cash received by Aline.
    const s1 = ok(await createStay({ departmentId: o.stay.id, roomId: a1, checkInKey: d(-2), checkOutKey: d(1), guestName: "Guest one", allowPast: true }));
    ok(await stepStay({ departmentId: o.stay.id, stayId: s1.stayId, step: "checkin" }));
    ok(await recordStayPayment({ departmentId: o.stay.id, stayId: s1.stayId, amount: 60000, receivedByName: "Aline", idempotencyKey: key() }));
    // S2: A2, arrives today, 2 nights (40 000), checked in, paid in full by MoMo.
    const s2 = ok(await createStay({ departmentId: o.stay.id, roomId: a2, checkInKey: d(0), checkOutKey: d(2), guestName: "Guest two" }));
    ok(await stepStay({ departmentId: o.stay.id, stayId: s2.stayId, step: "checkin" }));
    ok(await recordStayPayment({ departmentId: o.stay.id, stayId: s2.stayId, amount: 40000, paymentMethod: "MOMO", reference: "MP1", idempotencyKey: key() }));
    // S3: A2 in 5 days (40 000), 10 000 deposit cash.
    const s3 = ok(await createStay({ departmentId: o.stay.id, roomId: a2, checkInKey: d(5), checkOutKey: d(7), guestName: "Guest three" }));
    ok(await recordStayPayment({ departmentId: o.stay.id, stayId: s3.stayId, amount: 10000, idempotencyKey: key() }));
    // S4: A1 later, 15 000 paid, cancelled, 5 000 given back: 10 000 kept (A1).
    const s4 = ok(await createStay({ departmentId: o.stay.id, roomId: a1, checkInKey: d(10), checkOutKey: d(11), guestName: "Guest four" }));
    ok(await recordStayPayment({ departmentId: o.stay.id, stayId: s4.stayId, amount: 15000, idempotencyKey: key() }));
    ok(await cancelStay({ departmentId: o.stay.id, stayId: s4.stayId, reason: "Changed plans" }));
    ok(await recordStayRefund({ departmentId: o.stay.id, stayId: s4.stayId, amount: 5000, reason: "Partial refund", idempotencyKey: key() }));

    // Expenses: A1 cleaning 5 000, shared electricity 8 000; other income A2 laundry 3 000; A1 repair 12 000.
    ok(await recordMoney({ departmentId: o.stay.id, type: "EXPENSE", amount: 5000, category: "stay-cleaning", description: "Cleaning", counterparty: "CleanCo", authorizedByName: "Boss", roomId: a1, idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.stay.id, type: "EXPENSE", amount: 8000, category: "opex-electricity", description: "ENEO", counterparty: "ENEO", authorizedByName: "Boss", idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.stay.id, type: "OTHER_INCOME", amount: 3000, category: "stay-extra-services", description: "Laundry", roomId: a2, idempotencyKey: key() }));
    const rep = ok(await reportRepair({ departmentId: o.stay.id, roomId: a1, title: "Tap" }));
    ok(await completeRepair({ departmentId: o.stay.id, repairId: rep.repairId, actualCost: 12000, paidFromDrawer: true, counterparty: "Plumber", authorizedByName: "Boss", idempotencyKey: key() }));

    // Assets: A1 4 chairs owned (15 000), a TV bought by MoMo (200 000: investment), 1 chair missing (loss 15 000).
    const chairs = ok(await addRoomAssets({ departmentId: o.stay.id, roomId: a1, name: "Chair", category: "CHAIR", quantity: 4, unitValue: 15000, alreadyOwned: true, idempotencyKey: key() }));
    ok(await addRoomAssets({ departmentId: o.stay.id, roomId: a1, name: "TV", category: "TV", quantity: 1, unitValue: 200000, paidFromDrawer: true, paymentMethod: "MOMO", reference: "MP2", counterparty: "Shop", authorizedByName: "Boss", idempotencyKey: key() }));
    ok(await moveRoomAssets({ departmentId: o.stay.id, assetId: chairs.assetId, kind: "missing", quantity: 1, note: "Not found after cleaning" }));

    // Cash: in 60 000 + 10 000 + 15 000 + 3 000 = 88 000; out 5 000 refund + 25 000 expenses = 30 000; 20 000 to the Boss.
    ok(await recordHandover({ departmentId: o.stay.id, amount: 20000, idempotencyKey: key() }));
    ok(await recordStayCashCount({ departmentId: o.stay.id, countedCash: 38000 }));

    report = await staysReport({ departmentId: o.stay.id, organizationId: o.org.id, fromKey: t, toKey: t, timeZone: "Africa/Douala", todayKey: t });
  });

  it("income statement: nights on their date, kept cancellations, other income, expenses, repairs, losses", () => {
    expect(report.income).toMatchObject({ nightsRevenue: 50000, cancellationIncome: 10000, otherIncome: 3000, revenue: 63000, expenses: 13000, repairs: 12000, assetLosses: 15000, costs: 40000, result: 23000 });
  });

  it("apartment by apartment: profit, ranking, shared costs add up to the house", () => {
    const [first, second] = report.profitability.rows;
    expect(first).toMatchObject({ name: "Apartment 1", nightsRevenue: 30000, cancellationIncome: 10000, revenue: 40000, expenses: 17000, repairs: 12000, assetLosses: 15000, profit: 8000, nightsSold: 1 });
    expect(second).toMatchObject({ name: "Apartment 2", nightsRevenue: 20000, otherIncome: 3000, revenue: 23000, profit: 23000 });
    expect(report.profitability.shared).toMatchObject({ expenses: 8000 });
    expect(first.profit + second.profit - report.profitability.shared.expenses).toBe(report.income.result);
    expect(report.profitability.best.name).toBe("Apartment 1");
    expect(report.profitability.worst.name).toBe("Apartment 2");
    expect(report.occupancy).toMatchObject({ occupied: 2, available: 2, rate: 100 });
  });

  it("cash flow, verification and the balance sheet", () => {
    expect(report.cashFlow).toMatchObject({ receivedFromClients: 125000, otherIncome: 3000, refunds: 5000, expenses: 25000, operating: 98000, assetPurchases: 200000, investing: -200000, cashIn: 88000, cashOut: 30000, handedOver: 20000, closingCash: 38000 });
    expect(report.verification).toMatchObject({ recorded: 125000, toHandOver: 38000, countVariance: 0, discrepancies: 0 });
    expect(report.verification.byPerson.map((p) => [p.receivedBy, p.total])).toEqual([["Stay head", 65000], ["Aline", 60000]]);
    expect(report.balances).toMatchObject({ receivable: 30000, advances: 30000, owedTotal: 60000 });
    expect(report.balanceSheet).toMatchObject({ cash: 38000, receivable: 30000, assetsValue: 245000, totalAssets: 313000, advances: 30000, netPosition: 283000 });
    expect(report.activity).toMatchObject({ arrivals: 1, checkIns: 2, cancellations: 1 });
    expect(report.assets.movements).toMatchObject({ missing: 1, loss: 15000, purchaseCost: 200000 });
    expect(report.repairs).toMatchObject({ done: 1, spent: 12000, pending: 0 });
    expect(report.unvalidated.count).toBe(4);
  });

  it("the company statements and the Boss's overview count Executive Stay the same way", async () => {
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.stay], fromKey: t, toKey: t, timeZone: "Africa/Douala", compare: false });
    expect(st.income).toMatchObject({ staysRevenue: 50000, cancellationIncome: 10000, otherIncome: 3000, moneyIn: 63000, expenses: 25000, assetLosses: 15000, moneyOut: 40000, result: 23000 });
    expect(st.cash).toMatchObject({ cashIn: 88000, cashOut: 30000, handedOver: 20000, closing: 38000, assetPurchases: 200000 });
    const departments = await db.department.findMany({ where: { organizationId: o.org.id } });
    const ov = await bossOverview({ organizationId: o.org.id, departments, dateKey: t, timeZone: "Africa/Douala" });
    const card = ov.cards.find((c) => c.id === o.stay.id);
    expect(card).toMatchObject({ moneyIn: 63000, moneyOut: 40000, result: 23000 });
    expect(card.rooms).toMatchObject({ occupied: 2, rooms: 2, receivedFromClients: 125000, outstanding: 60000, toHandOver: 38000, unvalidated: 4 });
    expect(ov.kpis).toMatchObject({ moneyIn: 63000, result: 23000, debtsOwed: 60000 });
    // The 30-day chart counts the nights on their date too (yesterday: 30 000 of S1's nights).
    expect(ov.series.at(-1)).toMatchObject({ dateKey: t, moneyIn: 63000, result: 23000 });
    expect(ov.series.at(-2)).toMatchObject({ moneyIn: 30000 });
    const s = await staySummary({ department: o.stay, organizationId: o.org.id, fromKey: t, toKey: t, timeZone: "Africa/Douala" });
    expect(s).toMatchObject({ revenue: 63000, result: 23000, best: { name: "Apartment 1" } });
  });
});
