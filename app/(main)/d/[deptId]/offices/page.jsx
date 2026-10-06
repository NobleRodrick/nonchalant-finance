import { departmentPage, pageDate } from "@/lib/page-guards";
import { boardSummary, buildingsOf, unitBoard } from "@/lib/property/unit-queries";
import { UNIT_STATUS } from "@/lib/property/unit-math";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { OfficeBoard } from "@/components/property/offices/office-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Offices" };

/**
 * Property rental: every office of every building (?building=, ?status=, ?q=), coloured by
 * status, with its tenant and what is owed; the counts of each building and of the whole business.
 */
export default async function OfficesPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "offices" });
  const { todayKey } = pageDate(user, null);
  const [buildings, rows] = await Promise.all([buildingsOf(department.id), unitBoard({ departmentId: department.id, todayKey, buildingId: sp.building || "", status: sp.status || "", q: sp.q || "", archived: sp.archived === "1" })]);
  const all = await unitBoard({ departmentId: department.id, todayKey });
  const sum = boardSummary(all, buildings);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Offices" description="Every office of every building, coloured by status: available, occupied, reserved, under maintenance, unavailable, awaiting handover." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="office-counts">
        <StatCard tone="dark" label="Offices" value={sum.all.total} hint={`${sum.all.occupancyRate}% occupied`} />
        <StatCard label="Occupied" value={sum.all.OCCUPIED} />
        <StatCard tone={sum.all.vacant ? "warn" : "default"} label="Vacant" value={sum.all.vacant} hint={`${sum.all.AVAILABLE} available · ${sum.all.AWAITING_HANDOVER} awaiting handover`} />
        <StatCard label="Reserved" value={sum.all.RESERVED} />
        <StatCard label="Maintenance / unavailable" value={sum.all.MAINTENANCE + sum.all.UNAVAILABLE} />
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        {sum.byBuilding.map((b) => (
          <StatCard key={b.id} label={b.name} value={`${b.counts.OCCUPIED} / ${b.counts.total} occupied`} hint={`Rent ${formatMoney(b.expected)} a month · owed ${formatMoney(b.owed)}`} href={`?building=${b.id}`} />
        ))}
      </div>
      <FilterBar
        fields={[
          { name: "building", label: "Building", type: "select", options: [{ value: "", label: "Both buildings" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))] },
          { name: "status", label: "Status", type: "select", options: [{ value: "", label: "Every status" }, ...Object.entries(UNIT_STATUS).map(([k, v]) => ({ value: k, label: v.label }))] },
          { name: "q", label: "Search", type: "search", placeholder: "Office, floor, category, tenant…" },
          { name: "archived", label: "Show", type: "select", options: [{ value: "", label: "Offices in use" }, { value: "1", label: "Archived offices" }] },
        ]}
      />
      <OfficeBoard departmentId={department.id} rows={serialize(rows)} buildings={serialize(buildings)} canManage={perms.propertyManage} canExport={perms.export} todayKey={todayKey} />
    </div>
  );
}
