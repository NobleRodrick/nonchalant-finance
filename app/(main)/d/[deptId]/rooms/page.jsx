import { departmentPage, pageDate } from "@/lib/page-guards";
import { apartmentsNow } from "@/lib/rooms/room-queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { RoomsBoard } from "@/components/rooms/rooms-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Apartments" };

/** Rooms department: the apartments, their state, guest and rates. */
export default async function RoomsPage({ params }) {
  const { deptId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "rooms" });
  const { todayKey } = pageDate(user, null);
  const rooms = await apartmentsNow({ departmentId: department.id, todayKey });
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Apartments" description="Each apartment, whether it is available, reserved, occupied, under maintenance or unavailable, who is in it, and its rates. Open one for its full history and figures." />
      <RoomsBoard departmentId={department.id} rooms={serialize(rooms)} canManage={perms.roomsManage} />
    </div>
  );
}
