import { beforeAll, describe, expect, it, vi } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupRentalOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { cancelRentalOrder, createRentalOrder, dispatchRentalOrder, recordRentalPayment, recordRentalPurchase, recordRentalRefund, returnRentalItems, saveRentalAsset, saveRentalItem, settleRentalIncident, countRentalCash } from "@/actions/rental";
import { recordMoney } from "@/actions/money";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { rentalReport, rentalStatementFigures, rentalSummary, rentalTrends } from "@/lib/rental/reports";
import { depreciationBetween, addMonths } from "@/lib/assets/depreciation";
import { buildStatements } from "@/lib/finance/statements";
import { rentalSearch } from "@/lib/rental/search";
import { checkLedger } from "../support/ledger-check";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const t = toDateKey(new Date());
const d = (n) => addDaysToKey(t, n);
const TZ = "Africa/Douala";

/**
 * A reference period (today ± 2 days) where every figure is known in advance: two events, a
 * cancellation, damages charged and lost, event expenses, a purchase and a depreciating van.
 */
describe.skipIf(!hasDb)("event rental: reports agree with the reference period", () => {
  let o;
  let r;
  let vanDep;
  beforeAll(async () => {
    o = await setupRentalOrganization("Reports");
    await loginAs(o.head.id, o.deco.id);
    const chairs = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Chairs", category: "Chairs", rentalPrice: 500, purchasePrice: 15000, openingQuantity: 300 })).itemId;
    const plates = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Plates", category: "Tableware", rentalPrice: 200, purchasePrice: 1500, openingQuantity: 400 })).itemId;
    const a = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "John" }, eventType: "Wedding", eventDateKey: t, dispatchDateKey: d(-1), returnDateKey: d(1), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 200 }, { itemId: plates, quantity: 100 }, { kind: "SERVICE", label: "Decoration", unitPrice: 50000 }] })).orderId;
    ok(await recordRentalPayment({ departmentId: o.deco.id, orderId: a, amount: 100000, idempotencyKey: key() }));
    const order = await db.rentalOrder.findUnique({ where: { id: a }, include: { lines: true } });
    ok(await dispatchRentalOrder({ departmentId: o.deco.id, orderId: a }));
    const chairLine = order.lines.find((l) => l.itemId === chairs);
    const plateLine = order.lines.find((l) => l.itemId === plates);
    const back = ok(await returnRentalItems({ departmentId: o.deco.id, orderId: a, lines: [{ lineId: chairLine.id, good: 195, damaged: 3, missing: 2 }, { lineId: plateLine.id, good: 100 }] }));
    const missing = back.differences.find((x) => x.kind === "MISSING");
    const damaged = back.differences.find((x) => x.kind === "DAMAGED");
    ok(await settleRentalIncident({ departmentId: o.deco.id, incidentId: missing.incidentId, decision: "charge" }));
    ok(await settleRentalIncident({ departmentId: o.deco.id, incidentId: damaged.incidentId, decision: "loss" }));
    ok(await recordMoney({ departmentId: o.deco.id, type: "EXPENSE", amount: 30000, category: "opex-transport", description: "Truck", counterparty: "Transport Ndjock", rentalOrderId: a, idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.deco.id, type: "EXPENSE", amount: 20000, category: "opex-wages", description: "Set-up crew", counterparty: "Crew", rentalOrderId: a, idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.deco.id, type: "EXPENSE", amount: 5000, category: "rental-fuel", description: "Fuel", counterparty: "Total", idempotencyKey: key() }));
    const b = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Mary" }, eventType: "Birthday", eventDateKey: d(1), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 50 }] })).orderId;
    ok(await recordRentalPayment({ departmentId: o.deco.id, orderId: b, amount: 25000, idempotencyKey: key() }));
    const c = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Paul" }, eventType: "Funeral", eventDateKey: d(2), status: "CONFIRMED", lines: [{ itemId: plates, quantity: 50 }] })).orderId;
    ok(await recordRentalPayment({ departmentId: o.deco.id, orderId: c, amount: 5000, idempotencyKey: key() }));
    ok(await cancelRentalOrder({ departmentId: o.deco.id, orderId: c, reason: "Postponed" }));
    ok(await recordRentalRefund({ departmentId: o.deco.id, orderId: c, amount: 2000, reason: "Partial refund", idempotencyKey: key() }));
    ok(await recordRentalPurchase({ departmentId: o.deco.id, supplier: "Plastiques SA", lines: [{ itemId: plates, quantity: 40, unitCost: 1500 }], idempotencyKey: key() }));
    const van = { name: "Van", category: "Vehicles", purchaseDateKey: addMonths(t, -2), cost: 1200000, usefulLifeMonths: 60, method: "STRAIGHT_LINE" };
    ok(await saveRentalAsset({ departmentId: o.deco.id, ...van }));
    vanDep = depreciationBetween({ ...van, purchaseDate: van.purchaseDateKey }, d(-2), d(2));
    r = await rentalReport({ departmentId: o.deco.id, organizationId: o.org.id, fromKey: d(-2), toKey: d(2), timeZone: TZ, todayKey: t });
  });

  it("income statement: events on their date, charges, kept money; expenses, items lost at cost, depreciation", () => {
    expect(r.income).toMatchObject({ eventsRevenue: 195000, chargesRevenue: 30000, cancellationIncome: 3000, otherIncome: 0, revenue: 228000, expenses: 55000, losses: 75000, depreciation: vanDep });
    expect(r.income.result).toBe(228000 - 55000 - 75000 - vanDep);
  });

  it("profit of each event (the requirements' example form)", () => {
    const wedding = r.profitability.rows.find((x) => x.eventType === "Wedding");
    expect(wedding).toMatchObject({ price: 170000, charges: 30000, revenue: 200000, expenses: 50000, losses: 75000, profit: 75000 });
    expect(wedding.byCategory).toEqual({ "Transport & delivery": 30000, "Daily wages & salaries": 20000 });
    expect(r.profitability.byType.map((x) => [x.eventType, x.profit])).toEqual([["Wedding", 75000], ["Birthday", 25000]]);
  });

  it("cash flow, balances owed and paid ahead, balance sheet", () => {
    expect(r.cashFlow).toMatchObject({ receivedFromClients: 130000, refunds: 2000, expenses: 55000, purchases: 60000, net: 13000 });
    expect(r.balances).toMatchObject({ receivable: 100000, advances: 25000 });
    expect(r.balances.rows.map((x) => [x.client, x.balance])).toEqual([["John", 100000]]);
    // Stock at cost: 300 chairs + 400 plates + 40 plates − 5 chairs written off.
    expect(r.balanceSheet.stockValue).toBe(295 * 15000 + 440 * 1500);
    expect(r.balanceSheet.assetsBookValue).toBe(1200000 - depreciationBetween({ purchaseDate: addMonths(t, -2), cost: 1200000, usefulLifeMonths: 60 }, addMonths(t, -2), t));
    expect(r.balanceSheet.netPosition).toBe(r.balanceSheet.totalAssets - 25000);
  });

  it("activity and analysis: items out and back, damages, most rented, customers", () => {
    expect(r.activity).toMatchObject({ newBookings: 3, events: 2, cancelled: 1, unitsOut: 300, unitsBack: 295, unitsBought: 40, purchases: 60000 });
    expect(r.incidents).toMatchObject({ DAMAGED: 3, MISSING: 2, open: 0 });
    expect(r.items.mostRented[0]).toMatchObject({ name: "Chairs", units: 250, times: 2, revenue: 125000, losses: 75000 });
    expect(r.customers.map((c) => c.client)).toEqual(["John", "Mary"]);
    expect(r.revenueByDay.find((x) => x.dateKey === t).revenue).toBe(170000 + 30000 + 3000);
  });

  it("company statements and the Boss's summary count the department the same way", async () => {
    const figures = await rentalStatementFigures({ departments: [o.deco], fromKey: d(-2), toKey: d(2), timeZone: TZ });
    expect(figures[o.deco.id]).toMatchObject({ eventsRevenue: 225000, cancellationIncome: 3000, assetLosses: 75000, depreciation: vanDep });
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.deco], fromKey: d(-2), toKey: d(2), timeZone: TZ, compare: false });
    expect(st.income.result).toBe(r.income.result);
    const s = await rentalSummary({ department: o.deco, organizationId: o.org.id, fromKey: d(-2), toKey: d(2), timeZone: TZ });
    expect(s).toMatchObject({ revenue: 228000, events: 2, outstanding: 100000 });
    const trend = await rentalTrends({ department: o.deco, toKey: t, months: 3, timeZone: TZ });
    expect(trend).toHaveLength(3);
    expect(trend[2].monthKey).toBe(t.slice(0, 7));
  });

  it("search finds customers, bookings, items, money records and documents", async () => {
    expect(await rentalSearch({ departmentId: o.deco.id, q: "a", timeZone: TZ })).toBeNull();
    const john = await rentalSearch({ departmentId: o.deco.id, q: "john", timeZone: TZ });
    expect(john.groups.customers.map((c) => c.title)).toEqual(["John"]);
    expect(john.groups.bookings).toHaveLength(1);
    expect(john.groups.bookings[0].title).toMatch(/Wedding · John/);
    expect((await rentalSearch({ departmentId: o.deco.id, q: "CHAIR", timeZone: TZ })).groups.items.map((i) => i.title)).toEqual([expect.stringMatching(/Chairs$/)]);
    const truck = await rentalSearch({ departmentId: o.deco.id, q: "Ndjock", timeZone: TZ });
    expect(truck.groups.money).toHaveLength(1);
    expect(truck.groups.money[0].href).toMatch(/^\/money\?ref=/);
    const plastic = await rentalSearch({ departmentId: o.deco.id, q: "plastiques", timeZone: TZ });
    expect(plastic.groups.documents.length + plastic.groups.money.length).toBeGreaterThanOrEqual(2);
    const dn = await rentalSearch({ departmentId: o.deco.id, q: "DN-", timeZone: TZ });
    expect(dn.groups.documents.some((x) => /Dispatch note/.test(x.title))).toBe(true);
  });

  it("the cash count of the drawer: a difference needs an explanation and shows in the report", async () => {
    const expected = Math.round(r.drawer.shouldRemain);
    fails(await countRentalCash({ departmentId: o.deco.id, countedCash: expected - 1000 }), /explain/);
    ok(await countRentalCash({ departmentId: o.deco.id, countedCash: expected - 1000, notes: "Change given twice" }));
    const again = await rentalReport({ departmentId: o.deco.id, organizationId: o.org.id, fromKey: t, toKey: t, timeZone: TZ, todayKey: t });
    expect(again.verification.counts).toEqual([expect.objectContaining({ dateKey: t, variance: -1000 })]);
  });

  it("the ledger (Full accounting) agrees with the statements, month by month", async () => {
    const r = await checkLedger({ organizationId: o.org.id, boss: o.boss });
    expect(r.built.posted).toBeGreaterThan(0);
  });
});
