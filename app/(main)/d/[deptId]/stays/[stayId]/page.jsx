import Link from "next/link";
import { notFound } from "next/navigation";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { roomsOf, stayDetail } from "@/lib/rooms/room-queries";
import { formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { Button } from "@/components/ui/button";
import { StayDetail } from "@/components/rooms/stay-detail";

export const dynamic = "force-dynamic";

/** Rooms department: one booking with its money, receipts and history. */
export default async function StayPage({ params }) {
  const { deptId, stayId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "stays" });
  const { todayKey } = pageDate(user, null);
  const [stay, rooms] = await Promise.all([stayDetail({ departmentId: department.id, stayId }), roomsOf(department.id)]);
  if (!stay) notFound();
  return (
    <div className="space-y-2">
      <Link href={`/d/${department.id}/stays`} className="print:hidden"><Button size="sm" variant="ghost">← Bookings</Button></Link>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={`${stay.referenceNo} · ${stay.guestName}`} description={`${stay.room.name} · ${formatDateKey(stay.checkInKey)} → ${formatDateKey(stay.checkOutKey)} · ${stay.nights} night(s)`} />
      <StayDetail departmentId={department.id} stay={serialize(stay)} rooms={serialize(rooms)} todayKey={todayKey} canBook={perms.roomsBook} />
    </div>
  );
}
