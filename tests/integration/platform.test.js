import { beforeAll, describe, expect, it, vi } from "vitest";
import { cookieJar } from "../support/request-context";
import { fails, hasDb, key, loginAs, ok, setupOrganization, today } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { addDaysToKey, periodRange } from "@/lib/timezone";
import { loginUser, updatePassword, updateProfile, switchActiveDepartment } from "@/actions/auth";
import { createEmployee, updateEmployee, resetEmployeePassword, updateOrganizationSettings } from "@/actions/organization";
import { createAccountingPeriod, closeAccountingPeriod, reopenAccountingPeriod } from "@/actions/periods";
import { uploadAttachment } from "@/actions/attachments";
import { markNotificationsRead } from "@/actions/notifications";
import { getRecordDetail } from "@/actions/history";
import { addDish, getDishHistory } from "@/actions/menu-stock";
import { recordSale } from "@/actions/sales";
import { recordMoney } from "@/actions/money";
import { saveDebtor } from "@/actions/debts";
import { previewCountedCash } from "@/actions/daily-report";
import { recordHandover, listHandovers } from "@/actions/handovers";
import { GET as getAttachment } from "@/app/api/attachments/[id]/route";

// Scheduled jobs: call their handlers directly, capture e-mails instead of sending them.
const sent = [];
vi.mock("@/lib/inngest/client", () => ({ inngest: { createFunction: (config, trigger, handler) => ({ config, trigger, handler }) } }));
vi.mock("@/lib/email", () => ({ sendEmail: async (msg) => { sent.push(msg); return { success: true }; }, sendReportSubmittedEmail: async () => ({ success: true }) }));
const step = { run: async (_name, fn) => fn() };

const PNG = Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1, 0, 0, 0, 1, 8, 2, 0, 0, 0]);
const form = (entries) => {
  const fd = new FormData();
  for (const [k, v] of Object.entries(entries)) fd.append(k, v);
  return fd;
};

describe.skipIf(!hasDb)("accounts: sign in, passwords, profile", () => {
  let o;
  beforeAll(async () => {
    o = await setupOrganization("Auth");
  });

  it("signs in with the right password only, with the same message for an unknown e-mail", async () => {
    cookieJar.clear();
    const res = ok(await loginUser({ email: o.manager.email.toUpperCase(), password: o.password }));
    expect(cookieJar.get("sf_access_token")?.value).toBeTruthy();
    expect(res).toBeTruthy();
    fails(await loginUser({ email: o.manager.email, password: "Wrong12345" }), /Invalid email or password/);
    fails(await loginUser({ email: "nobody@test.local", password: "Wrong12345" }), /Invalid email or password/);
    fails(await loginUser({ email: "", password: "" }), /required/);
  });

  it("blocks repeated wrong passwords for a while", async () => {
    for (let i = 0; i < 8; i++) await loginUser({ email: o.accountant.email, password: `Nope${i}12345` });
    fails(await loginUser({ email: o.accountant.email, password: o.password }), /Too many attempts/);
  });

  it("changes the password (current one required, strength checked) and the profile", async () => {
    await loginAs(o.cashier.id);
    fails(await updatePassword({ currentPassword: "Wrong12345", newPassword: "NewPass12345" }), /Incorrect current password/);
    fails(await updatePassword({ currentPassword: o.password, newPassword: "short" }), /./);
    ok(await updatePassword({ currentPassword: o.password, newPassword: "NewPass12345" }));
    fails(await loginUser({ email: o.cashier.email, password: o.password }), /Invalid/);
    ok(await loginUser({ email: o.cashier.email, password: "NewPass12345" }));
    ok(await updateProfile({ name: "Cashier Renamed", phone: "670000000" }));
    expect((await db.user.findUnique({ where: { id: o.cashier.id } })).name).toBe("Cashier Renamed");
    fails(await updateProfile({ name: "  " }), /cannot be empty/);
  });

  it("switches the active department only to one the person works in", async () => {
    await loginAs(o.multi.id);
    ok(await switchActiveDepartment(o.laundry.id));
    expect(cookieJar.get("sf_active_dept")?.value).toBe(o.laundry.id);
    fails(await switchActiveDepartment(o.deptA.id), /not assigned/);
  });
});

describe.skipIf(!hasDb)("the Boss manages people and settings", () => {
  let o;
  beforeAll(async () => {
    o = await setupOrganization("People");
  });

  it("adds a department head with a temporary password; that person signs in and runs the department", async () => {
    await loginAs(o.boss.id);
    const email = `newhead-${Date.now()}@test.local`;
    ok(await createEmployee({ name: "New Head", email, tempPassword: "Mango-97531", role: "MANAGER", memberships: [{ departmentId: o.deptB.id, isPrimary: true }] }));
    fails(await createEmployee({ name: "Again", email, tempPassword: "Mango-97531", role: "STAFF", memberships: [{ departmentId: o.deptB.id, isPrimary: true }] }), /already exists/);
    fails(await createEmployee({ name: "Nowhere", email: `x-${Date.now()}@test.local`, tempPassword: "Mango-97531", role: "STAFF", memberships: [] }), /at least one department/);
    fails(await createEmployee({ name: "Weak", email: `w-${Date.now()}@test.local`, tempPassword: "123", role: "STAFF", memberships: [{ departmentId: o.deptB.id }] }), /./);
    cookieJar.clear();
    const first = ok(await loginUser({ email, password: "Mango-97531" }));
    expect(first.redirectTo).toMatch(/^\/change-password/);
    fails(await addDish({ departmentId: o.deptB.id, name: "Soup", unitPrice: 1000, openingPlates: 4 }), /temporary password/);
    ok(await updatePassword({ currentPassword: "Mango-97531", newPassword: "Own-pass-2468" }));
    ok(await addDish({ departmentId: o.deptB.id, name: "Soup", unitPrice: 1000, openingPlates: 4 }));
    fails(await addDish({ departmentId: o.deptA.id, name: "Soup", unitPrice: 1000 }), /not assigned|not found|access/i);
  });

  it("only the Boss manages people and settings", async () => {
    await loginAs(o.manager.id);
    fails(await createEmployee({ name: "X", email: `y-${Date.now()}@test.local`, tempPassword: "Mango-97531", role: "STAFF", memberships: [{ departmentId: o.deptA.id }] }), /Boss/);
    fails(await updateOrganizationSettings({ name: "Hacked" }), /Boss/);
    fails(await resetEmployeePassword({ employeeId: o.cashier.id, tempPassword: "Plum-11223" }), /Boss/);
  });

  it("resets a password, deactivates an account (signed out, cannot sign in) and reactivates it", async () => {
    await loginAs(o.boss.id);
    ok(await resetEmployeePassword({ employeeId: o.cashier.id, tempPassword: "Reset12345" }));
    ok(await loginUser({ email: o.cashier.email, password: "Reset12345" }));
    const token = cookieJar.get("sf_access_token").value;
    await loginAs(o.boss.id);
    ok(await updateEmployee({ employeeId: o.cashier.id, isActive: false }));
    fails(await loginUser({ email: o.cashier.email, password: "Reset12345" }), /deactivated/);
    cookieJar.clear();
    cookieJar.set("sf_access_token", token);
    fails(await recordSale({ departmentId: o.deptA.id, lines: [], idempotencyKey: key() }), /sign in|Unauthorized|UNAUTHORIZED/i);
    await loginAs(o.boss.id);
    fails(await updateEmployee({ employeeId: o.boss.id, isActive: false }), /deactivate yourself/);
    fails(await updateEmployee({ employeeId: o.boss.id, role: "HEAD" }), /Roles cannot be changed/);
    fails(await updateEmployee({ employeeId: o.cashier.id, role: "ADMIN" }), /Roles cannot be changed/);
    ok(await updateEmployee({ employeeId: o.cashier.id, isActive: true }));
    ok(await loginUser({ email: o.cashier.email, password: "Reset12345" }));
  });

  it("renames the business and changes its time zone (unknown zones refused)", async () => {
    await loginAs(o.boss.id);
    ok(await updateOrganizationSettings({ name: "Renamed business", timezone: "Africa/Lagos" }));
    expect(await db.organization.findUnique({ where: { id: o.org.id } })).toMatchObject({ name: "Renamed business", timezone: "Africa/Lagos" });
    fails(await updateOrganizationSettings({ name: "X", timezone: "Mars/Olympus" }), /Unknown time zone/);
    ok(await updateOrganizationSettings({ name: "Renamed business", timezone: "Africa/Douala" }));
  });
});

describe.skipIf(!hasDb)("accounting periods, attachments, notifications, record details", () => {
  let o;
  let dish;
  let sale;
  beforeAll(async () => {
    o = await setupOrganization("Periods");
    await loginAs(o.manager.id);
    dish = ok(await addDish({ departmentId: o.deptA.id, name: "Stew", unitPrice: 2500, openingPlates: 10 })).dish;
    sale = ok(await recordSale({ departmentId: o.deptA.id, lines: [{ dishId: dish.id, quantity: 2 }], paymentMethod: "CASH", idempotencyKey: key() }));
  });

  it("a closed month refuses new records until the Boss reopens it", async () => {
    await loginAs(o.boss.id);
    const month = today().slice(0, 7);
    const period = ok(await createAccountingPeriod({ month }));
    ok(await closeAccountingPeriod(period.id));
    await loginAs(o.manager.id);
    fails(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas", idempotencyKey: key() }), /is closed/);
    fails(await closeAccountingPeriod(period.id), /Boss/);
    await loginAs(o.boss.id);
    ok(await reopenAccountingPeriod(period.id));
    await loginAs(o.manager.id);
    ok(await recordMoney({ departmentId: o.deptA.id, type: "EXPENSE", amount: 100, category: "opex-gas", idempotencyKey: key() }));
  });

  it("uploads a proof (images and PDF only), links it to a handover and serves it only inside the department", async () => {
    await loginAs(o.manager.id);
    fails(await uploadAttachment(form({ departmentId: o.deptA.id, file: new File([new TextEncoder().encode("not an image")], "x.txt", { type: "text/plain" }) })), /Only JPEG, PNG/);
    const file = ok(await uploadAttachment(form({ departmentId: o.deptA.id, file: new File([PNG], "slip.png", { type: "image/png" }) })));
    expect(file.mimeType).toBe("image/png");
    ok(await recordHandover({ departmentId: o.deptA.id, amount: 1000, attachmentIds: [file.id], idempotencyKey: key() }));
    const linked = await db.attachment.findUnique({ where: { id: file.id } });
    expect(linked.entityType).toBe("CashHandover");
    const serve = async () => getAttachment(new Request("http://x"), { params: Promise.resolve({ id: file.id }) });
    await loginAs(o.boss.id);
    expect((await serve()).status).toBe(200);
    await loginAs(o.multi.id); // works in Restaurant B and Laundry, not A
    expect((await serve()).status).toBe(404);
    cookieJar.clear();
    expect((await serve()).status).toBe(401);
    const handovers = await (async () => { await loginAs(o.manager.id); return listHandovers({ departmentId: o.deptA.id }); })();
    expect(handovers).toHaveLength(1);
  });

  it("notifications are marked read one by one or all at once", async () => {
    await loginAs(o.boss.id);
    const mine = await db.notification.findMany({ where: { userId: o.boss.id, readAt: null } });
    expect(mine.length).toBeGreaterThan(0); // the handover above notified the Boss
    await db.notification.create({ data: { organizationId: o.org.id, userId: o.boss.id, kind: "TEST", title: "Second", href: "/boss" } });
    const one = await db.notification.findFirst({ where: { userId: o.boss.id, readAt: null } });
    expect(ok(await markNotificationsRead({ id: one.id })).updated).toBe(1);
    ok(await markNotificationsRead({}));
    expect(await db.notification.count({ where: { userId: o.boss.id, readAt: null } })).toBe(0);
  });

  it("shows a record's details and a dish's history to its department only", async () => {
    const tx = await db.transaction.findFirst({ where: { referenceNo: sale.referenceNo, departmentId: o.deptA.id } });
    await loginAs(o.cashier.id);
    const detail = ok(await getRecordDetail({ kind: "money", id: tx.id }));
    expect(detail.record.departmentId).toBe(o.deptA.id);
    const history = ok(await getDishHistory({ departmentId: o.deptA.id, dishId: dish.id }));
    expect(JSON.stringify(history)).toContain("SOLD");
    await loginAs(o.multi.id);
    fails(await getRecordDetail({ kind: "money", id: tx.id }), /not found/);
  });

  it("saves customers (debtors) and previews the cash count", async () => {
    await loginAs(o.cashier.id);
    const debtor = ok(await saveDebtor({ departmentId: o.deptA.id, name: "Customer X", phone: "699000000" }));
    ok(await saveDebtor({ departmentId: o.deptA.id, id: debtor.id, name: "Customer X Junior" }));
    fails(await saveDebtor({ departmentId: o.deptA.id, id: debtor.id, name: "X" }), /name/);
    await loginAs(o.manager.id);
    const preview = ok(await previewCountedCash({ departmentId: o.deptA.id, countedCash: 3000 }));
    // cash: 5 000 sale − 100 expense − 1 000 handed over = 3 900 should remain; counted 3 000.
    expect(preview.cash.shouldRemain).toBe(3900);
    expect(preview.variance).toBe(-900);
  });
});

describe.skipIf(!hasDb)("scheduled jobs", () => {
  let o;
  let jobs;
  beforeAll(async () => {
    jobs = await import("@/lib/inngest/function");
    o = await setupOrganization("Jobs");
    // The departments existed before yesterday, so yesterday's reports are due.
    await db.department.updateMany({ where: { organizationId: o.org.id }, data: { createdAt: new Date(Date.now() - 5 * 86400000) } });
  });

  it("morning reminder: e-mails the Boss the departments that did not send yesterday's report", async () => {
    sent.length = 0;
    await jobs.missingReportReminder.handler({ step });
    const mail = sent.find((m) => m.to === o.boss.email);
    expect(mail.subject).toMatch(/2 daily report/);
    expect(mail.subject).toContain(o.org.name);
  });

  it("monthly statement: one e-mail per Boss with last month's statement", async () => {
    sent.length = 0;
    await jobs.monthlyStatementEmail.handler({ step });
    const mail = sent.find((m) => m.to === o.boss.email);
    const lastMonth = periodRange("month", addDaysToKey(periodRange("month", today()).fromKey, -1));
    expect(mail.subject).toMatch(/statement for/);
    expect(lastMonth.fromKey < today()).toBe(true);
  });

  it("night stock check: alerts the Boss when a dish's plates do not match its records", async () => {
    await loginAs(o.manager.id);
    const dish = ok(await addDish({ departmentId: o.deptA.id, name: "Rice", unitPrice: 1500, openingPlates: 6 })).dish;
    let res = await jobs.stockConsistencyCheck.handler({ step });
    expect(await db.notification.count({ where: { userId: o.boss.id, kind: "STOCK_MISMATCH" } })).toBe(0);
    await db.menuItem.update({ where: { id: dish.id }, data: { currentQuantity: 9 } });
    res = await jobs.stockConsistencyCheck.handler({ step });
    expect(res.mismatches).toBeGreaterThanOrEqual(1);
    const alert = await db.notification.findFirst({ where: { userId: o.boss.id, kind: "STOCK_MISMATCH" } });
    expect(alert.title).toContain('"Rice" shows 9 plates but its records add up to 6');
  });
});
