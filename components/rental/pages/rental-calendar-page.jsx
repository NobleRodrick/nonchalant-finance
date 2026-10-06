import Link from "next/link";
import { pageDate } from "@/lib/page-guards";
import { availabilityBoard, rentalCalendar } from "@/lib/rental/order-queries";
import { serialize } from "@/lib/serialize";
import { formatDateKey, isDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { PageHeader, Section } from "@/components/kit/primitives";
import { RentalCalendar } from "@/components/rental/calendar/rental-calendar";

/** Event rental: the month calendar (?month=YYYY-MM) or the availability of items (?view=items&from=). */
export async function RentalCalendarPage({ page, searchParams }) {
  const { user, department, domain, perms } = page;
  const sp = searchParams || {};
  const { todayKey } = pageDate(user, null);
  const view = sp.view === "items" ? "items" : "month";
  const base = `/d/${department.id}/calendar`;
  const tabs = (
    <nav className="flex gap-1 print:hidden" aria-label="Calendar view">
      {[["month", "Month", base], ["items", "Items available", `${base}?view=items`]].map(([k, label, href]) => (
        <Link key={k} href={href} aria-current={view === k ? "page" : undefined} className={cn("rounded-full px-3 py-1 text-sm font-medium", view === k ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{label}</Link>
      ))}
    </nav>
  );
  if (view === "items") {
    const fromKey = isDateKey(sp.from) ? sp.from : todayKey;
    const board = await availabilityBoard({ departmentId: department.id, fromKey, days: 14, todayKey });
    return (
      <div className="space-y-5">
        <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Calendar" description="What each item has free, day by day, after the confirmed bookings (items are held from dispatch to return)." actions={tabs} />
        <Section bodyClassName="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="availability-board">
              <thead>
                <tr className="border-b text-xs text-slate-500">
                  <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left">Item</th>
                  {board.days.map((k) => <th key={k} className={cn("px-2 py-2 text-center font-medium", k === todayKey && "text-slate-900")}>{formatDateKey(k, { weekday: true }).replace(/ \d{4}$/, "")}</th>)}
                </tr>
              </thead>
              <tbody>
                {board.items.map((i) => (
                  <tr key={i.id} className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 bg-white px-3 py-1.5"><div className="font-medium">{i.name}</div><div className="text-xs text-slate-500">{i.usable} usable</div></td>
                    {i.byDay.map((d, n) => (
                      <td key={n} className={cn("px-2 py-1.5 text-center tabular-nums", d.available <= 0 ? "bg-rose-50 font-semibold text-rose-700" : d.reserved ? "bg-amber-50 text-amber-900" : "text-slate-500")} title={`${d.reserved} reserved, ${d.available} free`}>
                        {d.available}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Section>
      </div>
    );
  }
  const monthKey = /^\d{4}-(0[1-9]|1[0-2])$/.test(sp.month || "") ? sp.month : todayKey.slice(0, 7);
  const cal = await rentalCalendar({ departmentId: department.id, monthKey, todayKey });
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Calendar" description="Events by stage, items leaving and coming back, payment deadlines. Click a day to see everything scheduled." actions={tabs} />
      <RentalCalendar departmentId={department.id} monthKey={monthKey} todayKey={todayKey} grid={cal.grid} days={serialize(cal.days)} orders={serialize(cal.orders)} canBook={perms.rentalBook} />
    </div>
  );
}
