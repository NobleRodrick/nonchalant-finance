import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupMakersOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { tradeOperation as op } from "@/actions/trade";
import { recordMoney, voidRecord } from "@/actions/money";
import { buildStatements } from "@/lib/finance/statements";
import { monthOf } from "@/lib/property/rent-schedule";
import { checkLedger, monthEnd } from "../support/ledger-check";

const t = today();
const m0 = monthOf(t);

/**
 * Production (bakery), farm (poultry band, maize field) and salon / gym: recipes and batches at
 * their real cost, farm batches with feed from stock, deaths, eggs into stock and sales, the
 * batch's profit; appointments opening visits, memberships sold, used and cancelled — and the
 * statements and the books agree.
 */
describe.skipIf(!hasDb)("production, farm, salon / gym", () => {
  let o;
  const P = {};
  beforeAll(async () => {
    o = await setupMakersOrganization("Makers");
    await loginAs(o.head.id, o.bakery.id);
  });
  const run = (kind, input) => op(kind, { idempotencyKey: key(), ...input });

  it("bakery: raw materials, a recipe, a batch at its real cost (waste raises it), sold at the till, voided batch", async () => {
    const d = o.bakery.id;
    P.flour = ok(await run("trade.product.save", { departmentId: d, name: "Flour", kind: "RAW", unit: "kg", costPrice: 500, openingQuantity: 100 })).productId;
    P.yeast = ok(await run("trade.product.save", { departmentId: d, name: "Yeast", kind: "RAW", unit: "kg", costPrice: 3000, openingQuantity: 5 })).productId;
    P.bread = ok(await run("trade.product.save", { departmentId: d, name: "Baguette", salePrice: 150, unit: "loaf" })).productId;
    fails(await run("trade.sale.record", { departmentId: d, lines: [{ productId: P.flour, quantity: 1 }] }), /raw material/);
    fails(await run("production.batch.record", { departmentId: d, productId: P.bread, producedQuantity: 100 }), /no recipe/);
    ok(await run("production.recipe.save", { departmentId: d, productId: P.bread, yieldQuantity: 100, lines: [{ materialId: P.flour, quantity: 25 }, { materialId: P.yeast, quantity: 0.5 }] }));
    // Two rounds planned (200 loaves): 50 kg flour + 1 kg yeast = 28 000; 190 good loaves.
    const b = ok(await run("production.batch.record", { departmentId: d, productId: P.bread, plannedQuantity: 200, producedQuantity: 190 }));
    expect(b).toMatchObject({ totalCost: 28000, unitCost: Math.round(28000 / 190), waste: 10 });
    const [flour, bread] = await Promise.all([db.tradeProduct.findUnique({ where: { id: P.flour } }), db.tradeProduct.findUnique({ where: { id: P.bread } })]);
    expect(flour.quantity).toBe(50);
    expect(bread).toMatchObject({ quantity: 190, costPrice: Math.round(28000 / 190) });
    fails(await run("production.batch.record", { departmentId: d, productId: P.bread, plannedQuantity: 1000, producedQuantity: 1000 }), /Not enough in stock: Flour/);
    ok(await run("trade.sale.record", { departmentId: d, lines: [{ productId: P.bread, quantity: 100 }] }));
    // A second batch by hand, then voided: materials back, loaves out.
    const b2 = ok(await run("production.batch.record", { departmentId: d, productId: P.bread, producedQuantity: 40, materials: [{ productId: P.flour, quantity: 10 }, { productId: P.yeast, quantity: 0.2 }] }));
    ok(await run("production.batch.void", { departmentId: d, batchId: b2.batchId, reason: "Typed twice" }));
    expect((await db.tradeProduct.findUnique({ where: { id: P.flour } })).quantity).toBe(50);
    expect((await db.tradeProduct.findUnique({ where: { id: P.bread } })).quantity).toBe(90);
    fails(await run("production.batch.void", { departmentId: d, batchId: b2.batchId, reason: "again" }), /already voided/);
  });

  it("farm: a poultry band with feed from stock, deaths, eggs into stock, birds sold on credit, expenses on the batch; its profit", async () => {
    const d = o.farm.id;
    await loginAs(o.head.id, d);
    P.feed = ok(await run("trade.product.save", { departmentId: d, name: "Broiler feed", kind: "RAW", unit: "bag", costPrice: 15000, openingQuantity: 10 })).productId;
    P.eggs = ok(await run("trade.product.save", { departmentId: d, name: "Eggs (tray of 30)", unit: "tray", salePrice: 2500 })).productId;
    const band = ok(await run("farm.batch.save", { departmentId: d, kind: "POULTRY", name: "Layers house 1", initialCount: 500, startKey: t }));
    P.band = band.batchId;
    ok(await run("farm.event.record", { departmentId: d, batchId: band.batchId, kind: "FEED", quantity: 4, productId: P.feed }));
    ok(await run("farm.event.record", { departmentId: d, batchId: band.batchId, kind: "MORTALITY", quantity: 12, note: "Heat" }));
    fails(await run("farm.event.record", { departmentId: d, batchId: band.batchId, kind: "MORTALITY", quantity: 600 }), /Only 488/);
    ok(await run("farm.event.record", { departmentId: d, batchId: band.batchId, kind: "PRODUCE", quantity: 20, productId: P.eggs }));
    expect((await db.tradeProduct.findUnique({ where: { id: P.eggs } })).quantity).toBe(20);
    expect((await db.tradeProduct.findUnique({ where: { id: P.feed } })).quantity).toBe(6);
    ok(await run("trade.sale.record", { departmentId: d, lines: [{ productId: P.eggs, quantity: 10 }] }));
    const sale = ok(await run("farm.batch.sell", { departmentId: d, batchId: band.batchId, quantity: 50, amount: 175000, paymentMethod: "CREDIT", debtor: { name: "Marché Mfoundi", phone: "677000222" } }));
    ok(await recordMoney({ departmentId: d, type: "EXPENSE", amount: 20000, category: "farm-vet", description: "Vaccines", counterparty: "Vet", farmBatchId: band.batchId, idempotencyKey: key() }));
    const { batchFigures } = await import("@/lib/farm/farm-math");
    const [b, events, records] = await Promise.all([db.farmBatch.findUnique({ where: { id: band.batchId } }), db.farmEvent.findMany({ where: { batchId: band.batchId } }), db.transaction.findMany({ where: { farmBatchId: band.batchId } })]);
    const f = batchFigures(b, events, records);
    expect(f).toMatchObject({ alive: 438, dead: 12, soldAlive: 50, inputs: 60000, expenses: 20000, sales: 175000, profit: 95000, mortalityPct: 2.4 });
    // The sale undone: the birds count again.
    ok(await voidRecord({ transactionId: sale.transactionId, reason: "Buyer cancelled", departmentId: d }));
    const f2 = batchFigures(b, await db.farmEvent.findMany({ where: { batchId: band.batchId } }), await db.transaction.findMany({ where: { farmBatchId: band.batchId } }));
    expect(f2).toMatchObject({ alive: 488, sales: 0 });
    // A feeding typed by mistake: the bags come back.
    const feeding = await db.farmEvent.findFirst({ where: { batchId: band.batchId, kind: "FEED" } });
    ok(await run("farm.event.void", { departmentId: d, eventId: feeding.id, reason: "Wrong house" }));
    expect((await db.tradeProduct.findUnique({ where: { id: P.feed } })).quantity).toBe(10);
    // A maize field: harvest sold from the field (no head count).
    const field = ok(await run("farm.batch.save", { departmentId: d, kind: "CROP", name: "Maize field A", initialCount: 2, unit: "ha" }));
    ok(await run("farm.batch.sell", { departmentId: d, batchId: field.batchId, quantity: 800, unit: "kg", amount: 160000, paymentMethod: "CASH" }));
    fails(await run("farm.batch.close", { departmentId: d, batchId: band.batchId }), /still alive/);
    ok(await run("farm.batch.close", { departmentId: d, batchId: field.batchId }));
    fails(await run("farm.event.record", { departmentId: d, batchId: field.batchId, kind: "NOTE", note: "late" }), /closed/);
  });

  it("salon / gym: appointments refuse a double booking and open a visit on arrival; memberships sold, used, expired, cancelled", async () => {
    const d = o.salon.id;
    await loginAs(o.head.id, d);
    const item = ok(await run("services.item.save", { departmentId: d, name: "Braids", basePrice: 8000, minutes: 120 })).itemId;
    const stylist = ok(await run("services.worker.save", { departmentId: d, name: "Aïcha" })).workerId;
    const at = new Date(Date.now() + 2 * 3600000);
    const a = ok(await run("salon.appointment.save", { departmentId: d, client: { name: "Mme Fotso", phone: "699111222" }, itemId: item, workerId: stylist, startAt: at.toISOString() }));
    fails(await run("salon.appointment.save", { departmentId: d, customerName: "Other", itemId: item, workerId: stylist, startAt: new Date(at.getTime() + 3600000).toISOString() }), /already booked/);
    ok(await run("salon.appointment.save", { departmentId: d, customerName: "Later", itemId: item, workerId: stylist, startAt: new Date(at.getTime() + 2 * 3600000).toISOString() }));
    const arrived = ok(await run("salon.appointment.status", { departmentId: d, appointmentId: a.appointmentId, status: "ARRIVED" }));
    const ticket = await db.serviceTicket.findUnique({ where: { id: arrived.ticketId }, include: { lines: true } });
    expect(ticket).toMatchObject({ status: "IN_PROGRESS", total: 8000 });
    expect(ticket.lines[0].workerId).toBe(stylist);
    ok(await run("services.ticket.step", { departmentId: d, ticketId: ticket.id, step: "collect", payment: { amount: 8000, paymentMethod: "CASH" } }));
    fails(await run("salon.appointment.status", { departmentId: d, appointmentId: a.appointmentId, status: "NO_SHOW" }), /already arrived/);

    const month = ok(await run("salon.plan.save", { departmentId: d, name: "Gym – 1 month", kind: "PERIOD", days: 30, price: 15000 })).planId;
    const pack = ok(await run("salon.plan.save", { departmentId: d, name: "3 sessions", kind: "SESSIONS", sessions: 3, price: 6000 })).planId;
    const m1 = ok(await run("salon.membership.sell", { departmentId: d, planId: month, client: { name: "Paul Ndi", phone: "677333444" } }));
    const m2 = ok(await run("salon.membership.sell", { departmentId: d, planId: pack, client: { name: "Grace", phone: "655000111" }, paymentMethod: "CREDIT" }));
    for (let i = 0; i < 3; i += 1) ok(await run("salon.membership.visit", { departmentId: d, membershipId: m2.membershipId }));
    fails(await run("salon.membership.visit", { departmentId: d, membershipId: m2.membershipId }), /no session left/);
    const late = new Date(Date.now() + 40 * 86400000).toISOString().slice(0, 10);
    const m3 = ok(await run("salon.membership.sell", { departmentId: d, planId: month, client: { name: "Future" }, startKey: late }));
    fails(await run("salon.membership.visit", { departmentId: d, membershipId: m3.membershipId }), /starts on/);
    ok(await run("salon.membership.cancel", { departmentId: d, membershipId: m3.membershipId, reason: "Changed his mind" }));
    expect((await db.transaction.findUnique({ where: { id: m3.transactionId } })).status).toBe("VOIDED");
    expect((await db.debt.findFirst({ where: { transactionId: m2.transactionId } })).amountOwed).toEqual(expect.anything());
    void m1;
  });

  it("the statements: bakery stock change in raw and finished goods, farm sales, salon tickets and memberships", async () => {
    const st = (dept) => buildStatements({ organizationId: o.org.id, departments: [dept], fromKey: `${m0}-01`, toKey: monthEnd(m0), compare: false });
    const bakery = await st(o.bakery);
    expect(bakery.income.salesGross).toBe(100 * 150);
    // Cost of what left the stock: 100 loaves at their batch cost (the rest of the movements cancel out).
    expect(bakery.income.stockChange).toBe(100 * Math.round(28000 / 190));
    const farm = await st(o.farm);
    expect(farm.income.salesGross).toBe(10 * 2500 + 160000);
    const salon = await st(o.salon);
    expect(salon.income).toMatchObject({ servicesRevenue: 8000, salesGross: 15000 + 6000 });
  });

  it("dashboards, reports and searches of the three types", async () => {
    const tz = o.org.timezone;
    const { productionReport, recipeBoard } = await import("@/lib/production/queries");
    const { farmBoard, batchDetail } = await import("@/lib/farm/queries");
    const { salonDashboard, appointmentsOfDay, membershipList } = await import("@/lib/salon/queries");
    const pr = await productionReport({ departmentId: o.bakery.id, fromKey: `${m0}-01`, toKey: monthEnd(m0), timeZone: tz });
    expect(pr.byProduct[0]).toMatchObject({ name: "Baguette", produced: 190, cost: 28000 });
    const rb = await recipeBoard({ departmentId: o.bakery.id });
    expect(rb[0]).toMatchObject({ product: "Baguette", unitCost: Math.round((25 * 500 + 0.5 * 3000) / 100) });
    const fb = await farmBoard({ departmentId: o.farm.id, todayKey: t, timeZone: tz });
    expect(fb.batches.find((b) => b.id === P.band).figures.alive).toBe(488);
    const bd = await batchDetail({ departmentId: o.farm.id, batchId: P.band, todayKey: t, timeZone: tz });
    expect(bd.events.length).toBeGreaterThan(3);
    const day = await appointmentsOfDay({ departmentId: o.salon.id, dateKey: new Date(Date.now() + 2 * 3600000).toISOString().slice(0, 10), timeZone: tz });
    expect(day.length).toBeGreaterThanOrEqual(1);
    const ml = await membershipList({ departmentId: o.salon.id, todayKey: t, timeZone: tz });
    expect(ml.map((m) => m.state.status).sort()).toEqual(["ACTIVE", "CANCELLED", "USED_UP"]);
    const sd = await salonDashboard({ department: o.salon, todayKey: t, timeZone: tz });
    expect(sd.members.active).toBe(1);
  });

  it("automatic reports, morning alerts and the Boss's cards cover the three types", async () => {
    const tz = o.org.timezone;
    const { sendTradeReports, tradeAttention } = await import("@/lib/trade/periodic-reports");
    const { salonReport } = await import("@/lib/salon/queries");
    const { bossOverview } = await import("@/lib/boss/overview");
    expect(await sendTradeReports({ organizationId: o.org.id, timeZone: tz, kind: "daily", now: new Date(Date.now() + 86400000) })).toBe(3);
    expect((await db.notification.findFirst({ where: { departmentId: o.bakery.id, kind: "TRADE_DAILY_REPORT" } })).body).toMatch(/Sales/);
    const farm = await db.department.findUnique({ where: { id: o.farm.id } });
    expect(Array.isArray(await tradeAttention({ department: farm, todayKey: t, timeZone: tz }))).toBe(true);
    const sr = await salonReport({ departmentId: o.salon.id, fromKey: `${m0}-01`, toKey: monthEnd(m0), timeZone: tz });
    expect(sr.memberships).toMatchObject({ sold: 2, cancelled: 1 });
    expect(sr.checkIns).toBe(3);
    const departments = await db.department.findMany({ where: { organizationId: o.org.id } });
    const ov = await bossOverview({ organizationId: o.org.id, departments, dateKey: t, timeZone: tz });
    expect(ov.cards.find((c) => c.id === o.bakery.id).trade.stockValue).toBeGreaterThan(0);
    expect(ov.cards.find((c) => c.id === o.salon.id).services).toBeTruthy();
  });

  it("the ledger (Full accounting) agrees with the statements; raw materials, finished products and memberships in their accounts", async () => {
    const r = await checkLedger({ organizationId: o.org.id, boss: o.boss, months: 1 });
    const n = (x) => r.tb.rows.find((row) => row.number === x)?.closing || 0;
    expect(n("321")).toBeGreaterThan(0);
    expect(n("361")).toBeGreaterThan(0);
    expect(r.tb.rows.find((row) => row.number === "706")).toBeTruthy();
  });
});
