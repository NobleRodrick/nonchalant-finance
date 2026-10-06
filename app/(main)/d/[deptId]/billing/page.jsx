import { departmentPage, pageDate } from "@/lib/page-guards";
import { billingSheet } from "@/lib/property/billing-queries";
import { monthLabel, monthOf } from "@/lib/property/rent-schedule";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { BillingSheet } from "@/components/property/billing-sheet";
import { ContractCharges } from "@/components/property/contracts/contract-tables";

export const dynamic = "force-dynamic";
export const metadata = { title: "Billing & meters" };

/** Property rental: the month's utilities and charges (?month=YYYY-MM): meter readings, fixed charges, shares of buildings' bills. */
export default async function BillingPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "billing" });
  const { todayKey } = pageDate(user, null);
  const monthKey = /^\d{4}-\d{2}$/.test(sp.month || "") ? sp.month : monthOf(todayKey);
  const sheet = await billingSheet({ departmentId: department.id, monthKey });
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Billing & meters" description={`Utilities and charges of ${monthLabel(monthKey)}, billed apart from rent: enter the meter readings, then bill the month. Rent is billed by itself every month from each contract.`} />
      <FilterBar fields={[{ name: "month", label: "Month", type: "month" }]} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard tone="dark" label={`Billed for ${monthLabel(monthKey)}`} value={formatMoney(sheet.total)} hint={`${sheet.charges.filter((c) => !c.voidedAt).length} charge(s)`} />
        <StatCard label="Still to bill" value={sheet.rows.filter((r) => !r.billed).length} hint="Meter, fixed and shared charges" />
        <StatCard label="Contracts with charges" value={new Set(sheet.rows.map((r) => r.leaseId)).size} />
      </div>
      <BillingSheet departmentId={department.id} sheet={serialize(sheet)} canBill={perms.propertyLease} />
      <Section title={`Charges of ${monthLabel(monthKey)}`}>
        <ContractCharges departmentId={department.id} charges={serialize(sheet.charges.map((c) => ({ ...c, label: `${c.label} · ${c.lease.client.name} (${c.unit.name})` })))} canVoid={perms.void} />
      </Section>
    </div>
  );
}
