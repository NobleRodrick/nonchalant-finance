import { redirect } from "next/navigation";
import { db } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-guards";
import { companiesFor } from "@/lib/accounting/access";
import { getDomain } from "@/lib/domains/registry";
import { PageHeader } from "@/components/kit/primitives";
import { CompaniesClient } from "@/components/accounting/companies-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounting" };

/**
 * The companies of the business and their departments: which keep Simple accounting and which
 * keep Full SYSCOHADA books. The Boss adds companies and moves departments between them.
 */
export default async function AccountingHome() {
  const user = await requirePageUser();
  if (!["ADMIN", "ACCOUNTANT", "HEAD"].includes(user.role)) redirect("/home");
  const companies = await companiesFor(user);
  if (user.role === "HEAD" && !companies.length) redirect("/home");
  if (user.role !== "ADMIN" && companies.length === 1) redirect(`/accounting/${companies[0].id}`);
  const ids = companies.map((c) => c.id);
  const [departments, pending] = await Promise.all([
    db.department.findMany({ where: { organizationId: user.organizationId, companyId: { in: ids } }, select: { id: true, name: true, domain: true, isActive: true, companyId: true }, orderBy: { createdAt: "asc" } }),
    db.journalEntry.groupBy({ by: ["companyId"], where: { companyId: { in: ids }, status: "PENDING" }, _count: { _all: true } }),
  ]);
  return (
    <div>
      <PageHeader
        title="Accounting"
        description="Each registered company keeps its own books. Small businesses stay in Simple accounting (money in and out, cash, debts, profit); a company that needs an accountant, VAT and official statements switches to Full accounting (SYSCOHADA). Nothing changes for the department heads."
      />
      <CompaniesClient
        isBoss={user.role === "ADMIN"}
        companies={companies.map((c) => ({
          id: c.id,
          name: c.name,
          legalName: c.legalName,
          taxId: c.taxId,
          level: c.accountingLevel,
          isDefault: c.isDefault,
          vat: c.vatEnabled,
          pending: pending.find((p) => p.companyId === c.id)?._count._all || 0,
          departments: departments.filter((d) => d.companyId === c.id).map((d) => ({ id: d.id, name: d.name, isActive: d.isActive, type: getDomain(d.domain).label })),
        }))}
      />
    </div>
  );
}
