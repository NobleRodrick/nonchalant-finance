import { db } from "@/lib/prisma";
import { getCurrentUser } from "@/lib/auth";
import { roleHasPermission, PERMISSIONS } from "@/lib/permissions";
import { forbidden, invalid, notFound, unauthorized } from "@/lib/errors";
import { isRestaurant } from "@/lib/domains/registry";
import { DEFAULT_TIMEZONE } from "@/lib/timezone";

/** Authenticated user or throws UNAUTHORIZED. */
export async function requireUser() {
  const user = await getCurrentUser();
  if (!user) throw unauthorized();
  return user;
}

/** Authenticated user that belongs to an organization. */
export async function requireOrgUser() {
  const user = await requireUser();
  if (!user.organizationId) throw forbidden("Set up your organization first.");
  return user;
}

export async function requireAdmin() {
  const user = await requireOrgUser();
  if (user.role !== "ADMIN") throw forbidden("Only the Boss (admin) can do this.");
  return user;
}

export function orgTimezone(user) {
  return user?.organization?.timezone || DEFAULT_TIMEZONE;
}

/**
 * Role of the user inside a department: the Boss everywhere in his business; everyone else is
 * the head of each department they are assigned to.
 */
export function effectiveRole(user, departmentId) {
  if (user.role === "ADMIN") return "ADMIN";
  return user.memberships?.some((m) => m.departmentId === departmentId) ? "HEAD" : null;
}

export function can(user, permission, departmentId) {
  return roleHasPermission(effectiveRole(user, departmentId), permission);
}

/** Department ids the user may access (admin: all active departments of the organization). */
export async function accessibleDepartmentIds(user, { includeInactive = false } = {}) {
  if (!user?.organizationId) return [];
  if (user.role === "ADMIN") {
    const depts = await db.department.findMany({
      where: { organizationId: user.organizationId, ...(includeInactive ? {} : { isActive: true }) },
      select: { id: true },
    });
    return depts.map((d) => d.id);
  }
  return (user.memberships || [])
    .filter((m) => m.department?.organizationId === user.organizationId)
    .map((m) => m.departmentId);
}

/** Departments whose reports and statements the user may read: the Boss all, a head their own. */
export async function readableDepartmentIds(user) {
  if (!user?.organizationId) return [];
  if (user.role === "ADMIN") {
    const depts = await db.department.findMany({ where: { organizationId: user.organizationId }, select: { id: true } });
    return depts.map((d) => d.id);
  }
  return accessibleDepartmentIds(user);
}

export async function accessibleDepartments(user) {
  const ids = await accessibleDepartmentIds(user);
  if (!ids.length) return [];
  return db.department.findMany({
    where: { id: { in: ids } },
    orderBy: [{ createdAt: "asc" }],
  });
}

/**
 * Resolves and authorizes a department for an operation.
 * - `requestedId` (optional) is validated against organization + membership;
 *   when omitted the user's active department is used.
 * - `permission` (optional) is checked against the effective role in that department.
 * - `write: true` rejects inactive departments.
 * - `restaurant: true` rejects departments whose domain is not RESTAURANT.
 * Returns { department, departmentId, role }.
 */
export async function resolveDepartment(
  user,
  requestedId,
  { permission, write = false, restaurant = false } = {}
) {
  if (!user?.organizationId) throw forbidden("Set up your organization first.");
  const departmentId = requestedId && requestedId !== "all" ? requestedId : user.activeDepartmentId;
  if (!departmentId) throw invalid("Select a department first.");

  const department = await db.department.findFirst({
    where: { id: departmentId, organizationId: user.organizationId },
  });
  if (!department) throw notFound("Department not found in your organization.");

  if (user.role !== "ADMIN") {
    const member = user.memberships?.some((m) => m.departmentId === department.id);
    if (!member) throw forbidden("You are not assigned to this department.");
  }
  if (write && !department.isActive) throw forbidden("This department is deactivated.");
  if (restaurant && !isRestaurant(department.domain)) {
    throw forbidden("This operation is only available for restaurant departments.");
  }

  const role = effectiveRole(user, department.id);
  if (permission && !roleHasPermission(role, permission)) {
    throw forbidden("Your role does not allow this action in this department.");
  }
  return { department, departmentId: department.id, role };
}

/** Throws unless the user holds `permission` in the department. */
export function assertCan(user, permission, departmentId) {
  if (!can(user, permission, departmentId)) {
    throw forbidden("Your role does not allow this action in this department.");
  }
}

/**
 * Validates an account (cash drawer / wallet) for a department: same organization, and
 * either unassigned or assigned to that department.
 */
export async function resolveAccount(user, accountId, departmentId, client = db) {
  if (!accountId) return null;
  const account = await client.account.findFirst({
    where: { id: accountId, organizationId: user.organizationId },
  });
  if (!account) throw notFound("Selected account was not found in your organization.");
  if (account.departmentId && departmentId && account.departmentId !== departmentId) {
    throw forbidden("Selected account belongs to another department.");
  }
  return account;
}

export { PERMISSIONS };
