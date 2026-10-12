import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupOrganization, setupTradeOrganization, setupVenueOrganization, today, yesterday } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { recordMoney, voidRecord } from "@/actions/money";
import { recordHandover, reviewHandover } from "@/actions/handovers";
import { tradeOperation as op } from "@/actions/trade";
import { createBooking, saveHall } from "@/actions/venue";
import { setAccountingLevelAction, setFeaturesAction } from "@/actions/accounting";
import { executeOperation } from "@/lib/operations/execute";
import { getCurrentUser } from "@/lib/auth";
import { syncCompany, syncDepartment } from "@/lib/accounting/sync";
import { drawerNow } from "@/lib/finance/posting-service";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";

const active = (where) => db.journalEntry.findMany({ where: { status: "POSTED", reversedAt: null, reversalOfId: null, ...where } });

/**
 * Correctness of the books in the edge cases found by the review of Oct 2026: a disputed handover,
 * a dated fact moved, VAT in stock value, voids dated like their records, the cash drawer that never
 * goes below zero.
 */
describe.skipIf(!hasDb)("money stays right in the books", () => {
  let o;
  let company;
  beforeAll(async () => {
    o = await setupOrganization("Books right");
    company = await db.company.findFirst({ where: { organizationId: o.org.id, isDefault: true } });
    await loginAs(o.boss.id);
    ok(await setAccountingLevelAction({ companyId: company.id, level: "FULL" }));
  });

  it("a disputed handover posts nothing and the cash counts in the drawer again; it is not confirmed twice", async () => {
    await loginAs(o.manager.id, o.deptA.id);
    ok(await recordMoney({ departmentId: o.deptA.id, type: "OTHER_INCOME", amount: 50000, category: "income-catering", idempotencyKey: key() }));
    const h1 = ok(await recordHandover({ departmentId: o.deptA.id, amount: 50000, idempotencyKey: key() }));
    await loginAs(o.boss.id);
    ok(await reviewHandover({ handoverId: h1.handoverId, status: "DISPUTED", note: "Only 45 000 received" }));
    await syncCompany(company.id, { full: false });
    expect(await active({ sourceKey: `tx:${h1.transactionId}` })).toHaveLength(0);
    // The head hands the cash over again (it is in the drawer); the books show one handover.
    await loginAs(o.manager.id, o.deptA.id);
    const h2 = ok(await recordHandover({ departmentId: o.deptA.id, amount: 50000, idempotencyKey: key() }));
    await loginAs(o.boss.id);
    ok(await reviewHandover({ handoverId: h2.handoverId, status: "CONFIRMED" }));
    // Confirming the disputed one now would take the same cash twice; a confirmed one stays confirmed.
    fails(await reviewHandover({ handoverId: h1.handoverId, status: "CONFIRMED" }), /no longer holds this cash/);
    fails(await reviewHandover({ handoverId: h2.handoverId, status: "DISPUTED", note: "x" }), /already confirmed/);
    await syncCompany(company.id, { full: false });
    const handed = await db.journalLine.aggregate({ where: { companyId: company.id, entry: { status: "POSTED" }, account: { number: "5712" } }, _sum: { debit: true, credit: true } });
    expect((handed._sum.debit || 0) - (handed._sum.credit || 0)).toBe(50000);
  });

  it("the drawer never goes below zero: a handover dated earlier, two at once, or voiding cash already handed over", async () => {
    await loginAs(o.multi.id, o.deptB.id);
    const income = ok(await recordMoney({ departmentId: o.deptB.id, type: "OTHER_INCOME", amount: 10000, category: "income-catering", dateKey: yesterday(), idempotencyKey: key() }));
    ok(await recordHandover({ departmentId: o.deptB.id, amount: 10000, idempotencyKey: key() }));
    fails(await recordHandover({ departmentId: o.deptB.id, amount: 10000, dateKey: yesterday(), idempotencyKey: key() }), /should hold 0/);
    fails(await voidRecord({ transactionId: income.transactionId, reason: "Typed twice" }), /already handed over/);
    // Two devices hand over the same cash at the same moment: one wins.
    ok(await recordMoney({ departmentId: o.deptB.id, type: "OTHER_INCOME", amount: 8000, category: "income-catering", idempotencyKey: key() }));
    const user = await getCurrentUser();
    const both = await Promise.allSettled([1, 2].map(() => executeOperation({ user, kind: "handover.record", key: key(), input: { departmentId: o.deptB.id, amount: 8000 } })));
    expect(both.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    const drawer = await drawerNow(db, { organizationId: o.org.id, departmentId: o.deptB.id });
    expect(drawer.shouldRemain).toBe(0);
  });
});

describe.skipIf(!hasDb)("dated facts and stock in the books", () => {
  it("an event moved from an old month into a recent one replaces its entry instead of a second revenue", async () => {
    const v = await setupVenueOrganization("Moved event");
    await loginAs(v.head.id);
    ok(await saveHall({ departmentId: v.venue.id, name: "Hall", basePrice: 500000, reservationHoldDays: 7 }));
    const b = ok(await createBooking({ departmentId: v.venue.id, eventDateKey: addDaysToKey(today(), 20), eventType: "Wedding", agreedPrice: 500000, priceNote: "Package", client: { name: "Family A", phone: "690000009" } }));
    const old = `${addMonths(monthOf(today()), -5)}-15`;
    const recent = `${addMonths(monthOf(today()), -1)}-15`;
    await db.venueBooking.update({ where: { id: b.bookingId }, data: { status: "COMPLETED", eventDate: new Date(`${old}T00:00:00Z`) } });
    await loginAs(v.boss.id);
    const company = await db.company.findFirst({ where: { organizationId: v.org.id, isDefault: true } });
    ok(await setAccountingLevelAction({ companyId: company.id, level: "FULL" }));
    expect(await active({ sourceKey: `venue-event:${b.bookingId}` })).toHaveLength(1);
    // The event is moved to last month; an ordinary sync (recent months only) runs.
    await db.venueBooking.update({ where: { id: b.bookingId }, data: { eventDate: new Date(`${recent}T00:00:00Z`) } });
    await syncDepartment(v.venue.id, { full: false });
    const after = await active({ sourceKey: `venue-event:${b.bookingId}` });
    expect(after).toHaveLength(1);
    expect(toDateKey(after[0].date)).toBe(recent);
    // The nightly full sync keeps it as it is.
    await syncCompany(company.id, { full: true });
    expect(await active({ sourceKey: `venue-event:${b.bookingId}` })).toEqual(after);
  });

  it("goods bought with deductible VAT enter the stock without it; a voided sale comes back on its own date", async () => {
    const t = await setupTradeOrganization("VAT stock");
    const company = await db.company.findFirst({ where: { organizationId: t.org.id, isDefault: true } });
    await loginAs(t.boss.id);
    ok(await setAccountingLevelAction({ companyId: company.id, level: "FULL" }));
    ok(await setFeaturesAction({ companyId: company.id, vatEnabled: true, vatSince: "2026-01-01", vatRate: 19.25 }));
    await loginAs(t.head.id, t.shop.id);
    const rice = ok(await op("trade.product.save", { departmentId: t.shop.id, name: "Rice", salePrice: 15000 })).productId;
    ok(await op("trade.purchase.record", { departmentId: t.shop.id, supplierName: "Grossiste", lines: [{ productId: rice, quantity: 10, total: 119250 }], taxAmount: 19250, paymentMethod: "CASH", idempotencyKey: key() }));
    const p = await db.tradeProduct.findUnique({ where: { id: rice } });
    expect(p).toMatchObject({ stockValue: 100000, costPrice: 10000 });
    // A sale yesterday, voided today: the goods come back dated yesterday, at the value they left at.
    const sale = ok(await op("trade.sale.record", { departmentId: t.shop.id, dateKey: yesterday(), lines: [{ productId: rice, quantity: 3 }], idempotencyKey: key() }));
    ok(await voidRecord({ transactionId: sale.transactionId, reason: "Wrong product" }));
    const back = await db.tradeMovement.findFirst({ where: { transactionId: sale.transactionId, kind: "RETURN" } });
    expect(toDateKey(back.date)).toBe(yesterday());
    expect(back.value).toBe(30000);
    expect(await db.tradeProduct.findUnique({ where: { id: rice } })).toMatchObject({ quantity: 10, stockValue: 100000 });
  });
});
