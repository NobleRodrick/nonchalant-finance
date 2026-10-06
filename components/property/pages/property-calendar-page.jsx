import { pageDate } from "@/lib/page-guards";
import { CALENDAR_KINDS, propertyCalendar } from "@/lib/property/calendar";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PropertyCalendar } from "@/components/property/calendar/property-calendar";

/** Property rental: the month calendar (?month=YYYY-MM) of rent due, contracts, moves, maintenance and inspections. */
export async function PropertyCalendarPage({ page, searchParams }) {
  const { user, department, domain } = page;
  const sp = searchParams || {};
  const { todayKey, timeZone } = pageDate(user, null);
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month || "") ? sp.month : todayKey.slice(0, 7);
  const cal = await propertyCalendar({ departmentId: department.id, monthKey, todayKey, timeZone });
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Calendar" description="Rent and charges due, contracts ending, tenants moving in and out, maintenance appointments and inspections. Click a day for everything on it." />
      <PropertyCalendar departmentId={department.id} monthKey={monthKey} todayKey={todayKey} grid={cal.grid} days={serialize(cal.days)} kinds={CALENDAR_KINDS} />
    </div>
  );
}
