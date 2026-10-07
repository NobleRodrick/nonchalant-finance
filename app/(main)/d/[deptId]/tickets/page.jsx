import Link from "next/link";
import { Plus } from "lucide-react";
import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { statusLabels, ticketList } from "@/lib/services/queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { TicketTable } from "@/components/services/ticket-table";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tickets" };

const VIEWS = [["open", "In the shop"], ["ready", "Ready"], ["late", "Late"], ["unclaimed", "Unclaimed"], ["owing", "Collected, not paid"], ["collected", "Collected"], ["cancelled", "Cancelled"], ["all", "Everything"]];

/** Pressing, car wash, jobs: the tickets by view (?view=), searched (?q=). */
export default async function TicketsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "tickets" });
  const { todayKey, timeZone } = pageDate(user, null);
  const view = VIEWS.some(([k]) => k === sp.view) ? sp.view : "open";
  const [tickets, open, workers] = await Promise.all([
    ticketList({ department, view, q: sp.q, timeZone, todayKey }),
    view === "open" && !sp.q ? null : ticketList({ department, view: "open", timeZone, todayKey }),
    domain.workers ? db.serviceWorker.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  const inShop = open || tickets;
  const base = `/d/${department.id}/tickets`;
  const w = domain.words;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={w.tickets} description={department.domain === "CAR_WASH" ? "Every vehicle from arrival to departure: waiting, washing, ready, gone. Payments are recorded on each wash." : "Every ticket from drop-off to collection. Payments at drop-off are advances; the ticket becomes income when it is collected."} actions={perms.servicesTicket ? <Link href={`${base}/new`}><Button><Plus className="h-4 w-4" /> New {w.ticket.toLowerCase()}</Button></Link> : null} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={department.domain === "CAR_WASH" ? "Waiting / washing" : "Received / in progress"} value={inShop.filter((t) => t.status !== "READY").length} href={`${base}?view=open`} />
        <StatCard tone="warn" label="Ready to collect" value={inShop.filter((t) => t.status === "READY").length} href={`${base}?view=ready`} />
        <StatCard tone={inShop.some((t) => t.late) ? "out" : "default"} label="Late" value={inShop.filter((t) => t.late).length} href={`${base}?view=late`} />
        <StatCard label="Still to collect (money)" value={formatMoney(inShop.reduce((s, t) => s + Math.max(0, t.balance), 0))} hint={`advances ${formatMoney(inShop.reduce((s, t) => s + Math.max(0, t.paid), 0))}`} />
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <nav className="flex flex-wrap gap-1" aria-label="Views">
          {VIEWS.map(([k, l]) => <Link key={k} href={`${base}?view=${k}`} className={cn("rounded-full border px-3 py-1 text-sm", view === k && !sp.q ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50")}>{l}</Link>)}
        </nav>
        <FilterBar fields={[{ name: "q", label: "Search", type: "search", placeholder: department.domain === "CAR_WASH" ? "Plate, name, phone, TK-…" : "Name, phone, tag, TK-…" }]} />
      </div>
      <Section bodyClassName="p-0">
        <TicketTable departmentId={department.id} tickets={serialize(tickets)} labels={statusLabels(department.domain)} workers={workers} canStep={perms.servicesTicket} empty={sp.q ? "Nothing matches." : "No ticket here."} />
      </Section>
    </div>
  );
}
