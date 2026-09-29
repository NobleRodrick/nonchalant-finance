import { notFound, redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth";
import { resolveDepartment, orgTimezone, effectiveRole } from "@/lib/access";
import { roleHasPermission, PERMISSIONS } from "@/lib/permissions";
import { getDomain, hasModule } from "@/lib/domains/registry";
import { isDateKey, toDateKey } from "@/lib/timezone";

/** Signed-in user with an organization, or a redirect (login / onboarding). */
export async function requirePageUser({ admin = false } = {}) {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!user.organizationId) redirect(user.role === "ADMIN" ? "/onboarding" : "/profile?notice=no-organization");
  if (admin && user.role !== "ADMIN") redirect("/home");
  return user;
}

/** What the user may do in a department (drives which buttons a page shows). */
export function departmentPermissions(user, departmentId) {
  const role = effectiveRole(user, departmentId);
  const has = (p) => roleHasPermission(role, p);
  return {
    role,
    manageStock: has(PERMISSIONS.INVENTORY_MANAGE),
    sell: has(PERMISSIONS.SALES_CREATE),
    discount: has(PERMISSIONS.SALES_DISCOUNT),
    discountLimited: has(PERMISSIONS.SALES_DISCOUNT_LIMITED),
    moneyIn: has(PERMISSIONS.MONEY_IN_CREATE),
    purchases: has(PERMISSIONS.PURCHASES_CREATE),
    expenses: has(PERMISSIONS.EXPENSES_CREATE),
    discounts: has(PERMISSIONS.DISCOUNTS_CREATE),
    debts: has(PERMISSIONS.DEBTS_MANAGE),
    repay: has(PERMISSIONS.DEBTS_REPAY),
    handover: has(PERMISSIONS.HANDOVER_CREATE),
    void: has(PERMISSIONS.RECORDS_VOID),
    reportRead: has(PERMISSIONS.REPORTS_READ),
    reportSubmit: has(PERMISSIONS.REPORTS_SUBMIT),
    boss: role === "ADMIN",
  };
}

/**
 * Department page guard: the department must be in the user's organization and the user a
 * member (the Boss sees every department). `module` must exist for the department type and
 * be allowed for the user's role, otherwise the page 404s. Returns everything a page needs.
 */
export async function departmentPage(deptId, { module = "home" } = {}) {
  // Server time before any data is read: records this device sent after it are not in the page
  // yet, and are shown on top of its figures (lib/offline/overlay).
  const renderedAt = Date.now();
  const user = await requirePageUser();
  let resolved;
  try {
    resolved = await resolveDepartment(user, deptId, { read: true });
  } catch {
    notFound();
  }
  const { department, role } = resolved;
  const domain = getDomain(department.domain);
  if (module !== "home" && !hasModule(department, module, role)) notFound();
  return { user, department, role, domain, renderedAt, timeZone: orgTimezone(user), perms: departmentPermissions(user, department.id) };
}

/** Business date from ?date= (no future dates). */
export function pageDate(user, value) {
  const tz = orgTimezone(user);
  const today = toDateKey(new Date(), tz);
  const dateKey = isDateKey(value) && value <= today ? value : today;
  return { dateKey, todayKey: today, isToday: dateKey === today, timeZone: tz };
}

/** Page segment → module key of the department navigation (lib/domains/registry). */
const MODULE_OF_SEGMENT = { sell: "sell", "menu-stock": "menu-stock", money: "money", debts: "debts", "cash-handover": "cash", report: "report", history: "history" };

/**
 * Early access check of the app layout, from the requested path (set by the proxy). Refusals
 * happen before the loading screen is streamed, so the response keeps its real status (404 or a
 * redirect). The pages check again (and are the only check on in-app navigations).
 */
export async function guardPath(user, path) {
  if (!path) return;
  if (path.startsWith("/boss") && user.role !== "ADMIN") redirect("/home");
  const m = path.match(/^\/d\/([^/]+)(?:\/([^/]+))?/);
  if (!m || !user.organizationId) return;
  let resolved;
  try {
    resolved = await resolveDepartment(user, m[1], { read: true });
  } catch {
    notFound();
  }
  const moduleKey = MODULE_OF_SEGMENT[m[2]];
  if (!moduleKey) return;
  if (moduleKey === "cash" && user.role === "ADMIN") redirect(`/boss/cash?dept=${resolved.department.id}`);
  if (!hasModule(resolved.department, moduleKey, resolved.role)) notFound();
}
