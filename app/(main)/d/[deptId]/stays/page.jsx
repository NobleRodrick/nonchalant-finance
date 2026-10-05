import Link from "next/link";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { listStaysView, roomsOf, stayViewCounts } from "@/lib/rooms/room-queries";
import { STAY_VIEWS } from "@/lib/rooms/stay-math";
import { serialize } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/kit/primitives";
import { StaysBoard } from "@/components/rooms/stays-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bookings" };

/** Rooms department: bookings by view (?view=upcoming|current|completed|cancelled, ?q=, ?room=). */
export default async function StaysPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "stays" });
  const { todayKey } = pageDate(user, null);
  const view = STAY_VIEWS[sp.view] ? sp.view : "upcoming";
  const [stays, rooms, counts] = await Promise.all([
    listStaysView({ departmentId: department.id, view, q: sp.q, roomId: sp.room || null, take: 200 }),
    roomsOf(department.id),
    stayViewCounts(department.id),
  ]);
  const base = `/d/${department.id}/stays`;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Bookings" description="Every booking of every apartment: guest, nights, price, what is paid and what is still owed.">
        <nav className="mt-3 flex flex-wrap gap-1" aria-label="Bookings">
          {Object.entries(STAY_VIEWS).map(([k, v]) => (
            <Link key={k} href={`${base}?view=${k}`} aria-current={k === view ? "page" : undefined} className={cn("rounded-full px-3 py-1 text-sm font-medium", k === view ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
              {v.label} <span className="opacity-70">{counts[k]}</span>
            </Link>
          ))}
        </nav>
        <form className="mt-3 flex max-w-sm gap-2" action={base}>
          <input type="hidden" name="view" value={view} />
          <input name="q" defaultValue={sp.q || ""} placeholder="Guest, phone or reference" aria-label="Search bookings" className="h-9 flex-1 rounded-md border border-slate-200 px-3 text-sm" />
        </form>
      </PageHeader>
      <StaysBoard departmentId={department.id} stays={serialize(stays)} rooms={serialize(rooms)} todayKey={todayKey} canBook={perms.roomsBook} />
    </div>
  );
}
