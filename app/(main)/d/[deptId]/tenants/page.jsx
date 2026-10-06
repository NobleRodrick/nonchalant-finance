import Link from "next/link";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { tenantList } from "@/lib/property/lease-queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { DataTable, Money, PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { TenantButton, TenantExport } from "@/components/property/tenants/tenant-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tenants" };

/** Property rental: every tenant with their offices, rent, what they owe and the deposit held. */
export default async function TenantsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "tenants" });
  const { todayKey } = pageDate(user, null);
  const rows = await tenantList({ departmentId: department.id, todayKey, q: sp.q || "" });
  const shown = sp.owing === "1" ? rows.filter((r) => r.owed > 0) : sp.owing === "0" ? rows.filter((r) => !r.owed) : rows;
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Tenants" description="Each tenant's offices, monthly rent, what they owe and the deposit held. Open one for the complete financial history." actions={perms.propertyLease ? <TenantButton departmentId={department.id} /> : null} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Tenants" value={rows.filter((r) => r.live.length).length} hint={`${rows.length} with a contract, ever`} />
        <StatCard tone={rows.some((r) => r.owed) ? "out" : "default"} label="Tenants owing" value={rows.filter((r) => r.owed).length} hint={formatMoney(rows.reduce((s, r) => s + r.owed, 0))} />
        <StatCard tone={rows.some((r) => r.overdue) ? "out" : "default"} label="Overdue" value={rows.filter((r) => r.overdue).length} hint={formatMoney(rows.reduce((s, r) => s + r.overdue, 0))} />
        <StatCard label="Fully paid" value={rows.filter((r) => r.live.length && !r.owed).length} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FilterBar fields={[{ name: "q", label: "Search", type: "search", placeholder: "Name, phone, office, contract…" }, { name: "owing", label: "Show", type: "select", options: [{ value: "", label: "Everyone" }, { value: "1", label: "Owing" }, { value: "0", label: "Fully paid" }] }]} />
        {perms.export ? <TenantExport rows={serialize(shown)} todayKey={todayKey} /> : null}
      </div>
      <Section bodyClassName="p-0">
        <DataTable
          rows={shown}
          empty="No tenant yet: they are added with their contract."
          columns={[
            { key: "name", label: "Tenant", render: (r) => <Link className="font-medium hover:underline" href={`${base}/tenants/${r.id}`}>{r.name}</Link> },
            { key: "phone", label: "Phone", render: (r) => r.phone || "—" },
            { key: "offices", label: "Offices", render: (r) => r.live.map((l) => `${l.unit.name} · ${l.unit.building.name}`).join(", ") || <span className="text-slate-400">none now</span> },
            { key: "rent", label: "Rent / month", align: "right", render: (r) => <Money value={r.rent} suffix={false} /> },
            { key: "owed", label: "Owed", align: "right", render: (r) => (r.owed ? <Money value={r.owed} className="font-semibold text-rose-700" suffix={false} /> : <Pill tone="emerald">Paid</Pill>) },
            { key: "months", label: "Months owed", align: "right", render: (r) => r.monthsOwed || "—" },
            { key: "deposit", label: "Deposit held", align: "right", render: (r) => <Money value={r.depositHeld} suffix={false} /> },
          ]}
        />
      </Section>
    </div>
  );
}
