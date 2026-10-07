/**
 * Who may open a company's books: the Boss (every company of his business) and the accountants he
 * added to it. The Boss approves manual entries above the company's threshold, closes and reopens
 * periods and changes settings; accountants record entries, reconcile, prepare closings and VAT.
 */
import { db } from "@/lib/prisma";
import { forbidden, notFound } from "@/lib/errors";

/** Companies the user may open (Boss: all; accountant: his memberships). */
export async function companiesFor(user, client = db) {
  if (!user?.organizationId) return [];
  if (user.role === "ADMIN") return client.company.findMany({ where: { organizationId: user.organizationId }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  if (user.role === "ACCOUNTANT") {
    return client.company.findMany({ where: { organizationId: user.organizationId, members: { some: { userId: user.id, isActive: true } } }, orderBy: [{ isDefault: "desc" }, { name: "asc" }] });
  }
  return [];
}

/**
 * The user's access to a company's books, or throws. `full`: the company must keep Full accounting
 * (settings pages work in Simple too).
 */
export async function accountingAccess(user, companyId, { full = true, client = db } = {}) {
  const company = await client.company.findFirst({ where: { id: companyId || "-", organizationId: user?.organizationId || "-" } });
  if (!company) throw notFound("Company not found.");
  const isBoss = user.role === "ADMIN";
  const isAccountant = user.role === "ACCOUNTANT" && Boolean(await client.companyMember.findFirst({ where: { companyId: company.id, userId: user.id, isActive: true }, select: { id: true } }));
  if (!isBoss && !isAccountant) throw forbidden("You do not keep the books of this company.");
  if (full && company.accountingLevel !== "FULL") throw forbidden(`${company.name} is in Simple accounting. The Boss can switch it to Full accounting in its settings.`);
  return { company, isBoss, isAccountant, canPost: true, canApprove: isBoss, canSettle: isBoss };
}
