import { pageDate } from "@/lib/page-guards";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { listRepairs, repairTotals } from "@/lib/rooms/repair-queries";
import { assetRegister } from "@/lib/rooms/asset-queries";
import { roomsOf } from "@/lib/rooms/room-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { MaintenanceBoard } from "@/components/rooms/maintenance/maintenance-board";

/** Guest house: repairs pending (most urgent first) and done in the period (?period=, ?room=). */
export async function StayMaintenancePage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const roomId = sp.room || undefined;
  const [open, done, cancelled, rooms, assets] = await Promise.all([
    listRepairs({ departmentId: department.id, view: "open", roomId }),
    listRepairs({ departmentId: department.id, view: "done", fromKey: range.fromKey, toKey: range.toKey, roomId }),
    listRepairs({ departmentId: department.id, view: "cancelled", fromKey: range.fromKey, toKey: range.toKey, roomId }),
    roomsOf(department.id, { includeInactive: true }),
    assetRegister({ departmentId: department.id }),
  ]);
  return (
    <div>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Maintenance" description="What needs fixing in each apartment, most urgent first, and the repairs done with their cost and invoice.">
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <MaintenanceBoard
        departmentId={department.id}
        open={serialize(open)}
        done={serialize(done)}
        cancelled={serialize(cancelled)}
        totals={repairTotals(open, done)}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive, state: r.state }))}
        assets={assets.map((a) => ({ id: a.id, name: a.name, roomId: a.roomId }))}
        filterRoom={sp.room || ""}
        periodLabel={periodLabel(range)}
        todayKey={todayKey}
        canWork={perms.roomsBook}
      />
    </div>
  );
}
