import Link from "next/link";
import { FilePlus2 } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { leaseList } from "@/lib/property/lease-queries";
import { buildingsOf } from "@/lib/property/unit-queries";
import { LEASE_STATUS_LABELS } from "@/lib/property/unit-math";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DataTable, Money, PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { AccountBadge, DepositBadge, LeaseStatusBadge } from "@/components/property/status";
import { ContractExport } from "@/components/property/contracts/contract-export";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contracts" };

/** Property rental: every contract (?status=live|ACTIVE|RESERVED|ENDED|CANCELLED|all, ?building=, ?q=), with what each owes. */
export default async function ContractsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "contracts" });
  const { todayKey } = pageDate(user, null);
  const [rows, buildings] = await Promise.all([leaseList({ departmentId: department.id, todayKey, status: sp.status || "live", buildingId: sp.building || "", q: sp.q || "" }), buildingsOf(department.id)]);
  const active = rows.filter((r) => r.status === "ACTIVE");
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title="Contracts"
        description="Every rental agreement: tenant, office, dates, rent, deposit, what is owed. Contracts ending within 60 days are marked."
        actions={perms.propertyLease ? <Link href={`${base}/contracts/new`}><Button><FilePlus2 className="h-4 w-4" /> New contract</Button></Link> : null}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Rent a month (active)" value={formatMoney(active.reduce((s, r) => s + r.rentNow, 0))} hint={`${active.length} active contract(s)`} />
        <StatCard tone={rows.some((r) => r.account?.outstanding) ? "out" : "default"} label="Owed on these contracts" value={formatMoney(rows.reduce((s, r) => s + (r.account?.outstanding || 0), 0))} />
        <StatCard label="Deposits held" value={formatMoney(rows.reduce((s, r) => s + (r.deposit?.held || 0), 0))} />
        <StatCard tone={rows.some((r) => r.expiring) ? "warn" : "default"} label="Ending within 60 days" value={rows.filter((r) => r.expiring).length} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FilterBar
          fields={[
            { name: "status", label: "Show", type: "select", options: [{ value: "", label: "Live (active and reserved)" }, ...Object.entries(LEASE_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })), { value: "all", label: "All" }] },
            { name: "building", label: "Building", type: "select", options: [{ value: "", label: "Both buildings" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))] },
            { name: "q", label: "Search", type: "search", placeholder: "Contract no., tenant, phone, office…" },
          ]}
        />
        {perms.export ? <ContractExport rows={serialize(rows)} todayKey={todayKey} /> : null}
      </div>
      <Section bodyClassName="p-0">
        <DataTable
          stickyHeader
          rows={rows}
          empty="No contract matches."
          columns={[
            { key: "ref", label: "Contract", render: (r) => <Link className="font-medium hover:underline" href={`${base}/contracts/${r.id}`}>{r.referenceNo}</Link> },
            { key: "tenant", label: "Tenant", render: (r) => <Link className="hover:underline" href={`${base}/tenants/${r.client.id}`}>{r.client.name}</Link> },
            { key: "office", label: "Office", render: (r) => `${r.unit.name} · ${r.unit.building.name}` },
            { key: "dates", label: "Dates", render: (r) => <span className="whitespace-nowrap">{r.startKey} → {r.moveOutKey || r.endKey || "open"} {r.expiring ? <Pill tone="amber">ends soon</Pill> : null}</span> },
            { key: "rent", label: "Rent", align: "right", render: (r) => <Money value={r.rentNow} suffix={false} /> },
            { key: "status", label: "Status", render: (r) => <span className="flex flex-wrap gap-1"><LeaseStatusBadge status={r.status} /><AccountBadge status={r.account?.status} /></span> },
            { key: "owed", label: "Owed", align: "right", render: (r) => (r.account?.outstanding ? <Money value={r.account.outstanding} className="font-semibold text-rose-700" suffix={false} /> : "—") },
            { key: "deposit", label: "Deposit", render: (r) => <span className="flex items-center gap-1"><Money value={r.deposit?.held || 0} suffix={false} /><DepositBadge status={r.depositStatus} /></span> },
          ]}
        />
      </Section>
    </div>
  );
}
