import Link from "next/link";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { venueFormData } from "@/lib/venue/page-data";
import { listBookings } from "@/lib/venue/booking-queries";
import { serialize } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { PageHeader, Section, inputClass } from "@/components/kit/primitives";
import { Button } from "@/components/ui/button";
import { BookingsTable } from "@/components/venue/bookings/bookings-table";

export const dynamic = "force-dynamic";

const TABS = [
  { key: "UPCOMING", label: "Upcoming" },
  { key: "RESERVED", label: "Reserved" },
  { key: "CONFIRMED", label: "Confirmed" },
  { key: "COMPLETED", label: "Completed" },
  { key: "CANCELLED", label: "Cancelled" },
  { key: "ALL", label: "All" },
];

/** Event venue: every booking, by status, searchable, paged (?status=&q=&page=). */
export default async function BookingsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, domain, perms, renderedAt } = await departmentPage(deptId, { module: "bookings" });
  const { todayKey } = pageDate(user, null);
  const tab = TABS.some((t) => t.key === sp.status) ? sp.status : "UPCOMING";
  const q = String(sp.q || "").slice(0, 80);
  const filter =
    tab === "UPCOMING"
      ? { status: "ACTIVE", fromKey: todayKey, upcoming: true }
      : tab === "ALL"
        ? {}
        : { status: tab, upcoming: tab === "RESERVED" || tab === "CONFIRMED" };
  const [form, list] = await Promise.all([venueFormData(department.id), listBookings({ departmentId: department.id, ...filter, q, page: sp.page, todayKey })]);
  const base = `/d/${department.id}/bookings`;
  const href = (over) => {
    const p = new URLSearchParams({ status: tab, ...(q ? { q } : {}), ...over });
    return `${base}?${p.toString()}`;
  };
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Bookings" description="Every booking of the hall: its client, event, price, payments and balance." />
      <Section
        title={`${list.total} booking(s)`}
        actions={
          <form action={base} className="flex gap-2" role="search">
            <input type="hidden" name="status" value={tab} />
            <input name="q" defaultValue={q} aria-label="Search bookings" placeholder="Client, phone, reference, event" className={cn(inputClass, "h-9 w-64")} />
            <Button type="submit" size="sm" variant="outline">Search</Button>
          </form>
        }
      >
        <nav className="mb-4 flex flex-wrap gap-1" aria-label="Booking status">
          {TABS.map((t) => (
            <Link key={t.key} href={href({ status: t.key, page: "1" })} aria-current={t.key === tab ? "page" : undefined} className={cn("rounded-full px-3 py-1 text-sm font-medium", t.key === tab ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>
              {t.label}
            </Link>
          ))}
        </nav>
        <BookingsTable
          departmentId={department.id}
          renderedAt={renderedAt}
          rows={serialize(list.rows)}
          status={tab === "UPCOMING" ? "ACTIVE" : tab}
          form={serialize(form)}
          canBook={perms.venueBook}
          todayKey={todayKey}
          currentUserId={user.id}
        />
        {list.pages > 1 ? (
          <div className="mt-4 flex items-center justify-between text-sm">
            <span className="text-slate-500">Page {list.page} of {list.pages}</span>
            <span className="flex gap-2">
              {list.page > 1 ? <Link href={href({ page: String(list.page - 1) })}><Button size="sm" variant="outline">Previous</Button></Link> : null}
              {list.page < list.pages ? <Link href={href({ page: String(list.page + 1) })}><Button size="sm" variant="outline">Next</Button></Link> : null}
            </span>
          </div>
        ) : null}
      </Section>
    </div>
  );
}
