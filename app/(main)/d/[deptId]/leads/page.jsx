import Link from "next/link";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { venueFormData } from "@/lib/venue/page-data";
import { listLeads } from "@/lib/venue/lead-queries";
import { heldDates } from "@/lib/venue/booking-queries";
import { addDaysToKey } from "@/lib/timezone";
import { monthBounds } from "@/lib/venue/dates";
import { serialize } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { PageHeader } from "@/components/kit/primitives";
import { LeadsBoard } from "@/components/venue/leads/leads-board";

export const dynamic = "force-dynamic";

const PERIODS = [
  { key: "month", label: "This month" },
  { key: "quarter", label: "Last 3 months" },
  { key: "year", label: "Last 12 months" },
  { key: "all", label: "All" },
];

/** Event venue: enquiries not booked yet, their follow-up and conversion (?period=). */
export default async function LeadsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, domain, perms, renderedAt } = await departmentPage(deptId, { module: "leads" });
  const { todayKey } = pageDate(user, null);
  const period = PERIODS.some((p) => p.key === sp.period) ? sp.period : "quarter";
  const fromKey = period === "month" ? monthBounds(todayKey)[0] : period === "quarter" ? addDaysToKey(todayKey, -90) : period === "year" ? addDaysToKey(todayKey, -365) : null;
  const [form, leads, taken] = await Promise.all([venueFormData(department.id), listLeads({ departmentId: department.id, fromKey }), heldDates({ departmentId: department.id, fromKey: todayKey })]);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Leads" description="People who enquired and have not booked yet: follow them up, book them, or record why they were lost.">
        <nav className="mt-3 flex flex-wrap gap-1" aria-label="Period">
          {PERIODS.map((p) => (
            <Link key={p.key} href={`/d/${department.id}/leads?period=${p.key}`} aria-current={p.key === period ? "page" : undefined} className={cn("rounded-full px-3 py-1 text-sm font-medium", p.key === period ? "bg-slate-900 text-white" : "bg-slate-100 text-slate-700 hover:bg-slate-200")}>{p.label}</Link>
          ))}
        </nav>
      </PageHeader>
      <LeadsBoard departmentId={department.id} renderedAt={renderedAt} leads={serialize(leads)} form={serialize(form)} todayKey={todayKey} canBook={perms.venueBook} currentUserId={user.id} takenDates={taken} />
    </div>
  );
}
