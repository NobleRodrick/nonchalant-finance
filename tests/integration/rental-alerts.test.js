import { describe, expect, it, vi } from "vitest";
import { hasDb, key, loginAs, ok, setupRentalOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { createRentalOrder, dispatchRentalOrder, recordRentalPayment, saveRentalItem } from "@/actions/rental";
import { addDaysToKey, toDateKey } from "@/lib/timezone";
import { reportPeriod } from "@/lib/reports/periodic";
import { rentalDashboard } from "@/lib/rental/dashboard";
import { sendRentalAlerts, sendRentalReports } from "@/lib/rental/periodic-reports";
import { bossOverview } from "@/lib/boss/overview";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const TZ = "Africa/Douala";
const t = toDateKey(new Date(), TZ);
const d = (n) => addDaysToKey(t, n);

describe("report periods (pure)", () => {
  it("monthly: the whole previous month", () => {
    expect(reportPeriod("monthly", "2026-11-01")).toEqual({ fromKey: "2026-10-01", toKey: "2026-10-31" });
    expect(reportPeriod("monthly", "2026-03-15")).toEqual({ fromKey: "2026-02-01", toKey: "2026-02-28" });
  });
});

describe.skipIf(!hasDb)("event rental: dashboard warnings, morning alerts, automatic reports", () => {
  it("warns about late returns, unpaid events soon, bookings to prepare, refused bookings and low stock; alerts once a day", async () => {
    const o = await setupRentalOrganization("Alerts");
    await loginAs(o.head.id, o.deco.id);
    const chairs = ok(await saveRentalItem({ departmentId: o.deco.id, name: "Chairs", category: "Chairs", rentalPrice: 500, openingQuantity: 100, lowStockLevel: 20 })).itemId;
    // Out since 3 days ago, due back yesterday: late.
    const late = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Late Larry" }, eventType: "Party", eventDateKey: t, dispatchDateKey: t, returnDateKey: d(1), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 30 }] })).orderId;
    ok(await dispatchRentalOrder({ departmentId: o.deco.id, orderId: late }));
    await db.rentalOrder.update({ where: { id: late }, data: { dispatchDate: new Date(`${d(-3)}T00:00:00Z`), eventDate: new Date(`${d(-2)}T00:00:00Z`), returnDate: new Date(`${d(-1)}T00:00:00Z`) } });
    // In 2 days, half paid: unpaid soon and to prepare.
    const soon = ok(await createRentalOrder({ departmentId: o.deco.id, client: { name: "Soon Sally" }, eventType: "Wedding", eventDateKey: d(2), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 60 }] })).orderId;
    ok(await recordRentalPayment({ departmentId: o.deco.id, orderId: soon, amount: 10000, idempotencyKey: key() }));
    // Refused: more chairs than there are.
    const refused = await createRentalOrder({ departmentId: o.deco.id, client: { name: "Big Ben" }, eventType: "Conference", eventDateKey: d(2), status: "CONFIRMED", lines: [{ itemId: chairs, quantity: 90 }] });
    expect(refused.success).toBe(false);

    const dash = await rentalDashboard({ departmentId: o.deco.id, todayKey: t, timeZone: TZ });
    const keys = dash.warnings.map((w) => w.key);
    expect(keys).toEqual(expect.arrayContaining(["late-returns", "unpaid-soon", "prepare", "refused"]));
    expect(dash.warnings.find((w) => w.key === "unpaid-soon").amount).toBe(20000);
    expect(dash.warnings.find((w) => w.key === "refused").rows[0].label).toMatch(/Chairs: 90 asked, 40 free/);
    expect(dash.today.returning.map((x) => x.id)).toEqual([late]);
    expect(dash.upcoming.map((x) => x.id)).toEqual([soon]);

    const departments = await db.department.findMany({ where: { organizationId: o.org.id } });
    const ov = await bossOverview({ organizationId: o.org.id, departments, dateKey: t, timeZone: TZ });
    const card = ov.cards.find((c) => c.id === o.deco.id);
    expect(card.rental).toMatchObject({ receivedFromClients: 10000, unitsOut: 30 });
    expect(card.rental.warnings.map((w) => w.key)).toContain("late-returns");
    expect(ov.alerts.some((a) => /not returned on time/.test(a.text))).toBe(true);

    expect(await sendRentalAlerts({ organizationId: o.org.id, timeZone: TZ })).toBe(1);
    expect(await sendRentalAlerts({ organizationId: o.org.id, timeZone: TZ })).toBe(0); // once a day
    const alerts = await db.notification.findMany({ where: { organizationId: o.org.id, kind: "RENTAL_ALERTS" } });
    expect(alerts.map((n) => n.userId).sort()).toEqual([o.boss.id, o.head.id, o.head2.id].sort());
    expect(alerts[0].body).toMatch(/1 booking not returned on time/);

    expect(await sendRentalReports({ organizationId: o.org.id, timeZone: TZ, kind: "daily" })).toBe(1);
    expect(await sendRentalReports({ organizationId: o.org.id, timeZone: TZ, kind: "daily" })).toBe(0);
    expect(await sendRentalReports({ organizationId: o.org.id, timeZone: TZ, kind: "monthly" })).toBe(1);
    const reports = await db.notification.findMany({ where: { organizationId: o.org.id, kind: { in: ["RENTAL_DAILY_REPORT", "RENTAL_MONTHLY_REPORT"] }, userId: o.boss.id } });
    expect(reports).toHaveLength(2);
    expect(reports.find((n) => n.kind === "RENTAL_DAILY_REPORT").body).toMatch(/^Revenue .* · profit .* · \d+ event\(s\) · collected/);
  });
});
