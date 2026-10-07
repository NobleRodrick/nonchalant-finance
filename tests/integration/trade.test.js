import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupTradeOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { tradeOperation as op } from "@/actions/trade";
import { voidRecord } from "@/actions/money";
import { buildStatements } from "@/lib/finance/statements";
import { monthOf } from "@/lib/property/rent-schedule";
import { checkLedger, monthEnd } from "../support/ledger-check";

const t = today();
const m0 = monthOf(t);

/**
 * Shop, bar, pressing, car wash and other: sales with stock at average cost, credit, tabs, crates
 * and deposits, purchases paid and on credit, tickets from drop-off to collection with payments,
 * commissions and loyalty — and the statements and the books agree.
 */
describe.skipIf(!hasDb)("shop, bar, pressing, car wash, other", () => {
  let o;
  const P = {};
  beforeAll(async () => {
    o = await setupTradeOrganization("Trade");
    await loginAs(o.head.id, o.shop.id);
  });

  it("shop: products with barcode and opening stock; a sale by barcode; not more than the stock; average cost after a purchase", async () => {
    P.rice = ok(await op("trade.product.save", { departmentId: o.shop.id, name: "Rice 5 kg", barcode: "6001234567890", category: "Food & groceries", unit: "bag", salePrice: 5000, costPrice: 4000, openingQuantity: 10, lowStock: 3 })).productId;
    P.soap = ok(await op("trade.product.save", { departmentId: o.shop.id, name: "Soap", salePrice: 500, costPrice: 300, openingQuantity: 50 })).productId;
    fails(await op("trade.product.save", { departmentId: o.shop.id, name: "Other rice", barcode: "6001234567890", salePrice: 1 }), /already used by Rice/);
    const sale = ok(await op("trade.sale.record", { departmentId: o.shop.id, lines: [{ barcode: "6001234567890", quantity: 2 }, { productId: P.soap, quantity: 4 }], tendered: 15000, idempotencyKey: key() }));
    expect(sale).toMatchObject({ total: 12000, change: 3000 });
    fails(await op("trade.sale.record", { departmentId: o.shop.id, lines: [{ productId: P.rice, quantity: 9 }], idempotencyKey: key() }), /Not enough Rice 5 kg/);
    ok(await op("trade.purchase.record", { departmentId: o.shop.id, supplierName: "Grossiste Mvog-Mbi", lines: [{ productId: P.rice, quantity: 8, unitCost: 4600 }], paymentMethod: "CASH", idempotencyKey: key() }));
    const rice = await db.tradeProduct.findUnique({ where: { id: P.rice } });
    expect(rice.quantity).toBe(16);
    expect(rice.costPrice).toBe(Math.round((8 * 4000 + 8 * 4600) / 16));
  });

  it("shop: a sale on credit is a customer's debt, repaid later; a voided sale puts the goods back", async () => {
    const credit = ok(await op("trade.sale.record", { departmentId: o.shop.id, lines: [{ productId: P.soap, quantity: 10 }], paymentMethod: "CREDIT", debtor: { name: "Mama Ngono", phone: "699000111" }, idempotencyKey: key() }));
    const debt = await db.debt.findUnique({ where: { id: credit.debtId } });
    expect(Number(debt.amountOwed)).toBe(5000);
    const { tradeOperation } = await import("@/actions/trade");
    void tradeOperation;
    const { recordRepayment } = await import("@/actions/debts");
    ok(await recordRepayment({ departmentId: o.shop.id, debtId: debt.id, amount: 2000, paymentMethod: "CASH", idempotencyKey: key() }));
    const before = (await db.tradeProduct.findUnique({ where: { id: P.soap } })).quantity;
    const s2 = ok(await op("trade.sale.record", { departmentId: o.shop.id, lines: [{ productId: P.soap, quantity: 5 }], idempotencyKey: key() }));
    ok(await voidRecord({ transactionId: s2.transactionId, reason: "Typed twice", departmentId: o.shop.id }));
    expect((await db.tradeProduct.findUnique({ where: { id: P.soap } })).quantity).toBe(before);
  });

  it("shop: a purchase on credit is a supplier bill paid later; a count and a loss with reasons", async () => {
    const p = ok(await op("trade.purchase.record", { departmentId: o.shop.id, supplierName: "SOCAPALM", lines: [{ productId: P.soap, quantity: 100, total: 25000 }], paymentMethod: "CREDIT", idempotencyKey: key() }));
    const purchase = await db.tradePurchase.findUnique({ where: { id: p.purchaseId } });
    const bill = await db.supplierBill.findUnique({ where: { id: purchase.supplierBillId } });
    expect(bill).toMatchObject({ total: 25000, status: "OPEN" });
    ok(await op("trade.bill.pay", { departmentId: o.shop.id, billId: bill.id, amount: 10000, paymentMethod: "MOMO", reference: "MP-1", idempotencyKey: key() }));
    expect((await db.supplierBill.findUnique({ where: { id: bill.id } })).status).toBe("PARTIAL");
    fails(await op("trade.stock.adjust", { departmentId: o.shop.id, productId: P.soap, kind: "LOSS", quantity: 2 }), /Say why/);
    ok(await op("trade.stock.adjust", { departmentId: o.shop.id, productId: P.soap, kind: "LOSS", quantity: 2, reason: "Wet in the store" }));
    const r = ok(await op("trade.stock.adjust", { departmentId: o.shop.id, productId: P.rice, counted: 15, reason: "Monthly count" }));
    expect(r.difference).toBe(-1);
  });

  it("bar: crates with their deposit come in with the beer; a tab served round by round, a line taken off, paid at the end", async () => {
    await loginAs(o.head.id, o.bar.id);
    const crate = ok(await op("trade.packaging.save", { departmentId: o.bar.id, name: "SABC crate (12)", supplierName: "SABC", deposit: 3600, bottleDeposit: 300 })).packagingId;
    P.beer = ok(await op("trade.product.save", { departmentId: o.bar.id, name: "33 Export", salePrice: 700, costPrice: 0, packagingId: crate, unitsPerPack: 12, unit: "bottle" })).productId;
    ok(await op("trade.purchase.record", { departmentId: o.bar.id, supplierName: "SABC", lines: [{ productId: P.beer, quantity: 48, total: 24000 }], crates: [{ packagingId: crate, quantity: 4 }], paymentMethod: "CASH", idempotencyKey: key() }));
    const tab = ok(await op("trade.tab.open", { departmentId: o.bar.id, label: "Table 5", lines: [{ productId: P.beer, quantity: 4 }] }));
    fails(await op("trade.tab.open", { departmentId: o.bar.id, label: "table 5" }), /already has an open tab/);
    ok(await op("trade.tab.add", { departmentId: o.bar.id, tabId: tab.tabId, lines: [{ productId: P.beer, quantity: 3 }] }));
    const line = await db.tradeTabLine.findFirst({ where: { tabId: tab.tabId }, orderBy: { addedAt: "desc" } });
    ok(await op("trade.tab.remove", { departmentId: o.bar.id, lineId: line.id, reason: "Wrong table" }));
    const closed = ok(await op("trade.tab.close", { departmentId: o.bar.id, tabId: tab.tabId, paymentMethod: "CASH", tendered: 3000, idempotencyKey: key() }));
    expect(closed).toMatchObject({ total: 2800, change: 200 });
    expect((await db.tradeProduct.findUnique({ where: { id: P.beer } })).quantity).toBe(44);
    // Empties back to SABC (deposit refunded), a customer takes 6 bottles, a crate breaks.
    fails(await op("trade.packaging.move", { departmentId: o.bar.id, packagingId: crate, kind: "RETURNED", quantity: 5, idempotencyKey: key() }), /Only 4 crate/);
    ok(await op("trade.packaging.move", { departmentId: o.bar.id, packagingId: crate, kind: "RETURNED", quantity: 2, partyName: "SABC", idempotencyKey: key() }));
    ok(await op("trade.packaging.move", { departmentId: o.bar.id, packagingId: crate, kind: "CUSTOMER_OUT", quantity: 6, partyName: "Paul", idempotencyKey: key() }));
    ok(await op("trade.packaging.move", { departmentId: o.bar.id, packagingId: crate, kind: "BROKEN", quantity: 1, note: "Dropped", idempotencyKey: key() }));
    const { balancesOf } = await import("@/lib/trade/packaging-service");
    const b = await balancesOf(db, crate);
    expect(b).toMatchObject({ owedToSuppliers: 1, onHand: 1, bottlesWithCustomers: 6, depositsWithSuppliers: 3600, depositsHeldForCustomers: 1800, depositLost: 3600 });
  });

  it("pressing: a ticket with express and a deposit; ready; collected only when paid; a damaged garment compensated", async () => {
    await loginAs(o.head.id, o.pressing.id);
    ok(await op("services.settings.save", { departmentId: o.pressing.id, expressPct: 50, unclaimedDays: 30 }));
    const wash = ok(await op("services.item.save", { departmentId: o.pressing.id, name: "Wash & iron", prices: { Shirt: 500, "Suit (2 pieces)": 3000 } })).itemId;
    fails(await op("services.item.save", { departmentId: o.pressing.id, name: "Bad", prices: { Robot: 1 } }), /not one of the price list/);
    const tk = ok(await op("services.ticket.create", { departmentId: o.pressing.id, client: { name: "Mr Atangana", phone: "677112233" }, express: true, tagNo: "A-12", lines: [{ itemId: wash, variant: "Shirt", quantity: 4, notes: "white" }, { itemId: wash, variant: "Suit (2 pieces)", quantity: 1 }], payment: { amount: 3000, paymentMethod: "CASH" }, idempotencyKey: key() }));
    expect(tk.total).toBe(Math.round(5000 * 1.5));
    expect(tk.payment.balance).toBe(4500);
    ok(await op("services.ticket.step", { departmentId: o.pressing.id, ticketId: tk.ticketId, step: "ready", idempotencyKey: key() }));
    fails(await op("services.ticket.step", { departmentId: o.pressing.id, ticketId: tk.ticketId, step: "collect", idempotencyKey: key() }), /still to pay/);
    ok(await op("services.ticket.step", { departmentId: o.pressing.id, ticketId: tk.ticketId, step: "collect", payment: { amount: 4500, paymentMethod: "MOMO", reference: "MP77" }, idempotencyKey: key() }));
    ok(await op("services.ticket.compensate", { departmentId: o.pressing.id, ticketId: tk.ticketId, amount: 2000, reason: "Shirt torn", idempotencyKey: key() }));
    expect((await db.serviceTicket.findUnique({ where: { id: tk.ticketId } })).status).toBe("COLLECTED");
  });

  it("car wash: plate required; washers earn their commission on collection and are paid; every 3rd wash free", async () => {
    await loginAs(o.head.id, o.carWash.id);
    ok(await op("services.settings.save", { departmentId: o.carWash.id, loyaltyEvery: 3 }));
    const full = ok(await op("services.item.save", { departmentId: o.carWash.id, name: "Full wash", prices: { "Car (saloon)": 2000, "4x4 / SUV": 3000 }, commissionType: "PERCENT", commissionValue: 30 })).itemId;
    const w = ok(await op("services.worker.save", { departmentId: o.carWash.id, name: "Junior" })).workerId;
    fails(await op("services.ticket.create", { departmentId: o.carWash.id, lines: [{ itemId: full, variant: "Car (saloon)", quantity: 1 }], idempotencyKey: key() }), /plate/);
    const ids = [];
    for (let i = 0; i < 3; i += 1) {
      const r = ok(await op("services.ticket.create", { departmentId: o.carWash.id, vehiclePlate: "lt 123 ab", vehicleType: "4x4 / SUV", lines: [{ itemId: full, variant: "4x4 / SUV", quantity: 1, workerId: w }], idempotencyKey: key() }));
      ids.push(r);
      ok(await op("services.ticket.step", { departmentId: o.carWash.id, ticketId: r.ticketId, step: "collect", payment: r.total ? { amount: r.total, paymentMethod: "CASH" } : undefined, idempotencyKey: key() }));
    }
    expect(ids.map((r) => [r.total, r.loyalty])).toEqual([[3000, false], [3000, false], [0, true]]);
    fails(await op("services.worker.pay", { departmentId: o.carWash.id, workerId: w, amount: 5000, idempotencyKey: key() }), /earned 1 800/);
    ok(await op("services.worker.pay", { departmentId: o.carWash.id, workerId: w, amount: 1800, idempotencyKey: key() }));
  });

  it("other activity: a quick sale of a service and a job ticket cancelled with the money kept", async () => {
    await loginAs(o.head.id, o.other.id);
    const cut = ok(await op("trade.product.save", { departmentId: o.other.id, name: "Haircut", kind: "SERVICE", salePrice: 1500 })).productId;
    ok(await op("trade.sale.record", { departmentId: o.other.id, lines: [{ productId: cut, quantity: 2 }], paymentMethod: "MOMO", reference: "MP9", idempotencyKey: key() }));
    const braid = ok(await op("services.item.save", { departmentId: o.other.id, name: "Braids", basePrice: 10000 })).itemId;
    const j = ok(await op("services.ticket.create", { departmentId: o.other.id, customerName: "Aïcha", lines: [{ itemId: braid, quantity: 1 }], payment: { amount: 4000, paymentMethod: "CASH" }, idempotencyKey: key() }));
    ok(await op("services.ticket.cancel", { departmentId: o.other.id, ticketId: j.ticketId, reason: "Customer did not come back" }));
  });

  it("the statements: sales, tickets on collection, stock change, deposits apart", async () => {
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.shop], fromKey: `${m0}-01`, toKey: monthEnd(m0), compare: false });
    // Shop sales: 12 000 + 5 000 (credit) ; purchases 8 × 4 600 + 25 000 ; the stock change brings it to the cost of goods sold.
    expect(st.income.salesGross).toBe(17000);
    expect(st.income.purchases).toBe(36800 + 25000);
    // Cost of goods = what left the stock at average cost (sales, losses, counts, net of returns and purchases in).
    const moves = await db.tradeMovement.findMany({ where: { departmentId: o.shop.id, kind: { not: "OPENING" } }, select: { kind: true, value: true } });
    const outflow = -moves.filter((m) => !["PURCHASE", "PURCHASE_VOID"].includes(m.kind)).reduce((s, m) => s + m.value, 0);
    const bought = moves.filter((m) => ["PURCHASE", "PURCHASE_VOID"].includes(m.kind)).reduce((s, m) => s + m.value, 0);
    expect(st.income.stockChange).toBe(-(bought - outflow));
    expect(outflow).toBeGreaterThan(0);
    expect(st.income.purchases + st.income.stockChange).toBe(st.income.purchases - bought + outflow);
    const pressing = await buildStatements({ organizationId: o.org.id, departments: [o.pressing], fromKey: `${m0}-01`, toKey: monthEnd(m0), compare: false });
    expect(pressing.income.servicesRevenue).toBe(7500);
    const other = await buildStatements({ organizationId: o.org.id, departments: [o.other], fromKey: `${m0}-01`, toKey: monthEnd(m0), compare: false });
    expect(other.income).toMatchObject({ salesGross: 3000, cancellationIncome: 4000 });
    const bar = await buildStatements({ organizationId: o.org.id, departments: [o.bar], fromKey: `${m0}-01`, toKey: monthEnd(m0), compare: false });
    expect(bar.income.assetLosses).toBe(3600);
  });

  it("dashboards, reports and search read the same records", async () => {
    const { tradeDashboard, tradeReport, tradeSearch, crateBoard, productCard } = await import("@/lib/trade/queries");
    const { serviceDashboard, serviceReport, serviceSearch, workerBoard, serviceCustomers, ticketList } = await import("@/lib/services/queries");
    const tz = o.org.timezone;
    const range = { fromKey: `${m0}-01`, toKey: monthEnd(m0), timeZone: tz, todayKey: t, organizationId: o.org.id };
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.shop], fromKey: range.fromKey, toKey: range.toKey, compare: false });

    const shop = await tradeReport({ department: o.shop, ...range });
    expect(shop.sales.net).toBe(st.income.salesGross - st.income.discounts);
    expect(shop.sales.byProduct.reduce((s, p) => s + p.revenue, 0)).toBe(shop.sales.net);
    expect(shop.sales.byMethod.CREDIT).toBe(5000);
    expect(shop.purchases.amount).toBe(36800 + 25000);
    expect(shop.credit).toMatchObject({ given: 5000, repaid: 2000, owed: 3000 });
    expect(shop.losses.rows.length).toBeGreaterThan(0);
    expect(shop.income.result).toBe(st.income.result);
    const dash = await tradeDashboard({ department: o.shop, todayKey: t, timeZone: tz });
    expect(dash.today.net).toBe(shop.sales.net);
    expect(dash.stock.value).toBeGreaterThan(0);
    const card = await productCard({ departmentId: o.shop.id, productId: P.soap, timeZone: tz });
    expect(card.movements.reduce((s, m) => s + m.quantity, 0)).toBeCloseTo(card.product.quantity, 3);
    expect((await tradeSearch({ departmentId: o.shop.id, q: "Ngono", timeZone: tz })).groups.debts.length).toBe(1);
    expect((await tradeSearch({ departmentId: o.shop.id, q: "6001234567890", timeZone: tz })).groups.products.length).toBe(1);

    const crates = await crateBoard({ departmentId: o.bar.id, timeZone: tz });
    expect(crates.totals.depositsWithSuppliers).toBe(3600);
    const barDash = await tradeDashboard({ department: o.bar, todayKey: t, timeZone: tz });
    expect(barDash.crates).toBeTruthy();

    const pressing = await serviceReport({ department: o.pressing, ...range });
    expect(pressing.tickets.revenue).toBe(7500);
    expect(pressing.income.servicesRevenue).toBe(7500);
    const wash = await serviceReport({ department: o.carWash, ...range });
    expect(wash.tickets.loyalty.count).toBe(1);
    const board = await workerBoard({ departmentId: o.carWash.id, ...range });
    expect(board.workers.reduce((s, w) => s + w.earned, 0)).toBe(wash.workers.reduce((s, w) => s + w.period.commission, 0));
    const wd = await serviceDashboard({ department: o.carWash, todayKey: t, timeZone: tz });
    expect(wd.warnings.every((w) => w.title && w.count)).toBe(true);
    const customers = await serviceCustomers({ department: o.carWash, timeZone: tz, todayKey: t });
    expect(customers.find((c) => c.plates.length)?.visits).toBeGreaterThan(1);
    expect((await serviceSearch({ department: o.pressing, q: "TK", timeZone: tz, todayKey: t })).groups.tickets.length).toBeGreaterThan(0);
    expect(Array.isArray(await ticketList({ department: o.other, view: "cancelled", timeZone: tz, todayKey: t }))).toBe(true);
  });

  it("automatic reports and morning alerts reach the Boss and heads once; the Boss's cards show the figures", async () => {
    const { sendTradeReports, sendTradeAlerts } = await import("@/lib/trade/periodic-reports");
    const { bossOverview } = await import("@/lib/boss/overview");
    const tz = o.org.timezone;
    const tomorrow = new Date(Date.now() + 86400000);
    expect(await sendTradeReports({ organizationId: o.org.id, timeZone: tz, kind: "daily", now: tomorrow })).toBe(5);
    expect(await sendTradeReports({ organizationId: o.org.id, timeZone: tz, kind: "daily", now: tomorrow })).toBe(0);
    const note = await db.notification.findFirst({ where: { departmentId: o.shop.id, kind: "TRADE_DAILY_REPORT", userId: o.boss.id } });
    expect(note.body).toMatch(/Sales .* margin .* profit/);
    const wash = await db.notification.findFirst({ where: { departmentId: o.carWash.id, kind: "TRADE_DAILY_REPORT" } });
    expect(wash.body).toMatch(/collected/);
    const first = await sendTradeAlerts({ organizationId: o.org.id, timeZone: tz });
    expect(await sendTradeAlerts({ organizationId: o.org.id, timeZone: tz })).toBe(0);
    expect(first).toBeGreaterThanOrEqual(0);
    const departments = await db.department.findMany({ where: { organizationId: o.org.id } });
    const ov = await bossOverview({ organizationId: o.org.id, departments, dateKey: t, timeZone: tz });
    const shop = ov.cards.find((c) => c.id === o.shop.id);
    expect(shop.trade.sales).toBeGreaterThan(0);
    expect(shop.trade.stockValue).toBeGreaterThan(0);
    expect(ov.cards.find((c) => c.id === o.carWash.id).services).toBeTruthy();
    expect(ov.cards.find((c) => c.id === o.other.id)).toMatchObject({ trade: expect.any(Object), services: expect.any(Object) });
  });

  it("the ledger (Full accounting) agrees with the statements, month by month", async () => {
    const r = await checkLedger({ organizationId: o.org.id, boss: o.boss, months: 1 });
    expect(r.built.posted).toBeGreaterThan(10);
    const n = (x) => r.tb.rows.find((row) => row.number === x)?.closing || 0;
    expect(n("4094")).toBe(3600 * 4 - 3600 * 2 - 3600);
    expect(n("4194")).toBe(-1800);
    expect(n("311")).toBeGreaterThan(0);
  });
});
