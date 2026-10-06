import Link from "next/link";
import { pageDate } from "@/lib/page-guards";
import { maintenanceList } from "@/lib/property/work-queries";
import { buildingsOf, unitBoard } from "@/lib/property/unit-queries";
import { MAINTENANCE_STATUS_LABELS, MAINTENANCE_STATUS_TONES, PRIORITY_LABELS, unitTitle } from "@/lib/property/unit-math";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { DataTable, Money, PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { MaintenanceActions, ReportMaintenanceButton } from "@/components/property/work/maintenance";

/**
 * Property rental: maintenance requests of the offices (?status=open|a status|all, ?building=):
 * reported → approved → in progress → completed (paid as an expense of the office, billed to the
 * tenant if they caused it), or cancelled.
 */
export async function PropertyMaintenancePage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const [rows, units, buildings, all] = await Promise.all([
    maintenanceList({ departmentId: department.id, status: sp.status || "open", buildingId: sp.building || "", timeZone }),
    unitBoard({ departmentId: department.id, todayKey }),
    buildingsOf(department.id),
    maintenanceList({ departmentId: department.id, status: "all", timeZone }),
  ]);
  const open = all.filter((r) => !["COMPLETED", "CANCELLED"].includes(r.status));
  const base = `/d/${department.id}`;
  const month = todayKey.slice(0, 7);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Maintenance" description="Problems reported on the offices, who handles them, the appointments and what they cost." actions={perms.propertyLease ? <ReportMaintenanceButton departmentId={department.id} units={serialize(units)} variant="default" /> : null} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone={open.length ? "warn" : "default"} label="Open requests" value={open.length} hint={`${open.filter((r) => r.priority === "URGENT").length} urgent`} />
        <StatCard label="Waiting for approval" value={open.filter((r) => r.status === "REPORTED").length} />
        <StatCard label="In progress" value={open.filter((r) => r.status === "IN_PROGRESS").length} />
        <StatCard label="Spent this month" value={formatMoney(all.filter((r) => r.status === "COMPLETED" && r.completedKey?.startsWith(month)).reduce((s, r) => s + r.cost, 0))} />
      </div>
      <FilterBar fields={[{ name: "status", label: "Show", type: "select", options: [{ value: "", label: "Open" }, ...Object.entries(MAINTENANCE_STATUS_LABELS).map(([k, v]) => ({ value: k, label: v })), { value: "all", label: "All" }] }, { name: "building", label: "Building", type: "select", options: [{ value: "", label: "Both buildings" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))] }]} />
      <Section bodyClassName="p-0">
        <DataTable
          rows={rows}
          empty="No request matches."
          columns={[
            { key: "ref", label: "No.", render: (r) => r.referenceNo },
            { key: "office", label: "Office", render: (r) => <Link className="hover:underline" href={`${base}/offices/${r.unitId}`}>{unitTitle(r.unit)}</Link> },
            { key: "problem", label: "Problem", render: (r) => <span><span className="font-medium">{r.title}</span>{r.priority === "URGENT" ? <Pill tone="rose" className="ml-1">{PRIORITY_LABELS.URGENT}</Pill> : null}<span className="block text-xs text-slate-500">{[r.lease?.client.name, r.reportedBy && `reported by ${r.reportedBy}`, r.reportedKey].filter(Boolean).join(" · ")}</span></span> },
            { key: "who", label: "Assigned / appointment", render: (r) => <span className="text-xs">{[r.assignedTo, r.technician, r.scheduledKey].filter(Boolean).join(" · ") || "—"}</span> },
            { key: "status", label: "Status", render: (r) => <Pill tone={MAINTENANCE_STATUS_TONES[r.status]}>{MAINTENANCE_STATUS_LABELS[r.status]}</Pill> },
            { key: "cost", label: "Cost", align: "right", render: (r) => <span><Money value={r.cost} suffix={false} />{r.expense ? <span className="block text-[11px] text-slate-500">{r.expense}</span> : null}</span> },
            { key: "act", label: "", render: (r) => <MaintenanceActions departmentId={department.id} request={serialize(r)} canAct={perms.propertyLease} /> },
          ]}
        />
      </Section>
    </div>
  );
}
