import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-guards";
import { accountingAccess, companiesFor, entryScope } from "@/lib/accounting/access";
import { PageHeader, Pill } from "@/components/kit/primitives";
import { CompanyNav } from "@/components/accounting/company-nav";
import { CompanySwitcher } from "@/components/accounting/company-switcher";

/** A company's books: its name, its level, the sections (and a switcher when there are several). */
export default async function CompanyBooksLayout({ children, params }) {
  const { companyId } = await params;
  const user = await requirePageUser();
  if (!["ADMIN", "ACCOUNTANT", "HEAD"].includes(user.role)) redirect("/home");
  let access;
  try {
    access = await accountingAccess(user, companyId, { full: false });
  } catch {
    if (user.role === "HEAD") redirect("/home");
    notFound();
  }
  const c = access.company;
  const [companies, pending, scopeNames] = await Promise.all([
    companiesFor(user),
    c.accountingLevel === "FULL" ? db.journalEntry.count({ where: { companyId: c.id, status: "PENDING", ...entryScope(access) } }) : 0,
    access.scoped ? db.department.findMany({ where: { id: { in: access.departmentIds } }, select: { name: true }, orderBy: { createdAt: "asc" } }) : [],
  ]);
  const full = c.accountingLevel === "FULL";
  return (
    <div>
      <PageHeader
        eyebrow="Accounting"
        title={c.legalName || c.name}
        description={full ? `${access.scoped ? `Books of ${scopeNames.map((d) => d.name).join(", ")} · ` : ""}SYSCOHADA books${c.taxId ? ` · NIU ${c.taxId}` : ""}${c.tradeRegister ? ` · RCCM ${c.tradeRegister}` : ""}` : "Simple accounting: money in and out, cash, debts and profit. Switch to Full accounting in the settings below."}
        actions={
          <div className="flex items-center gap-2">
            <Pill tone={full ? "emerald" : "slate"}>{full ? "Full accounting (SYSCOHADA)" : "Simple"}</Pill>
            {c.vatEnabled ? <Pill tone="indigo">VAT</Pill> : null}
            {companies.length > 1 ? <CompanySwitcher companies={companies.map((x) => ({ id: x.id, name: x.name, level: x.accountingLevel }))} currentId={c.id} /> : null}
          </div>
        }
      />
      <CompanyNav companyId={c.id} full={full} features={{ vat: c.vatEnabled, payables: c.payablesEnabled, reconciliation: c.reconciliationEnabled }} pending={pending} access={{ companyWide: access.companyWide, settings: !access.isHead }} />
      {children}
    </div>
  );
}
