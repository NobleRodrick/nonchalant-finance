import Link from "next/link";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { venueFormData } from "@/lib/venue/page-data";
import { bookingsBetween, expiredHolds } from "@/lib/venue/booking-queries";
import { serialize } from "@/lib/serialize";
import { Banner, PageHeader } from "@/components/kit/primitives";
import { Button } from "@/components/ui/button";
import { MonthCalendar } from "@/components/venue/calendar/month-calendar";
import { monthGrid } from "@/lib/venue/calendar";

export const dynamic = "force-dynamic";

/** Event venue: the month calendar of the hall (?month=YYYY-MM). */
export default async function CalendarPage({ params, searchParams }) {
  const { deptId } = await params;
  const { month } = await searchParams;
  const { user, department, domain, perms, renderedAt } = await departmentPage(deptId, { module: "calendar" });
  const { todayKey } = pageDate(user, null);
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(month || "") ? month : todayKey.slice(0, 7);
  const grid = monthGrid(monthKey);
  const [{ hall, packages, heads }, bookings, holds] = await Promise.all([
    venueFormData(department.id),
    bookingsBetween({ departmentId: department.id, fromKey: grid.start, toKey: grid.end, todayKey }),
    expiredHolds({ departmentId: department.id, todayKey }),
  ]);
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Calendar" description={hall ? `${hall.name}: one event per date. Click a free date to book it.` : undefined} />
      {!hall ? (
        <Banner tone="warn" action={perms.venueManage ? <Link href={`${base}/hall`}><Button size="sm">Set up the hall</Button></Link> : null}>Set up the hall and its prices before booking dates.</Banner>
      ) : (
        <>
          {holds.length ? (
            <Banner tone="warn" action={<Link href={`${base}/bookings?status=RESERVED`}><Button size="sm" variant="outline">See them</Button></Link>}>
              {holds.length} reservation(s) passed their hold date without a deposit: {holds.slice(0, 3).map((b) => `${b.referenceNo} (${b.client.name})`).join(", ")}. Confirm, hold longer or cancel them; they still hold their date.
            </Banner>
          ) : null}
          <MonthCalendar
            departmentId={department.id}
            renderedAt={renderedAt}
            monthKey={monthKey}
            todayKey={todayKey}
            bookings={serialize(bookings)}
            hall={serialize(hall)}
            packages={serialize(packages)}
            heads={heads}
            canBook={perms.venueBook}
            currentUserId={user.id}
          />
        </>
      )}
    </div>
  );
}
