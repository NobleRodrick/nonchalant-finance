import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { cookieJar, headerJar } from "../support/request-context";
import { fails, hasDb, loginAs, ok, uid } from "../support/fixtures";
import { db } from "@/lib/prisma";
import { BCRYPT_COST, getCurrentUser, hashToken } from "@/lib/auth";
import { loginUser, registerBoss, signOutEverywhere, updatePassword } from "@/actions/auth";
import { createEmployee, createOrganization, resetEmployeePassword, updateEmployee } from "@/actions/organization";
import { addDish } from "@/actions/menu-stock";

vi.mock("@/lib/inngest/client", () => ({ inngest: { send: async () => {}, createFunction: (c, t, h) => ({ c, t, h }) } }));

/** getCurrentUser is memoized per request with React cache; outside React it runs every time. */
const whoAmI = async () => (await getCurrentUser())?.id || null;
const bossPassword = "Baobab-2468";
const tempPassword = "Kola-24680";

/**
 * Accounts made by the Boss at setup: they sign in with the temporary password, must replace it
 * first, and every way of ending sessions works at once (not 15 minutes later).
 */
describe.skipIf(!hasDb)("sign-in security", () => {
  const tag = uid();
  let boss;
  let head;
  let deptId;

  beforeAll(async () => {
    cookieJar.clear();
    ok(await registerBoss({ name: "Owner", email: `sec-boss-${tag}@test.local`, password: bossPassword }));
    ok(
      await createOrganization({
        name: `Secure ${tag}`,
        departments: [{ name: "Kitchen", domain: "RESTAURANT" }, { name: "Rooms", domain: "ROOM_RENTAL" }],
        initialEmployees: [{ name: "Ada Head", title: "Head chef", email: `sec-head-${tag}@test.local`, tempPassword, departmentName: "Kitchen" }],
      })
    );
    boss = await db.user.findUnique({ where: { email: `sec-boss-${tag}@test.local` } });
    head = await db.user.findUnique({ where: { email: `sec-head-${tag}@test.local` }, include: { memberships: true } });
    deptId = head.memberships[0].departmentId;
  });

  afterAll(() => headerJar.set("x-forwarded-for", "127.0.0.1"));

  it("a head created at setup has the title the Boss chose and signs in with the temporary password", async () => {
    expect(head).toMatchObject({ role: "HEAD", title: "Head chef", isActive: true, mustChangePassword: true });
    expect(bcrypt.getRounds(head.passwordHash)).toBe(BCRYPT_COST);
    cookieJar.clear();
    const res = ok(await loginUser({ email: head.email, password: tempPassword, redirect: "/d/x/sell" }));
    expect(res.mustChangePassword).toBe(true);
    expect(res.redirectTo).toBe(`/change-password?redirect=${encodeURIComponent("/d/x/sell")}`);
    expect(await whoAmI()).toBe(head.id);
  });

  it("must replace the temporary password before doing anything", async () => {
    fails(await addDish({ departmentId: deptId, name: "Soup", unitPrice: 1000 }), /temporary password/);
    fails(await updatePassword({ currentPassword: tempPassword, newPassword: tempPassword }), /different/);
    fails(await updatePassword({ currentPassword: tempPassword, newPassword: "Password123" }), /too easy/);
    fails(await updatePassword({ currentPassword: tempPassword, newPassword: `sec-head-${tag}9` }), /e-mail/);
    fails(await updatePassword({ currentPassword: "Wrong-1234", newPassword: "Okra-pepper-77" }), /Incorrect current password/);
    const before = cookieJar.get("sf_access_token").value;
    ok(await updatePassword({ currentPassword: tempPassword, newPassword: "Okra-pepper-77" }));
    const u = await db.user.findUnique({ where: { id: head.id } });
    expect(u.mustChangePassword).toBe(false);
    expect(u.passwordChangedAt).toBeTruthy();
    // This device keeps working with new tokens; the token from before the change no longer does.
    expect(await whoAmI()).toBe(head.id);
    ok(await addDish({ departmentId: deptId, name: "Soup", unitPrice: 1000, openingPlates: 3 }));
    cookieJar.clear();
    cookieJar.set("sf_access_token", before);
    expect(await whoAmI()).toBe(null);
    fails(await loginUser({ email: head.email, password: tempPassword }), /Invalid email or password/);
    expect(ok(await loginUser({ email: head.email, password: "Okra-pepper-77", redirect: "/home" })).redirectTo).toBe("/home");
  });

  it("keeps only a hash of refresh tokens, and a token of one kind is not accepted as the other", async () => {
    cookieJar.clear();
    ok(await loginUser({ email: boss.email, password: bossPassword }));
    const refresh = cookieJar.get("sf_refresh_token").value;
    const access = cookieJar.get("sf_access_token").value;
    expect(await db.refreshToken.findUnique({ where: { token: refresh } })).toBe(null);
    expect(await db.refreshToken.findUnique({ where: { token: hashToken(refresh) } })).toMatchObject({ userId: boss.id });
    // The refresh token alone still opens the session (access token expired).
    cookieJar.clear();
    cookieJar.set("sf_refresh_token", refresh);
    expect(await whoAmI()).toBe(boss.id);
    // Swapped tokens are refused.
    cookieJar.clear();
    cookieJar.set("sf_access_token", refresh);
    expect(await whoAmI()).toBe(null);
    cookieJar.clear();
    cookieJar.set("sf_refresh_token", access);
    expect(await whoAmI()).toBe(null);
  });

  it("an unknown e-mail gets the same answer and costs the same work as a wrong password", async () => {
    headerJar.set("x-forwarded-for", "10.9.9.9");
    const t0 = Date.now();
    const a = fails(await loginUser({ email: `nobody-${tag}@test.local`, password: "Some-pass-123" }));
    const unknownMs = Date.now() - t0;
    const t1 = Date.now();
    const b = fails(await loginUser({ email: boss.email, password: "Some-pass-123" }));
    const wrongMs = Date.now() - t1;
    expect(a.error).toBe(b.error);
    // Both run a bcrypt check (cost 12 ≈ hundreds of ms); without it the unknown e-mail answered in ~1 ms.
    expect(unknownMs).toBeGreaterThan(wrongMs / 4);
    await db.user.update({ where: { id: boss.id }, data: { failedLoginCount: 0 } });
  });

  it("locks the account after 10 wrong passwords, even from many addresses, then unlocks by itself", async () => {
    for (let i = 0; i < 10; i++) {
      headerJar.set("x-forwarded-for", `10.1.${i}.${tag.length}`);
      await loginUser({ email: head.email, password: `Wrong-pass-${i}` });
    }
    headerJar.set("x-forwarded-for", "10.2.0.1");
    fails(await loginUser({ email: head.email, password: "Okra-pepper-77" }), /Too many attempts/);
    const locked = await db.user.findUnique({ where: { id: head.id } });
    expect(locked.lockedUntil > new Date()).toBe(true);
    expect(await db.auditEvent.count({ where: { entityId: head.id, action: "ACCOUNT_LOCKED" } })).toBe(1);
    // The lock ends on its own.
    await db.user.update({ where: { id: head.id }, data: { lockedUntil: new Date(Date.now() - 1000) } });
    ok(await loginUser({ email: head.email, password: "Okra-pepper-77" }));
    expect(await db.user.findUnique({ where: { id: head.id } })).toMatchObject({ failedLoginCount: 0, lockedUntil: null });
  });

  it("the Boss's reset signs the person out at once, unlocks the account and asks for a new password", async () => {
    cookieJar.clear();
    ok(await loginUser({ email: head.email, password: "Okra-pepper-77" }));
    const token = cookieJar.get("sf_access_token").value;
    await db.user.update({ where: { id: head.id }, data: { failedLoginCount: 7 } });
    await loginAs(boss.id);
    fails(await resetEmployeePassword({ employeeId: boss.id, tempPassword: "Mango-97531" }), /your own password/);
    fails(await resetEmployeePassword({ employeeId: head.id, tempPassword: "Password1" }), /too easy/);
    ok(await resetEmployeePassword({ employeeId: head.id, tempPassword: "Mango-97531" }));
    expect(await db.user.findUnique({ where: { id: head.id } })).toMatchObject({ mustChangePassword: true, failedLoginCount: 0 });
    expect(await db.refreshToken.count({ where: { userId: head.id } })).toBe(0);
    cookieJar.clear();
    cookieJar.set("sf_access_token", token);
    expect(await whoAmI()).toBe(null);
    expect(ok(await loginUser({ email: head.email, password: "Mango-97531" })).redirectTo).toMatch(/^\/change-password/);
    ok(await updatePassword({ currentPassword: "Mango-97531", newPassword: "Okra-pepper-88" }));
  });

  it("deactivating signs the person out at once", async () => {
    cookieJar.clear();
    ok(await loginUser({ email: head.email, password: "Okra-pepper-88" }));
    const token = cookieJar.get("sf_access_token").value;
    await loginAs(boss.id);
    ok(await updateEmployee({ employeeId: head.id, isActive: false }));
    ok(await updateEmployee({ employeeId: head.id, isActive: true }));
    cookieJar.clear();
    cookieJar.set("sf_access_token", token);
    expect(await whoAmI()).toBe(null);
  });

  it("signs out every other device", async () => {
    cookieJar.clear();
    ok(await loginUser({ email: head.email, password: "Okra-pepper-88" }));
    const other = { access: cookieJar.get("sf_access_token").value, refresh: cookieJar.get("sf_refresh_token").value };
    cookieJar.clear();
    ok(await loginUser({ email: head.email, password: "Okra-pepper-88" }));
    ok(await signOutEverywhere());
    expect(await whoAmI()).toBe(head.id);
    expect(await db.refreshToken.count({ where: { userId: head.id } })).toBe(1);
    cookieJar.clear();
    cookieJar.set("sf_access_token", other.access);
    cookieJar.set("sf_refresh_token", other.refresh);
    expect(await whoAmI()).toBe(null);
  });

  it("upgrades an older, cheaper password hash at the next sign-in", async () => {
    await db.user.update({ where: { id: head.id }, data: { passwordHash: await bcrypt.hash("Okra-pepper-88", 10) } });
    cookieJar.clear();
    ok(await loginUser({ email: head.email, password: "Okra-pepper-88" }));
    expect(bcrypt.getRounds((await db.user.findUnique({ where: { id: head.id } })).passwordHash)).toBe(BCRYPT_COST);
  });

  it("the Boss's new heads also replace their temporary password; setup never drops a person silently", async () => {
    await loginAs(boss.id);
    const email = `sec-new-${tag}@test.local`;
    const created = ok(await createEmployee({ name: "Ben New", email, title: "Receptionist", tempPassword: "Mango-97531", memberships: [{ departmentId: deptId, isPrimary: true }] }));
    expect(await db.user.findUnique({ where: { id: created.id } })).toMatchObject({ mustChangePassword: true, title: "Receptionist" });

    cookieJar.clear();
    ok(await registerBoss({ name: "Other owner", email: `sec-boss2-${tag}@test.local`, password: bossPassword }));
    const base = { name: `Other ${tag}`, departments: [{ name: "Bar", domain: "RESTAURANT" }] };
    fails(await createOrganization({ ...base, initialEmployees: [{ name: "No mail", tempPassword, departmentName: "Bar" }] }), /required/);
    fails(await createOrganization({ ...base, initialEmployees: [{ name: "Lost", email: `sec-lost-${tag}@test.local`, tempPassword, departmentName: "Nowhere" }] }), /at least one department/);
    fails(await createOrganization({ ...base, initialEmployees: [{ name: "Weak", email: `sec-weak-${tag}@test.local`, tempPassword: "Password1", departmentName: "Bar" }] }), /too easy/);
    // Empty rows are ignored and no head at all is fine: the Boss runs the business himself.
    ok(await createOrganization({ ...base, initialEmployees: [{ name: "", email: "", tempPassword: "" }] }));
  });
});
