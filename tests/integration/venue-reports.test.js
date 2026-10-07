import { beforeAll, describe, expect, it } from "vitest";
import { fails, hasDb, key, loginAs, ok, setupVenueOrganization, today } from "../support/fixtures";
import { addDaysToKey } from "@/lib/timezone";
import {
  addBookingCharge, cancelBooking, completeBooking, confirmBooking, createBooking, recordBookingPayment, recordBookingRefund, recordCashCount, saveAssetCheck, saveHall,
  saveLead, saveVenueAsset, settleAssetIncident, setLeadStatus,
} from "@/actions/venue";
import { recordMoney } from "@/actions/money";
import { recordHandover } from "@/actions/handovers";
import { bookingChecks } from "@/lib/venue/asset-queries";
import { venueReport, venueSummary } from "@/lib/venue/reports";
import { buildStatements } from "@/lib/finance/statements";
import { bossOverview } from "@/lib/boss/overview";
import { db } from "@/lib/prisma";
import { venueReminders, sendVenueReminders } from "@/lib/venue/reminders";
import { checkLedger } from "../support/ledger-check";

/**
 * A reference period of an event venue, with every kind of record, and the figures every report
 * must show (accrual: events on their date; cash: the day money moves).
 */
describe.skipIf(!hasDb)("event venue: reports agree with the records", () => {
  let o;
  let report;
  const t = today();
  const d = (n) => addDaysToKey(t, n);

  beforeAll(async () => {
    o = await setupVenueOrganization("Reports");
    await loginAs(o.head.id);
    ok(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 500000 }));
    const chairs = ok(await saveVenueAsset({ departmentId: o.venue.id, name: "Chairs", category: "CHAIRS", quantity: 100, unitValue: 8000 })).assetId;

    // A: today's event, completed: 500 000 + a 40 000 charge, paid in full (cash + MoMo), an expense, a loss.
    const a = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: t, eventType: "Wedding", client: { name: "Client A", phone: "1" } }));
    ok(await addBookingCharge({ departmentId: o.venue.id, bookingId: a.bookingId, kind: "EXTRA_SERVICE", label: "Extra hours", amount: 40000 }));
    ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: a.bookingId, amount: 300000, receivedByName: "Aline", idempotencyKey: key() }));
    ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: a.bookingId, amount: 240000, paymentMethod: "MOMO", reference: "MP1", receivedByName: "Paul", idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.venue.id, type: "EXPENSE", amount: 30000, category: "venue-decoration", bookingId: a.bookingId, idempotencyKey: key() }));
    ok(await saveAssetCheck({ departmentId: o.venue.id, bookingId: a.bookingId, phase: "BEFORE", lines: [{ assetId: chairs, good: 100 }] }));
    ok(await saveAssetCheck({ departmentId: o.venue.id, bookingId: a.bookingId, phase: "AFTER", lines: [{ assetId: chairs, good: 98, damaged: 0 }] }));
    const [missing] = (await bookingChecks(o.venue.id, a.bookingId)).incidents;
    ok(await settleAssetIncident({ departmentId: o.venue.id, incidentId: missing.id, outcome: "LOSS" }));
    ok(await completeBooking({ departmentId: o.venue.id, bookingId: a.bookingId }));

    // B: cancelled, 100 000 paid, 40 000 given back: 60 000 kept.
    const b = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(20), eventType: "Party", client: { name: "Client B", phone: "2" } }));
    ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: b.bookingId, amount: 100000, receivedByName: "Aline", idempotencyKey: key() }));
    ok(await cancelBooking({ departmentId: o.venue.id, bookingId: b.bookingId, reason: "Client cancelled" }));
    ok(await recordBookingRefund({ departmentId: o.venue.id, bookingId: b.bookingId, amount: 40000, reason: "Partial refund", idempotencyKey: key() }));

    // C: upcoming, confirmed, 600 000 with 200 000 paid in advance.
    const c = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(30), eventType: "Gala", agreedPrice: 600000, client: { name: "Client C", phone: "3" } }));
    ok(await confirmBooking({ departmentId: o.venue.id, bookingId: c.bookingId }));
    ok(await recordBookingPayment({ departmentId: o.venue.id, bookingId: c.bookingId, amount: 200000, receivedByName: "Paul", idempotencyKey: key() }));

    // The hall: a general expense, other income, cash to the Boss, a cash count 5 000 short.
    ok(await recordMoney({ departmentId: o.venue.id, type: "EXPENSE", amount: 10000, category: "opex-electricity", idempotencyKey: key() }));
    ok(await recordMoney({ departmentId: o.venue.id, type: "OTHER_INCOME", amount: 25000, category: "venue-other-rental", idempotencyKey: key() }));
    ok(await recordHandover({ departmentId: o.venue.id, amount: 100000, idempotencyKey: key() }));
    fails(await recordCashCount({ departmentId: o.venue.id, countedCash: 440000 }), /explain it in the notes/);
    ok(await recordCashCount({ departmentId: o.venue.id, countedCash: 440000, notes: "5 000 missing, being checked" }));

    // Leads: one booked (C's), one lost, one open.
    const l1 = ok(await saveLead({ departmentId: o.venue.id, clientName: "Lead one", source: "Facebook" }));
    ok(await saveLead({ departmentId: o.venue.id, clientName: "Lead two", source: "Facebook" }));
    ok(await setLeadStatus({ departmentId: o.venue.id, leadId: l1.leadId, status: "LOST", reason: "Price" }));
    const l3 = ok(await saveLead({ departmentId: o.venue.id, clientName: "Lead three", source: "Referral" }));
    ok(await createBooking({ departmentId: o.venue.id, eventDateKey: d(40), eventType: "Birthday", leadId: l3.leadId, client: { name: "Lead three", phone: "4" } }));

    report = await venueReport({ departmentId: o.venue.id, organizationId: o.org.id, fromKey: t, toKey: t, timeZone: "Africa/Douala", todayKey: t });
  });

  it("income statement: events on their date, kept cancellations, other income, expenses, losses", () => {
    expect(report.income).toMatchObject({
      eventsRevenue: 540000,
      cancellationIncome: 60000,
      otherIncome: 25000,
      revenue: 625000,
      expenses: 40000,
      otherExpenses: 0,
      assetLosses: 16000,
      costs: 56000,
      result: 569000,
    });
  });

  it("cash flow and cash verification: received, refunded, handed over, to hand over, discrepancies", () => {
    expect(report.cashFlow).toMatchObject({ receivedFromClients: 840000, refunds: 40000, expenses: 40000, otherIncome: 25000, handedOver: 100000, cashIn: 625000, cashOut: 80000, closingCash: 445000 });
    expect(report.cashFlow.byMethod).toMatchObject({ CASH: 625000, MOMO: 240000 });
    expect(report.verification).toMatchObject({ recorded: 840000, handedOver: 100000, toHandOver: 445000, countVariance: -5000, discrepancies: 5000 });
    expect(report.verification.byPerson.map((p) => [p.receivedBy, p.total])).toEqual([["Aline", 400000], ["Paul", 440000]].sort((x, y) => y[1] - x[1]));
  });

  it("event profitability, outstanding balances, advances, bookings and leads", () => {
    expect(report.events).toHaveLength(1);
    expect(report.events[0]).toMatchObject({ revenue: 540000, expenses: 30000, losses: 16000, profit: 494000, margin: 91.5 });
    expect(report.eventExpenses).toBe(30000);
    expect(report.expensesByCategory.map((g) => [g.category, g.amount, g.forEvents])).toEqual([["venue-decoration", 30000, 30000], ["opex-electricity", 10000, 0]]);
    expect(report.revenueByEventType).toEqual([{ eventType: "Wedding", events: 1, revenue: 540000, profit: 494000, average: 540000 }]);
    expect(report.outstanding.total).toBe(400000 + 500000); // C 400 000 + L3's booking 500 000 (nothing paid)
    expect(report.outstanding.advances).toBe(200000);
    expect(report.bookings).toMatchObject({ COMPLETED: 1, total: 1 });
    expect(report.leads).toMatchObject({ total: 3, booked: 1, lost: 1, open: 1, conversionRate: 50 });
    expect(report.assets).toMatchObject({ loss: 16000, lossesSettled: 16000 });
    expect(report.byMonth.at(-1)).toMatchObject({ revenue: 540000, events: 1 });
    expect(report.byWeekday.reduce((s, w) => s + w.revenue, 0)).toBe(540000);
    expect(report.available.next30).toBe(29); // today is taken (completed event); B cancelled; C (d30) and L3 (d40) are later
  });

  it("the Boss's summary and the company statements show the same venue figures", async () => {
    const s = await venueSummary({ department: o.venue, organizationId: o.org.id, fromKey: t, toKey: t, timeZone: "Africa/Douala" });
    expect(s).toMatchObject({ revenue: 625000, result: 569000, handedOver: 100000, toHandOver: 445000, outstanding: 900000, discrepancies: 5000 });
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.venue], fromKey: t, toKey: t, timeZone: "Africa/Douala", compare: false });
    expect(st.income).toMatchObject({ eventsRevenue: 540000, cancellationIncome: 60000, otherIncome: 25000, moneyIn: 625000, expenses: 40000, assetLosses: 16000, moneyOut: 56000, result: 569000 });
    expect(st.perDepartment[0]).toMatchObject({ moneyIn: 625000, moneyOut: 56000, result: 569000 });
    expect(st.cash).toMatchObject({ cashIn: 625000, cashOut: 80000, handedOver: 100000, closing: 445000 });
  });

  it("the Boss overview: the venue card and the totals count events on their date, losses as a cost", async () => {
    const departments = await db.department.findMany({ where: { organizationId: o.org.id, isActive: true } });
    const ov = await bossOverview({ organizationId: o.org.id, departments, dateKey: t, timeZone: "Africa/Douala" });
    const card = ov.cards.find((c) => c.id === o.venue.id);
    expect(card).toMatchObject({ moneyIn: 625000, moneyOut: 56000, result: 569000 });
    expect(card.venue).toMatchObject({ receivedFromClients: 840000, outstanding: 900000, toHandOver: 445000, discrepancies: 5000, upcoming: 2 });
    expect(ov.kpis).toMatchObject({ moneyIn: 625000, moneyOut: 56000, result: 569000, debtsOwed: 900000 });
    expect(ov.kpis.month.result).toBeGreaterThanOrEqual(569000);
    expect(ov.alerts.some((a) => /cash discrepancies/.test(a.text))).toBe(true);
  });

  it("the ledger (Full accounting) agrees with the statements, month by month", async () => {
    const r = await checkLedger({ organizationId: o.org.id, boss: o.boss });
    expect(r.built.posted).toBeGreaterThan(0);
  });
});

describe.skipIf(!hasDb)("event venue: morning reminders", () => {
  it("expired holds and events soon with a balance reach the heads and the Boss", async () => {
    const o = await setupVenueOrganization("Reminders");
    await loginAs(o.head.id);
    const t = today();
    ok(await saveHall({ departmentId: o.venue.id, name: "Salle", basePrice: 300000 }));
    const r = ok(await createBooking({ departmentId: o.venue.id, eventDateKey: addDaysToKey(t, 2), eventType: "Party", client: { name: "Late payer", phone: "1" } }));
    await db.venueBooking.update({ where: { id: r.bookingId }, data: { holdUntil: new Date(`${addDaysToKey(t, -1)}T00:00:00Z`) } });
    const { holds, soon } = await venueReminders({ departmentId: o.venue.id, todayKey: t });
    expect(holds.map((b) => b.id)).toEqual([r.bookingId]);
    expect(soon.map((b) => [b.id, b.figures.balance])).toEqual([[r.bookingId, 300000]]);
    const sent = await sendVenueReminders({ organizationId: o.org.id, timeZone: "Africa/Douala" });
    expect(sent).toBe(4); // 2 reminders × (1 head + 1 Boss)
    const kinds = (await db.notification.findMany({ where: { userId: o.head.id, kind: { startsWith: "VENUE_" } } })).map((n) => n.kind).sort();
    expect(kinds).toEqual(["VENUE_BALANCE_DUE", "VENUE_HOLD_EXPIRED"]);
    // The booking still holds its date: nothing is released silently.
    expect((await db.venueBooking.findUnique({ where: { id: r.bookingId } })).status).toBe("RESERVED");
  });
});
