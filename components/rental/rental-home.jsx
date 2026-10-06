import Link from "next/link";
import { Boxes, CalendarPlus, CircleAlert, PackageCheck, Search, Truck } from "lucide-react";
import { pageDate } from "@/lib/page-guards";
import { formatDateKey, periodRange } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { rentalDashboard } from "@/lib/rental/dashboard";
import { rentalReport, rentalTrends } from "@/lib/rental/reports";
import { Button } from "@/components/ui/button";
import { Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { AttentionList } from "@/components/kit/attention-list";
import { ValueBars } from "@/components/charts/value-bars";
import { StageBadge, PaymentBadge } from "@/components/rental/bookings/stage-badge";
import { monthLabel } from "@/components/venue/dashboard/dashboard-parts";

/** A short list of bookings for the dashboard (today's work, the next days). */
function OrderList({ orders, base, when, empty }) {
  if (!orders.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ul className="divide-y divide-slate-100">
      {orders.slice(0, 8).map((o) => (
        <li key={o.id} className="flex items-center justify-between gap-3 py-2 text-sm">
          <Link href={`${base}/bookings/${o.id}`} className="min-w-0 hover:underline">
            <span className="block truncate font-medium text-slate-900">{o.eventType} · {o.client?.name}</span>
            <span className="block truncate text-xs text-slate-500">{o.referenceNo}{when ? ` · ${when(o)}` : ""}{o.eventLocation ? ` · ${o.eventLocation}` : ""}</span>
          </Link>
          <span className="flex shrink-0 items-center gap-1.5"><StageBadge stage={o.stage} /><PaymentBadge order={o} /></span>
        </li>
      ))}
      {orders.length > 8 ? <li className="py-2 text-xs text-slate-500">and {orders.length - 8} more</li> : null}
    </ul>
  );
}

/**
 * Event rental dashboard: what needs attention (late returns, missing items, overdue and unpaid
 * balances, bookings to prepare, low stock, damaged items, refused bookings, approvals), today's
 * work, the next 7 days, this month's figures and the last 6 months.
 */
export async function RentalHome({ page }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const month = periodRange("month", todayKey);
  const [d, r, trends] = await Promise.all([
    rentalDashboard({ departmentId: department.id, todayKey, timeZone }),
    rentalReport({ departmentId: department.id, organizationId: user.organizationId, fromKey: month.fromKey, toKey: month.toKey, timeZone, todayKey }),
    rentalTrends({ department, toKey: todayKey, months: 6, timeZone }),
  ]);
  const base = `/d/${department.id}`;
  const t = d.stock;
  const short = (k) => formatDateKey(k, { weekday: true }).replace(/ \d{4}$/, "");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={`${formatDateKey(todayKey)} · stock, bookings, dispatch and returns, money and profit of every event.`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/search`}><Button variant="outline"><Search className="h-4 w-4" /> Search</Button></Link>
            {perms.rentalBook ? <Link href={`${base}/bookings/new`}><Button><CalendarPlus className="h-4 w-4" /> New booking</Button></Link> : null}
          </div>
        }
      />

      <Section title="Needs attention" description={d.warnings.length ? `${d.warnings.length} point(s) to look at` : undefined}>
        <AttentionList warnings={d.warnings} base={base} />
      </Section>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="rental-kpis">
        <StatCard tone="dark" label="Revenue this month" value={formatMoney(r.income.revenue)} hint={`${r.activity.events} event(s) · margin ${formatRate(r.income.margin)}`} href={`${base}/reports`} />
        <StatCard tone={r.income.result < 0 ? "out" : "in"} label="Profit this month" value={formatMoney(r.income.result)} hint={`Costs ${formatMoney(r.income.costs)}`} href={`${base}/reports`} />
        <StatCard label="Collected this month" value={formatMoney(r.cashFlow.receivedFromClients)} hint={`Cash to hand over ${formatMoney(r.verification.toHandOver)}`} href={`${base}/money`} />
        <StatCard tone={r.balances.overdue ? "out" : r.balances.owedTotal ? "warn" : "default"} label="Owed by customers" value={formatMoney(r.balances.owedTotal)} hint={`Overdue ${formatMoney(r.balances.overdue)}`} href={`${base}/bookings?payment=overdue&status=all`} />
        <StatCard label="In the store" value={t.inStock} hint={`${t.lines} kinds of items · ${formatMoney(t.value)}`} icon={PackageCheck} href={`${base}/stock`} />
        <StatCard label="Out at events" value={t.out} hint={`${d.pipeline.out} booking(s) out`} icon={Truck} href={`${base}/bookings?status=DISPATCHED`} />
        <StatCard label="Damaged, in repair, missing" value={t.damaged + t.inRepair + t.missing} icon={CircleAlert} tone={t.damaged + t.missing ? "warn" : "default"} href={`${base}/damages`} />
        <StatCard label="Quotations waiting" value={d.pipeline.quoted} hint={`${formatMoney(d.pipeline.quotedValue)} · ${d.pipeline.inquiries} inquiry(ies)`} icon={Boxes} href={`${base}/bookings?status=QUOTED`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Leaving today" description="Prepare and dispatch">
          <OrderList orders={d.today.leaving} base={base} when={(o) => `event ${short(o.eventDateKey)}`} empty="Nothing leaves today." />
        </Section>
        <Section title="Events today">
          <OrderList orders={d.today.events} base={base} empty="No event today." />
        </Section>
        <Section title="Coming back" description="Due back today or late">
          <OrderList orders={d.today.returning} base={base} when={(o) => `due ${short(o.returnDateKey)}`} empty="Nothing is due back today." />
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Next 7 days" description="Confirmed events" actions={<Link href={`${base}/calendar`} className="text-sm underline">Calendar</Link>}>
          <OrderList orders={d.upcoming} base={base} when={(o) => short(o.eventDateKey)} empty="No event in the next 7 days." />
        </Section>
        <Section title="Last 6 months" description="Revenue by month (profit on hover)" actions={<Link href={`${base}/reports`} className="text-sm underline">Reports</Link>}>
          <ValueBars data={trends.map((m) => ({ label: monthLabel(m.monthKey), revenue: m.revenue, detail: `${m.events} event(s), profit ${formatMoney(m.result)}` }))} valueKey="revenue" empty="No revenue yet." />
        </Section>
      </div>

      {r.profitability.rows.length ? (
        <Section title="Most profitable events this month">
          <ul className="divide-y divide-slate-100 text-sm">
            {r.profitability.rows.slice(0, 5).map((e) => (
              <li key={e.id} className="flex justify-between gap-2 py-2">
                <Link href={`${base}/bookings/${e.id}`} className="truncate hover:underline">{e.eventType} · {e.client} · {short(e.eventDateKey)}</Link>
                <Money value={e.profit} className="font-semibold" />
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
