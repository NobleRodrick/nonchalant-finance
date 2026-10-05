import { pageDate } from "@/lib/page-guards";
import { rangeBounds } from "@/lib/timezone";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { assetMovements, assetRegister, movementTotals, registerTotals } from "@/lib/rooms/asset-queries";
import { roomsOf } from "@/lib/rooms/room-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { AssetsRegister } from "./assets-register";

/**
 * Guest house assets: the register of each apartment (and storage) with values and damaged
 * units (?room=), and the movements of the period (bought, moved, damaged, repaired, missing,
 * replaced, removed) with their proof.
 */
export async function StayAssetsPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const { start, end } = rangeBounds(range.fromKey, range.toKey, timeZone);
  const roomId = sp?.room === "storage" ? null : sp?.room || undefined;
  const [lines, rooms, movements] = await Promise.all([
    assetRegister({ departmentId: department.id, roomId }),
    roomsOf(department.id, { includeInactive: true }),
    assetMovements({ departmentId: department.id, start, end, roomId }),
  ]);
  return (
    <div>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Assets" description="Each apartment's furniture and equipment at purchase value: what is there, what is damaged, and every change (bought, moved, damaged, repaired, missing, replaced, removed).">
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <AssetsRegister
        departmentId={department.id}
        lines={serialize(lines)}
        totals={registerTotals(lines)}
        movements={serialize(movements)}
        movementTotals={movementTotals(movements)}
        rooms={rooms.map((r) => ({ id: r.id, name: r.name, isActive: r.isActive }))}
        filterRoom={sp?.room || ""}
        periodLabel={periodLabel(range)}
        canManage={perms.roomsManage}
        canMove={perms.roomsBook}
      />
    </div>
  );
}
