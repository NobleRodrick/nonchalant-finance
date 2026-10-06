import Link from "next/link";
import { departmentPage } from "@/lib/page-guards";
import { incidentList, incidentTotals } from "@/lib/rental/item-queries";
import { INCIDENT_KIND_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/rental/stock-math";
import { orgTimezone } from "@/lib/access";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { formatDateKey, toDateKey } from "@/lib/timezone";
import { DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { IncidentButtons } from "@/components/rental/incidents/incident-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Damages & repairs" };

/** Event rental: damaged, broken and missing items, what was decided, repairs in progress. */
export default async function DamagesPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "damages" });
  const status = sp.status || "open";
  const rows = await incidentList({ departmentId: department.id, status });
  const t = incidentTotals(rows);
  const tz = orgTimezone(user);
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Damages & repairs" description="Items that came back damaged, broken or missing (or were found so in the store): the decision for each, and repairs in progress." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="To settle" value={t.open} tone={t.open ? "warn" : "default"} />
        <StatCard label="In repair" value={t.inRepair} />
        <StatCard label="Replacement value" value={formatMoney(t.estimatedLoss)} hint={`${t.units} unit(s)`} />
        <StatCard label="Charged to customers" value={formatMoney(t.charged)} hint={`repairs ${formatMoney(t.repairCost)}`} />
      </div>
      <FilterBar fields={[{ name: "status", label: "Show", type: "select", options: [{ value: "", label: "To settle or in repair" }, ...Object.entries(INCIDENT_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })), { value: "all", label: "Everything" }] }]} />
      <Section bodyClassName="p-0">
        <DataTable
          rows={rows}
          empty="Nothing here."
          columns={[
            { key: "d", label: "Date", render: (i) => formatDateKey(toDateKey(i.date, tz), { weekday: false }) },
            { key: "ref", label: "No.", render: (i) => <span className="font-mono text-xs">{i.referenceNo}</span> },
            { key: "what", label: "What", render: (i) => <Link className="font-medium underline" href={`${base}/stock/${i.item.id}`}>{i.quantity} × {i.item.name} <span className="font-normal">{INCIDENT_KIND_LABELS[i.kind].toLowerCase()}</span></Link> },
            { key: "event", label: "Event", render: (i) => (i.order ? <Link className="underline" href={`${base}/bookings/${i.order.id}`}>{i.order.referenceNo} · {i.order.client.name}</Link> : <span className="text-slate-500">In the store</span>) },
            { key: "why", label: "What happened", render: (i) => <span className="text-xs text-slate-600">{i.reason || "—"}{i.responsibleName ? ` · ${i.responsibleName}` : ""}</span> },
            { key: "loss", label: "Replacement", align: "right", render: (i) => (i.estimatedLoss ? <Money value={i.estimatedLoss} suffix={false} /> : "—") },
            { key: "repair", label: "Repair", align: "right", render: (i) => (i.repairCost ? <Money value={i.repairCost} suffix={false} /> : "") },
            { key: "status", label: "Decision", render: (i) => <span className={i.status === "OPEN" ? "font-semibold text-amber-700" : ""}>{INCIDENT_STATUS_LABELS[i.status]}{i.stockAction === "REPAIR" ? (i.repairedAt ? " · repaired" : ` · in repair${i.repairBy ? ` (${i.repairBy})` : ""}`) : ""}</span> },
            { key: "act", label: "", align: "right", render: (i) => <IncidentButtons departmentId={department.id} incident={serialize(i)} canBook={perms.rentalBook} /> },
          ]}
        />
      </Section>
    </div>
  );
}
