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
  cookieJar.set("sf_access_token", await signAccessToken({ userId }));
  if (activeDepartmentId) cookieJar.set("sf_active_dept", activeDepartmentId);
}

export function ok(res) {
  if (!res?.success) throw new Error(`Expected success, got: ${res?.code} ${res?.error}`);
  return res.data;
}

/**
 * Creates a Boss, an organization with two restaurant departments and one pressing
 * department, and department heads (titles are free text): "Manager", "Cashier" and
 * "Accountant" head Restaurant A; "Two-dept head" heads Restaurant B and Laundry.
 */
export async function setupOrganization(label = "Org") {
  const tag = uid();
  cookieJar.clear();
  ok(await registerBoss({ name: `Boss ${tag}`, email: `boss-${tag}@test.local`, password: "Secret123" }));
  ok(
    await createOrganization({
      name: `${label} ${tag}`,
      departments: [
        { name: "Restaurant A", domain: "RESTAURANT" },
        { name: "Restaurant B", domain: "RESTAURANT" },
        { name: "Laundry", domain: "PRESSING" },
      ],
      initialEmployees: [
        { name: "Manager", title: "Manager", email: `mgr-${tag}@test.local`, tempPassword: "Temp12345", departmentName: "Restaurant A" },
        { name: "Cashier", title: "Cashier", email: `cash-${tag}@test.local`, tempPassword: "Temp12345", departmentName: "Restaurant A" },
        { name: "Accountant", title: "Accountant", email: `acc-${tag}@test.local`, tempPassword: "Temp12345", departmentName: "Restaurant A" },
        { name: "Two-dept head", title: "Supervisor", email: `multi-${tag}@test.local`, tempPassword: "Temp12345", departmentNames: ["Restaurant B", "Laundry"] },
      ],
    })
  );
  const boss = await db.user.findUnique({ where: { email: `boss-${tag}@test.local` } });
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
    password: "Temp12345",
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
