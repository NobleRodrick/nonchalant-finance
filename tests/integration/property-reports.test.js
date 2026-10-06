import { beforeAll, describe, expect, it, vi } from "vitest";
import { hasDb, key, loginAs, ok, setupPropertyOrganization } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { propertyOperation as op } from "@/actions/property";
import { recordMoney } from "@/actions/money";
import { toDateKey } from "@/lib/timezone";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";
import { propertyReport, propertyStatementFigures, propertyTrends } from "@/lib/property/reports";
import { propertyDashboard } from "@/lib/property/dashboard";
import { propertySearch } from "@/lib/property/search";
import { propertyCalendar } from "@/lib/property/calendar";
import { arrears, tenantDetail } from "@/lib/property/lease-queries";
import { sendPropertyAlerts, sendPropertyReports } from "@/lib/property/periodic-reports";
import { buildStatements } from "@/lib/finance/statements";
import { bossOverview } from "@/lib/boss/overview";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

const TZ = "Africa/Douala";
const t = toDateKey(new Date(), TZ);
const m0 = monthOf(t);
const monthEnd = (m) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)), 0)).toISOString().slice(0, 10);

/**
 * A month with known figures: A12 (Place Étoilée, 150 000) let for three months and paid once,
 * Office 01 (Main Building, 100 000) let from the 1st and paid, electricity billed, a deposit,
 * an expense of the building, an urgent repair, an empty office.
 */
describe.skipIf(!hasDb)("property rental: reports, statements, dashboard, search, calendar, alerts", () => {
  let o;
  let a12;
  let o01;
  let xyz;
  let b;
  beforeAll(async () => {
    o = await setupPropertyOrganization("Reports");
    await loginAs(o.head.id, o.rentals.id);
    const id = (r) => ok(r).unitId;
    a12 = id(await op("property.unit.save", { departmentId: o.rentals.id, buildingId: o.etoilee.id, name: "A12", listRent: 150000, depositRequired: 300000, charges: [{ kind: "ELECTRICITY", method: "METER", rate: 100, lastReading: 0 }] }));
    o01 = id(await op("property.unit.save", { departmentId: o.rentals.id, buildingId: o.main.id, name: "Office 01", listRent: 100000 }));
    id(await op("property.unit.save", { departmentId: o.rentals.id, buildingId: o.main.id, name: "Office 02", listRent: 80000 }));
    xyz = ok(await op("property.lease.create", { departmentId: o.rentals.id, unitId: a12, tenant: { name: "XYZ Company", phone: "677000111", email: "xyz@test.local" }, startKey: `${addMonths(m0, -2)}-01`, dueDay: 1, status: "ACTIVE" })).leaseId;
    b = ok(await op("property.lease.create", { departmentId: o.rentals.id, unitId: o01, tenant: { name: "Tenant B" }, startKey: `${m0}-01`, dueDay: 1, status: "ACTIVE" })).leaseId;
    ok(await op("property.payment.record", { departmentId: o.rentals.id, leaseId: xyz, amount: 150000, idempotencyKey: key() }));
    ok(await op("property.payment.record", { departmentId: o.rentals.id, leaseId: b, amount: 100000, paymentMethod: "MOMO", reference: "MP1", idempotencyKey: key() }));
    ok(await op("property.deposit.receive", { departmentId: o.rentals.id, leaseId: xyz, amount: 300000, idempotencyKey: key() }));
    ok(await op("property.charge.add", { departmentId: o.rentals.id, leaseId: xyz, kind: "ELECTRICITY", monthKey: addMonths(m0, -1), currentReading: 250, dueKey: t }));
    ok(await recordMoney({ departmentId: o.rentals.id, type: "EXPENSE", amount: 20000, category: "property-security", description: "Guards", counterparty: "SecurCam", buildingId: o.etoilee.id, idempotencyKey: key() }));
    ok(await op("property.maintenance.report", { departmentId: o.rentals.id, unitId: a12, title: "No water", priority: "URGENT" }));
  });

  it("the month: rent on its month, electricity on its bill date, deposits apart, expenses by building", async () => {
    const r = await propertyReport({ departmentId: o.rentals.id, organizationId: o.org.id, fromKey: `${m0}-01`, toKey: monthEnd(m0), timeZone: TZ, todayKey: t });
    expect(r.income).toMatchObject({ rent: 250000, utilities: 25000, expenses: 20000, revenue: 275000, net: 255000 });
    expect(r.rent).toMatchObject({ expected: 250000, collected: 250000 });
    expect(r.cashFlow).toMatchObject({ tenantPayments: 250000, depositsIn: 300000, bankAndMomo: 100000 });
    expect(r.deposits.held).toBe(300000);
    expect(r.arrears.owed).toBe(300000 + 25000); // XYZ: two months + electricity
    expect(r.occupancy).toMatchObject({ total: 3, OCCUPIED: 2, vacant: 1 });
    const etoilee = r.by.buildings.find((x) => x.name === "Place Étoilée");
    expect(etoilee).toMatchObject({ rent: 150000, charges: 25000, expenses: 20000, net: 155000 });
    expect(r.by.tenants.map((x) => x.name)).toEqual(["XYZ Company", "Tenant B"]);
  });

  it("the company statements and the Boss's overview count the department the same way", async () => {
    const st = await buildStatements({ organizationId: o.org.id, departments: [o.rentals], fromKey: `${m0}-01`, toKey: monthEnd(m0), timeZone: TZ, compare: false });
    expect(st.income.rentRevenue).toBe(275000);
    const f = await propertyStatementFigures({ departments: [o.rentals], fromKey: `${m0}-01`, toKey: monthEnd(m0), timeZone: TZ });
    expect(f[o.rentals.id].rentRevenue).toBe(275000);
    const departments = await db.department.findMany({ where: { organizationId: o.org.id } });
    const ov = await bossOverview({ organizationId: o.org.id, departments, dateKey: t, timeZone: TZ });
    const card = ov.cards.find((c) => c.id === o.rentals.id);
    expect(card.property).toMatchObject({ occupied: 2, offices: 3, owed: 325000, depositsHeld: 300000 });
    expect(ov.alerts.some((a) => /overdue rent|maintenance request/.test(a.text))).toBe(true);
    const trend = await propertyTrends({ department: o.rentals, toKey: t, months: 3, timeZone: TZ });
    expect(trend.map((m) => m.rent)).toEqual([150000, 150000, 250000]);
  });

  it("dashboard alerts, arrears filters, search “owing more than”, the tenant's history, the calendar", async () => {
    const d = await propertyDashboard({ departmentId: o.rentals.id, todayKey: t, timeZone: TZ });
    expect(d.warnings.map((w) => w.key)).toEqual(expect.arrayContaining(["overdue-rent", "unpaid-utilities", "vacant", "maintenance"]));
    expect(d.tenants).toMatchObject({ total: 2, owing: 1, paid: 1 });
    const a = await arrears({ departmentId: o.rentals.id, todayKey: t, minMonths: 2 });
    expect(a.rows.map((r) => r.tenant.name)).toEqual(["XYZ Company"]);
    expect((await arrears({ departmentId: o.rentals.id, todayKey: t, buildingId: o.main.id })).rows).toEqual([]);
    const s = await propertySearch({ departmentId: o.rentals.id, q: "owing more than 100000", todayKey: t, timeZone: TZ });
    expect(s.groups.owing.map((x) => x.title)).toEqual([expect.stringMatching(/^XYZ Company/)]);
    const s2 = await propertySearch({ departmentId: o.rentals.id, q: "677000", todayKey: t, timeZone: TZ });
    expect(s2.groups.tenants.map((x) => x.title)).toEqual(["XYZ Company"]);
    const tenant = await tenantDetail({ departmentId: o.rentals.id, clientId: (await db.propertyLease.findUnique({ where: { id: xyz } })).clientId, todayKey: t, timeZone: TZ });
    expect(tenant).toMatchObject({ owed: 325000, depositHeld: 300000, paid: 150000 });
    expect(tenant.leases[0].statement.closing).toBe(325000);
    const cal = await propertyCalendar({ departmentId: o.rentals.id, monthKey: m0, todayKey: t, timeZone: TZ });
    expect(cal.entries.filter((e) => e.kind === "RENT_DUE" && e.dateKey === `${m0}-01`).map((e) => e.label).sort()).toEqual(["Tenant B · Office 01 · Main Building", "XYZ Company · A12 · Place Étoilée"]);
  });

  it("the morning alert and the periodic reports reach the Boss and both heads, once", async () => {
    expect(await sendPropertyAlerts({ organizationId: o.org.id, timeZone: TZ })).toBe(1);
    expect(await sendPropertyAlerts({ organizationId: o.org.id, timeZone: TZ })).toBe(0);
    const alerts = await db.notification.findMany({ where: { organizationId: o.org.id, kind: "PROPERTY_ALERTS" } });
    expect(alerts.map((n) => n.userId).sort()).toEqual([o.boss.id, o.head.id, o.head2.id].sort());
    expect(await sendPropertyReports({ organizationId: o.org.id, timeZone: TZ, kind: "monthly" })).toBe(1);
    expect(await sendPropertyReports({ organizationId: o.org.id, timeZone: TZ, kind: "monthly" })).toBe(0);
    const rep = await db.notification.findFirst({ where: { organizationId: o.org.id, kind: "PROPERTY_MONTHLY_REPORT", userId: o.boss.id } });
    expect(rep.body).toMatch(/^Rent collected .* · income .* · owed .* occupied/);
    // A reminder was attempted for the tenant with an e-mail (recorded even without e-mail set up).
    expect(await db.auditEvent.count({ where: { departmentId: o.rentals.id, action: "PROPERTY_REMINDER_SENT", entityId: xyz } })).toBe(1);
  });
});
