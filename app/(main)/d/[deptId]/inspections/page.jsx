import Link from "next/link";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { inspectionList } from "@/lib/property/work-queries";
import { unitBoard } from "@/lib/property/unit-queries";
import { CONDITION_LABELS, INSPECTION_KIND_LABELS, unitTitle } from "@/lib/property/unit-math";
import { serialize } from "@/lib/serialize";
import { DataTable, Money, PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { InspectionButton } from "@/components/property/work/inspection";
import { CompleteInspectionButton } from "@/components/property/work/complete-inspection-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Inspections" };

/** Property rental: inspections of the offices (move-in, move-out, damage, maintenance, routine), planned and done, with photos and damages. */
export default async function InspectionsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "inspections" });
  const { todayKey, timeZone } = pageDate(user, null);
  const [rows, units] = await Promise.all([inspectionList({ departmentId: department.id, state: sp.state || "all", kind: sp.kind || "", timeZone }), unitBoard({ departmentId: department.id, todayKey })]);
  const planned = rows.filter((r) => !r.doneAt);
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Inspections" description="The state of each office when a tenant moves in or out, after damage or maintenance: areas, condition, photos, damages (billed or taken from the deposit)." actions={perms.propertyLease ? <InspectionButton departmentId={department.id} units={serialize(units)} currentUserName={user.name} label="New inspection" variant="default" /> : null} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <StatCard tone={planned.some((r) => r.scheduledKey && r.scheduledKey <= todayKey) ? "warn" : "default"} label="Planned" value={planned.length} hint={`${planned.filter((r) => r.scheduledKey && r.scheduledKey <= todayKey).length} due today or late`} />
        <StatCard label="Done" value={rows.length - planned.length} />
        <StatCard label="Damages found" value={<Money value={rows.reduce((s, r) => s + r.damageCost, 0)} />} />
      </div>
      <FilterBar fields={[{ name: "state", label: "Show", type: "select", options: [{ value: "", label: "All" }, { value: "planned", label: "Planned" }, { value: "done", label: "Done" }] }, { name: "kind", label: "Kind", type: "select", options: [{ value: "", label: "Every kind" }, ...Object.entries(INSPECTION_KIND_LABELS).map(([k, v]) => ({ value: k, label: v }))] }]} />
      <Section bodyClassName="p-0">
        <DataTable
          rows={rows}
          empty="No inspection yet."
          columns={[
            { key: "ref", label: "No.", render: (r) => r.referenceNo },
            { key: "office", label: "Office", render: (r) => <Link className="hover:underline" href={`${base}/offices/${r.unitId}`}>{unitTitle(r.unit)}</Link> },
            { key: "kind", label: "Kind", render: (r) => INSPECTION_KIND_LABELS[r.kind] },
            { key: "tenant", label: "Tenant", render: (r) => r.lease?.client.name || "—" },
            { key: "date", label: "Date", render: (r) => (r.doneKey ? r.doneKey : <Pill tone={r.scheduledKey <= todayKey ? "amber" : "slate"}>planned {r.scheduledKey}</Pill>) },
            { key: "findings", label: "Findings", render: (r) => <span className="text-xs">{(r.rows || []).filter((x) => x.condition && x.condition !== "GOOD").map((x) => `${x.area}: ${CONDITION_LABELS[x.condition]}${x.note ? ` (${x.note})` : ""}`).join(" · ") || (r.doneAt ? "All good" : "")}{r.files.length ? <span className="block">{r.files.map((f) => <a key={f.id} className="mr-2 underline" href={f.url} target="_blank" rel="noreferrer">{f.fileName}</a>)}</span> : null}</span> },
            { key: "condition", label: "Condition", render: (r) => CONDITION_LABELS[r.condition] || "—" },
            { key: "damage", label: "Damages", align: "right", render: (r) => <Money value={r.damageCost} suffix={false} /> },
            { key: "act", label: "", render: (r) => (!r.doneAt && perms.propertyLease ? <CompleteInspectionButton departmentId={department.id} inspection={serialize(r)} currentUserName={user.name} /> : null) },
          ]}
        />
      </Section>
    </div>
  );
}
