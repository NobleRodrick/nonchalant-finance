/**
 * Who may open a company's books:
 * - the Boss: every company of his business;
 * - an accountant he added (role ACCOUNTANT): the whole books of his companies;
 * - a department head he authorized (Accounting settings → "Heads who keep the books"), once the
 *   company keeps Full accounting: either the whole company's books, or only those of the
 *   departments he heads (entries, ledger, trial balance, income statement, customers & suppliers,
 *   VAT of his expenses, supplier bills).
 * Only the Boss approves manual entries above the company's threshold, closes and reopens periods,
 * allocates the result and changes settings (segregation of duties).
 */
import { db } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/errors";

const MEMBER = (userId) => ({ userId, isActive: true });

/** Companies the user may open (Boss: all; accountant: his memberships; head: authorized + Full). */
export async function companiesFor(user, client = db) {
  if (!user?.organizationId) return [];
  const order = [{ isDefault: "desc" }, { name: "asc" }];
  if (user.role === "ADMIN") return client.company.findMany({ where: { organizationId: user.organizationId }, orderBy: order });
  if (user.role === "ACCOUNTANT") return client.company.findMany({ where: { organizationId: user.organizationId, members: { some: MEMBER(user.id) } }, orderBy: order });
  if (user.role === "HEAD") return client.company.findMany({ where: { organizationId: user.organizationId, accountingLevel: "FULL", members: { some: MEMBER(user.id) } }, orderBy: order });
  return [];
}

/** Departments of the company the head runs (active memberships). */
async function headDepartmentsIn(client, user, companyId) {
  const rows = await client.userDepartment.findMany({ where: { userId: user.id, isActive: true, department: { companyId, organizationId: user.organizationId } }, select: { departmentId: true } });
  return rows.map((r) => r.departmentId);
}

/**
 * The user's access to a company's books, or throws. `full`: the company must keep Full accounting
 * (settings pages work in Simple too, for the Boss and accountants).
 * Returns { company, isBoss, isAccountant, isHead, scoped, departmentIds, canPost, canApprove,
 * canSettle, companyWide }: `departmentIds` is null for the whole company, else the departments the
 * books are limited to.
 */
export async function accountingAccess(user, companyId, { full = true, client = db } = {}) {
  const company = await client.company.findFirst({ where: { id: companyId || "-", organizationId: user?.organizationId || "-" } });
  if (!company) throw notFound("Company not found.");
  const isBoss = user.role === "ADMIN";
  let member = null;
  if (!isBoss && ["ACCOUNTANT", "HEAD"].includes(user.role)) {
    member = await client.companyMember.findFirst({ where: { companyId: company.id, ...MEMBER(user.id) }, select: { scope: true } });
  }
  if (!isBoss && !member) throw forbidden("You do not keep the books of this company.");
  const isHead = user.role === "HEAD";
  // A head keeps the books only while the company keeps Full accounting.
  if ((full || isHead) && company.accountingLevel !== "FULL") throw forbidden(`${company.name} is in Simple accounting. The Boss can switch it to Full accounting in its settings.`);
  let departmentIds = null;
  if (isHead && member.scope === "DEPARTMENTS") {
    departmentIds = await headDepartmentsIn(client, user, company.id);
    if (!departmentIds.length) throw forbidden("You no longer head a department of this company.");
  }
  const scoped = departmentIds !== null;
  return { company, isBoss, isAccountant: !isBoss, isHead, scoped, departmentIds, canPost: true, canApprove: isBoss, canSettle: isBoss, companyWide: !scoped };
}

/** Throws unless the access covers the whole company (VAT return, reconciliation, chart, closing). */
export function requireCompanyWide(access, what = "This") {
  if (!access.companyWide) throw forbidden(`${what} concerns the whole company: the Boss or a bookkeeper of the whole company does it.`);
}

/** Throws unless the department is within the access (a head limited to his departments). */
export function requireDepartmentIn(access, departmentId) {
  if (access.scoped && !access.departmentIds.includes(departmentId)) throw forbidden("This belongs to a department whose books you do not keep.");
}

/**
 * Prisma filter of the journal entries the access may see: all (whole company), or the entries of
 * its departments (generated entries carry their department; a manual entry is visible when every
 * one of its lines belongs to them).
 */
export function entryScope(access) {
  if (!access.scoped) return {};
  const ids = access.departmentIds;
  // "none outside" rather than "every inside": in SQL a line without a department is neither in nor
  // out of a list, so it must be excluded explicitly.
  return { OR: [{ departmentId: { in: ids } }, { departmentId: null, lines: { some: {}, none: { OR: [{ departmentId: null }, { departmentId: { notIn: ids } }] } } }] };
}

/** Department filter of a report: the one chosen (when allowed), else the access's own. */
export function reportDepartments(access, chosen = null) {
  if (chosen) {
    if (access.scoped && !access.departmentIds.includes(chosen)) return access.departmentIds;
    return [chosen];
  }
  return access.departmentIds;
}
