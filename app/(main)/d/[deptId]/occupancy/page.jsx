import { departmentPage, pageDate } from "@/lib/page-guards";
import { isDateKey, addDaysToKey } from "@/lib/timezone";
import { roomsOf, staysBetween } from "@/lib/rooms/room-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { OccupancyBoard } from "@/components/rooms/occupancy-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Calendar" };

/** Rooms department: apartments × nights for two weeks (?from=), who is in which apartment. */
export default async function OccupancyPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "occupancy" });
  const { todayKey } = pageDate(user, null);
  const fromKey = isDateKey(sp.from) ? sp.from : todayKey;
  const [rooms, stays] = await Promise.all([roomsOf(department.id), staysBetween({ departmentId: department.id, fromKey: addDaysToKey(fromKey < todayKey ? fromKey : todayKey, -1), toKey: addDaysToKey(fromKey, 13) })]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Calendar" description="Which apartment is taken each night and by whom. A free night opens a new booking." />
      <OccupancyBoard departmentId={department.id} rooms={serialize(rooms)} stays={serialize(stays)} fromKey={fromKey} todayKey={todayKey} canBook={perms.roomsBook} />
    </div>
  );
}
