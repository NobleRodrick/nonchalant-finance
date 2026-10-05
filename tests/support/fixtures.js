import { toDateKey, addDaysToKey } from "@/lib/timezone";
import { cookieJar } from "./request-context";
import { signAccessToken } from "@/lib/auth";
import { db } from "@/lib/prisma";
import { registerBoss } from "@/actions/auth";
import { createOrganization } from "@/actions/organization";

export const hasDb = Boolean(process.env.TEST_DATABASE_URL);

let seq = 0;
export const uid = (p = "t") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}`;
export const key = () => `k${uid()}xxxxxxxx`;

/** Signs in as a user id (optionally selecting the active department). */
export async function loginAs(userId, activeDepartmentId) {
  cookieJar.clear();
  const u = await db.user.findUnique({ where: { id: userId }, select: { sessionVersion: true } });
  cookieJar.set("sf_access_token", await signAccessToken({ userId, sv: u?.sessionVersion || 0 }));
  if (activeDepartmentId) cookieJar.set("sf_active_dept", activeDepartmentId);
}

export function ok(res) {
  if (!res?.success) throw new Error(`Expected success, got: ${res?.code} ${res?.error}`);
  return res.data;
}

/**
 * Heads created with a temporary password must replace it at their first sign-in (tested in
 * tests/integration/auth-security.test.js). The shared fixtures start after that step.
 */
export async function headsChoseTheirPasswords(organizationId) {
  await db.user.updateMany({ where: { organizationId, role: "HEAD" }, data: { mustChangePassword: false } });
}

/**
 * Creates a Boss, an organization with two restaurant departments and one pressing
 * department, and department heads (titles are free text): "Manager", "Cashier" and
 * "Accountant" head Restaurant A; "Two-dept head" heads Restaurant B and Laundry.
 */
export async function setupOrganization(label = "Org") {
  const tag = uid();
  cookieJar.clear();
  ok(await registerBoss({ name: `Boss ${tag}`, email: `boss-${tag}@test.local`, password: "Baobab-2468" }));
  ok(
    await createOrganization({
      name: `${label} ${tag}`,
      departments: [
        { name: "Restaurant A", domain: "RESTAURANT" },
        { name: "Restaurant B", domain: "RESTAURANT" },
        { name: "Laundry", domain: "PRESSING" },
      ],
      initialEmployees: [
        { name: "Manager", title: "Manager", email: `mgr-${tag}@test.local`, tempPassword: "Kola-24680", departmentName: "Restaurant A" },
        { name: "Cashier", title: "Cashier", email: `cash-${tag}@test.local`, tempPassword: "Kola-24680", departmentName: "Restaurant A" },
        { name: "Accountant", title: "Accountant", email: `acc-${tag}@test.local`, tempPassword: "Kola-24680", departmentName: "Restaurant A" },
        { name: "Two-dept head", title: "Supervisor", email: `multi-${tag}@test.local`, tempPassword: "Kola-24680", departmentNames: ["Restaurant B", "Laundry"] },
      ],
    })
  );
  const boss = await db.user.findUnique({ where: { email: `boss-${tag}@test.local` } });
  await headsChoseTheirPasswords(boss.organizationId);
  const org = await db.organization.findUnique({ where: { id: boss.organizationId }, include: { departments: true, users: true } });
  const dept = (n) => org.departments.find((d) => d.name === n);
  const user = (p) => org.users.find((u) => u.email.startsWith(`${p}-${tag}`));
  return {
    org,
    boss,
    deptA: dept("Restaurant A"),
    deptB: dept("Restaurant B"),
    laundry: dept("Laundry"),
    manager: user("mgr"),
    cashier: user("cash"),
    accountant: user("acc"),
    multi: user("multi"),
    password: "Kola-24680",
  };
}

/** Today and yesterday as business date keys (Africa/Douala). */
export const today = () => toDateKey(new Date());
export const yesterday = () => addDaysToKey(toDateKey(new Date()), -1);

/** Fails the test with the action's error message when the call did not fail. */
export function fails(res, pattern) {
  if (res?.success) throw new Error(`Expected a failure matching ${pattern}, got success`);
  if (pattern && !pattern.test(res.error)) throw new Error(`Expected error matching ${pattern}, got: ${res.error}`);
  return res;
}

/**
 * Creates a Boss and an organization with an event venue ("Salle Majestueuse") and a restaurant;
 * "Venue head" heads the venue, "Rest head" the restaurant.
 */
export async function setupVenueOrganization(label = "Venue") {
  const tag = uid();
  cookieJar.clear();
  ok(await registerBoss({ name: `Boss ${tag}`, email: `vboss-${tag}@test.local`, password: "Baobab-2468" }));
  ok(
    await createOrganization({
      name: `${label} ${tag}`,
      departments: [
        { name: "Salle Majestueuse", domain: "EVENT_VENUE" },
        { name: "Restaurant", domain: "RESTAURANT" },
      ],
      initialEmployees: [
        { name: "Venue head", title: "Events manager", email: `vhead-${tag}@test.local`, tempPassword: "Kola-24680", departmentName: "Salle Majestueuse" },
        { name: "Rest head", title: "Manager", email: `rhead-${tag}@test.local`, tempPassword: "Kola-24680", departmentName: "Restaurant" },
      ],
    })
  );
  const boss = await db.user.findUnique({ where: { email: `vboss-${tag}@test.local` } });
  await headsChoseTheirPasswords(boss.organizationId);
  const org = await db.organization.findUnique({ where: { id: boss.organizationId }, include: { departments: true, users: true } });
  const dept = (n) => org.departments.find((d) => d.name === n);
  const user = (p) => org.users.find((u) => u.email.startsWith(`${p}-${tag}`));
  return { org, boss, venue: dept("Salle Majestueuse"), restaurant: dept("Restaurant"), head: user("vhead"), restHead: user("rhead") };
}

/** A business with Executive Stay (rooms department) and its head; the Boss and a second head. */
export async function setupStayOrganization(label = "Stay") {
  const tag = uid();
  cookieJar.clear();
  ok(await registerBoss({ name: `Boss ${tag}`, email: `sboss-${tag}@test.local`, password: "Baobab-2468" }));
  ok(
    await createOrganization({
      name: `${label} ${tag}`,
      departments: [{ name: "Executive Stay", domain: "ROOM_RENTAL" }],
      initialEmployees: [
        { name: "Stay head", title: "Manager", email: `shead-${tag}@test.local`, tempPassword: "Kola-24680", departmentName: "Executive Stay" },
        { name: "Second head", title: "Accountant", email: `shead2-${tag}@test.local`, tempPassword: "Kola-24680", departmentName: "Executive Stay" },
      ],
    })
  );
  const boss = await db.user.findUnique({ where: { email: `sboss-${tag}@test.local` } });
  await headsChoseTheirPasswords(boss.organizationId);
  const org = await db.organization.findUnique({ where: { id: boss.organizationId }, include: { departments: true, users: true } });
  const user = (p) => org.users.find((u) => u.email.startsWith(`${p}-${tag}`));
  return { org, boss, stay: org.departments.find((d) => d.name === "Executive Stay"), head: user("shead"), head2: user("shead2") };
}
