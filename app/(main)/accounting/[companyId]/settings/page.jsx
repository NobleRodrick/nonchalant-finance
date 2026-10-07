import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { CATEGORY_ACCOUNTS, ROLE_ACCOUNTS, ROLE_LABELS } from "@/lib/accounting/account-map";
import { MONEY_CATEGORIES, categoryLabel } from "@/data/categories";
import { CompanySettings } from "@/components/accounting/settings-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounting settings" };

/** A company's details, its accounting level, VAT and options, accountants, chart and accounts used. */
export default async function SettingsPage({ params }) {
  const { companyId } = await params;
  const { company, access } = await accountingPage(companyId, { full: false });
  const full = company.accountingLevel === "FULL";
  const [departments, records, accounts, accountants, companies] = await Promise.all([
    db.department.findMany({ where: { companyId }, select: { id: true, name: true, domain: true } }),
    db.transaction.count({ where: { department: { companyId } } }),
    full ? db.ledgerAccount.findMany({ where: { companyId }, orderBy: { number: "asc" }, select: { id: true, number: true, name: true, label: true, isActive: true, isSystem: true, reconcilable: true } }) : [],
    access.isBoss ? db.user.findMany({ where: { organizationId: company.organizationId, role: "ACCOUNTANT" }, select: { id: true, name: true, email: true, isActive: true, companyMemberships: { where: { isActive: true }, select: { companyId: true } } }, orderBy: { name: "asc" } }) : [],
    access.isBoss ? db.company.findMany({ where: { organizationId: company.organizationId }, select: { id: true, name: true } }) : [],
  ]);
  const map = company.accountMap || {};
  const domains = new Set(departments.map((d) => d.domain));
  const categories = Object.entries(MONEY_CATEGORIES).flatMap(([type, list]) => list.filter((c) => !c.domains || c.domains.some((x) => domains.has(x))).map((c) => ({ key: `category:${c.id}`, id: c.id, type, label: categoryLabel(c.id), number: map[`category:${c.id}`] || CATEGORY_ACCOUNTS[c.id] || "", custom: Boolean(map[`category:${c.id}`]) })));
  const roles = Object.entries(ROLE_LABELS).map(([id, label]) => ({ key: `role:${id}`, id, label, number: map[`role:${id}`] || ROLE_ACCOUNTS[id], custom: Boolean(map[`role:${id}`]) }));
  return (
    <CompanySettings
      isBoss={access.isBoss}
      company={{ id: company.id, name: company.name, legalName: company.legalName, taxId: company.taxId, tradeRegister: company.tradeRegister, address: company.address, phone: company.phone, email: company.email, fiscalYearStartMonth: company.fiscalYearStartMonth, level: company.accountingLevel, fullSince: company.fullSince?.toISOString().slice(0, 10) || null, vatEnabled: company.vatEnabled, vatSince: company.vatSince?.toISOString().slice(0, 10) || "", vatRate: company.vatRateBp / 100, vatExempt: company.vatExempt || [], payablesEnabled: company.payablesEnabled, reconciliationEnabled: company.reconciliationEnabled, approvalThreshold: company.approvalThreshold }}
      departments={departments.map((d) => ({ id: d.id, name: d.name }))}
      records={records}
      accounts={accounts}
      categories={categories}
      roles={roles}
      accountants={accountants.map((a) => ({ id: a.id, name: a.name, email: a.email, isActive: a.isActive, companyIds: a.companyMemberships.map((m) => m.companyId) }))}
      companies={companies}
    />
  );
}
