import Link from "next/link";
import { Plus, Search, Zap } from "lucide-react";
import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { serviceDashboard, statusLabels } from "@/lib/services/queries";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Money, PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { AttentionList } from "@/components/kit/attention-list";
import { ValueBars } from "@/components/charts/value-bars";
import { serialize } from "@/lib/serialize";
import { TicketTable } from "./ticket-table";
import { QuickSteps } from "./ticket-actions";

/** A car wash's queue: waiting, washing, ready — each card with its next step. */
function Queue({ departmentId, d, workers, canStep, labels }) {
  const cols = [["RECEIVED", d.tickets.filter((t) => t.status === "RECEIVED")], ["IN_PROGRESS", d.tickets.filter((t) => t.status === "IN_PROGRESS")], ["READY", d.tickets.filter((t) => t.status === "READY")]];
  return (
    <div className="grid gap-3 md:grid-cols-3" data-testid="wash-queue">
      {cols.map(([status, rows]) => (
        <Section key={status} title={`${labels[status]} (${rows.length})`} bodyClassName="space-y-2">
          {rows.length ? rows.map((t) => (
            <div key={t.id} className={`rounded-lg border p-2 ${t.late ? "border-rose-300 bg-rose-50/60" : "border-slate-200"}`}>
              <div className="flex items-center justify-between gap-2">
                <Link href={`/d/${departmentId}/tickets/${t.id}`} className="font-mono text-sm font-semibold hover:underline">{t.plate || t.referenceNo}</Link>
                <span className="text-xs text-slate-500">{t.receivedTime}{t.express ? <Zap className="ml-1 inline h-3 w-3 text-amber-500" /> : null}</span>
              </div>
              <div className="text-xs text-slate-600">{t.vehicleType ? `${t.vehicleType} · ` : ""}{t.lines.map((l) => l.label).join(", ")}{t.lines.find((l) => l.worker) ? ` · ${t.lines.find((l) => l.worker).worker}` : ""}</div>
              <div className="mt-1 flex items-center justify-between gap-2">
                <span className="text-xs">{t.balance > 0 ? <span className="font-semibold text-rose-700">to pay {formatMoney(t.balance)}</span> : <span className="text-emerald-700">paid</span>}</span>
                {canStep ? (status === "READY" ? <Link href={`/d/${departmentId}/tickets/${t.id}`}><Button size="sm">Collected…</Button></Link> : <QuickSteps departmentId={departmentId} ticket={serialize(t)} workers={status === "RECEIVED" ? workers : []} />) : null}
              </div>
            </div>
          )) : <p className="text-sm text-slate-400">None.</p>}
        </Section>
      ))}
    </div>
  );
}

/** The job-ticket part of a dashboard (pressing, car wash, other activity's jobs). */
export async function ServiceSections({ page, d, workers, title = null }) {
  const { department, domain, perms } = page;
  const base = `/d/${department.id}`;
  const labels = statusLabels(department.domain);
  const carWash = department.domain === "CAR_WASH";
  const w = domain.words;
  return (
    <>
      {title ? <h2 className="pt-2 text-lg font-semibold text-slate-900">{title}</h2> : null}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="service-today">
        <StatCard tone="dark" label={carWash ? "Washed today" : "Collected today"} value={d.today.collected} hint={`${formatMoney(d.today.revenue)} · ${d.today.received} received`} href={`${base}/tickets?view=collected`} />
        <StatCard tone="in" label="Money in today" value={formatMoney(d.today.cashIn)} hint="payments − refunds on tickets" href={`${base}/money`} />
        <StatCard label={carWash ? "In the queue" : "In the shop"} value={d.counts.RECEIVED + d.counts.IN_PROGRESS + d.counts.READY} hint={`${d.counts.READY} ready · ${d.tickets.filter((t) => t.late).length} late`} tone={d.tickets.some((t) => t.late) ? "warn" : "default"} href={`${base}/tickets`} />
        <StatCard label="To collect on open tickets" value={formatMoney(d.toCollect)} hint={`advances held ${formatMoney(d.advances)}`} />
        <StatCard label={`Revenue this month`} value={formatMoney((d.month.servicesRevenue || 0) + (d.month.cancellationIncome || 0))} hint="tickets collected" href={`${base}/reports`} />
        <StatCard tone={d.month.result < 0 ? "out" : "in"} label="Profit this month" value={formatMoney(d.month.result)} hint={`expenses ${formatMoney(d.month.expenses + d.month.otherExpenses)}`} href={`${base}/reports`} />
        <StatCard tone={d.owing.count ? "out" : "default"} label="Left without paying" value={formatMoney(d.owing.amount)} hint={`${d.owing.count} ${w.ticket.toLowerCase()}(s)`} href={`${base}/tickets?view=owing`} />
        {carWash ? <StatCard tone={d.workers.some((x) => x.owed > 0) ? "warn" : "default"} label="Owed to washers" value={formatMoney(d.workers.reduce((s, x) => s + Math.max(0, x.owed), 0))} href={`${base}/workers`} /> : <StatCard label="Unclaimed" value={d.tickets.filter((t) => t.unclaimed).length} href={`${base}/tickets?view=unclaimed`} />}
      </div>
      {carWash ? <Queue departmentId={department.id} d={d} workers={workers} canStep={perms.servicesTicket} labels={labels} /> : (
        <div className="grid gap-6 xl:grid-cols-2">
          <Section title={`Ready to collect (${d.ready.length})`} bodyClassName="p-0" actions={<Link className="text-sm underline" href={`${base}/tickets?view=ready`}>All</Link>}>
            <TicketTable departmentId={department.id} tickets={serialize(d.ready.slice(0, 10))} labels={labels} canStep={false} empty="Nothing ready." />
          </Section>
          <Section title={`Being worked on (${d.queue.length})`} bodyClassName="p-0" actions={<Link className="text-sm underline" href={`${base}/tickets`}>All</Link>}>
            <TicketTable departmentId={department.id} tickets={serialize(d.queue.slice(0, 10))} labels={labels} canStep={perms.servicesTicket} empty="Nothing in progress." />
          </Section>
        </div>
      )}
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title={`${carWash ? "Washes" : "Collections"}, last 14 days`} actions={<Link href={`${base}/reports`} className="text-sm underline">Reports</Link>}>
          <ValueBars data={d.days.map((x) => ({ label: formatDateKey(x.dateKey, { weekday: false }).slice(0, 6), value: x.amount }))} empty="Nothing collected yet." />
        </Section>
        {carWash ? (
          <Section title="Washers today" bodyClassName="p-0">
            <ul className="divide-y divide-slate-100 text-sm">{d.workers.filter((x) => x.isActive).map((x) => <li key={x.id} className="flex justify-between px-4 py-2"><span>{x.name}</span><span className="text-slate-600">{x.period.tickets} wash(es) · earned <Money value={x.period.commission} /></span></li>)}{d.workers.length ? null : <li className="px-4 py-3 text-slate-500">No washer yet: add them on the Washers page.</li>}</ul>
          </Section>
        ) : (
          <Section title="Late">
            {d.tickets.filter((t) => t.late).length ? <ul className="space-y-1 text-sm">{d.tickets.filter((t) => t.late).map((t) => <li key={t.id}><Link className="hover:underline" href={`${base}/tickets/${t.id}`}>{t.referenceNo} · {t.customer || "walk-in"}</Link> <Pill tone="rose">promised {t.promisedLabel}</Pill></li>)}</ul> : <p className="text-sm text-slate-500">Nothing late.</p>}
          </Section>
        )}
      </div>
    </>
  );
}

async function load(page) {
  const { user, department, domain } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const [d, workers] = await Promise.all([
    serviceDashboard({ department, todayKey, timeZone }),
    domain.workers ? db.serviceWorker.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return { d, workers, todayKey };
}

/** Dashboard of a pressing or a car wash. */
export async function ServiceHome({ page }) {
  const { department, domain, perms } = page;
  const { d, workers, todayKey } = await load(page);
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={formatDateKey(todayKey)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/search`}><Button variant="outline"><Search className="h-4 w-4" /> Search</Button></Link>
            {perms.servicesTicket ? <Link href={`${base}/tickets/new`}><Button><Plus className="h-4 w-4" /> New {domain.words.ticket.toLowerCase()}</Button></Link> : null}
          </div>
        }
      />
      <Section title="Alerts" description={d.warnings.length ? `${d.warnings.length} point(s) to look at` : undefined}>
        <AttentionList warnings={d.warnings} base={base} empty="Nothing needs attention: nothing late, every ready customer told, nobody left owing." />
      </Section>
      <ServiceSections page={page} d={d} workers={workers} />
    </div>
  );
}

/** The jobs part of an other activity's dashboard (its sales part: components/trade/trade-home). */
export async function jobsExtra(page) {
  const { d, workers } = await load(page);
  if (!d.tickets.length && !d.owing.count && !d.today.received && !d.month.servicesRevenue) return { warnings: d.warnings, body: null };
  return { warnings: d.warnings, body: <ServiceSections page={page} d={d} workers={workers} title="Jobs" /> };
}
