import Link from "next/link";
import { AlertTriangle, CalendarDays, FileBarChart, Plus, SlidersHorizontal } from "lucide-react";
import { pageDate } from "@/lib/page-guards";
import { hallOf } from "@/lib/venue/hall-service";
import { priceForDate } from "@/lib/venue/pricing";
import { venueReport } from "@/lib/venue/reports";
import { expiredHolds } from "@/lib/venue/booking-queries";
import { departmentTeam } from "@/lib/departments/team";
import { formatDateKey, periodRange } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { serialize } from "@/lib/serialize";
import { Banner, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { Button } from "@/components/ui/button";
import { DepartmentTeam } from "@/components/departments/department-team";
import { ValueBars } from "@/components/charts/value-bars";
import { UpcomingList, BestPeriods, monthLabel } from "./dashboard/dashboard-parts";

/**
 * Dashboard of an event venue department (docs/VENUE_RENTAL_PLAN.md §8): this month's money,
 * what clients still owe, cash to hand over, the next events and free dates, leads, assets and
 * the revenue of the last 12 months. Every figure comes from lib/venue/reports (the Reports page
 * and the statements read the same).
 */
export async function VenueHome({ page }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const base = `/d/${department.id}`;
  const month = periodRange("month", todayKey);
  const [hall, team, r, holds] = await Promise.all([
    hallOf(department.id),
    perms.boss ? departmentTeam(department.id) : [],
    venueReport({ departmentId: department.id, organizationId: user.organizationId, fromKey: month.fromKey, toKey: month.toKey, timeZone, todayKey }),
    expiredHolds({ departmentId: department.id, todayKey }),
  ]);
  const today = hall ? priceForDate(todayKey, { basePrice: hall.basePrice, rules: hall.rules }) : null;
  const monthName = monthLabel(todayKey.slice(0, 7), true);
  const byMonth = r.byMonth.map((m) => ({ label: monthLabel(m.monthKey), revenue: m.revenue, detail: `${m.events} event(s), profit ${formatMoney(m.profit)}` }));
  const byWeekday = r.byWeekday.map((w) => ({ label: w.label.slice(0, 3), revenue: w.revenue, detail: `${w.events} event(s), average ${formatMoney(w.average)}` }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={`${formatDateKey(todayKey)}${hall ? ` · ${hall.name}` : ""}${today ? ` · today's price ${formatMoney(today.price)} (${today.label})` : ""}`}
        actions={
          <>
            {perms.venueBook && hall ? <Link href={`${base}/calendar`}><Button><Plus className="h-4 w-4" /> Book a date</Button></Link> : null}
            <Link href={`${base}/reports`}><Button variant="outline"><FileBarChart className="h-4 w-4" /> Reports</Button></Link>
            <Link href={`${base}/hall`}><Button variant="outline"><SlidersHorizontal className="h-4 w-4" /> Hall & prices</Button></Link>
          </>
        }
      />

      {!hall ? (
        <Banner tone="warn" action={perms.venueManage ? <Link href={`${base}/hall`}><Button size="sm">Set up the hall</Button></Link> : null}>
          {perms.venueManage ? "Start by setting up the hall: its name, capacity, base price and the prices of each date." : "The hall is not set up yet."}
        </Banner>
      ) : null}
      {holds.length ? (
        <Banner tone="warn" action={<Link href={`${base}/bookings?status=RESERVED`}><Button size="sm" variant="outline">Decide</Button></Link>}>
          <AlertTriangle className="mr-1 inline h-4 w-4" />
          {holds.length === 1 ? "1 reservation's hold is over" : `${holds.length} reservations' holds are over`} without a deposit:{" "}
          {holds.slice(0, 4).map((b) => `${formatDateKey(b.eventDateKey, { weekday: false })} (${b.client.name})`).join(", ")}
          {holds.length > 4 ? "…" : ""}. The dates stay held until you confirm, extend or cancel.
        </Banner>
      ) : null}

      <div>
        <h2 className="mb-2 text-sm font-semibold text-slate-900">{monthName}</h2>
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="venue-kpis">
          <StatCard tone="dark" label="Revenue" value={formatMoney(r.income.revenue)} hint={`${r.events.length} event(s) held · result ${formatMoney(r.income.result)}`} href={`${base}/reports?period=month`} />
          <StatCard tone="in" label="Received from clients" value={formatMoney(r.cashFlow.receivedFromClients)} hint={`Cash ${formatMoney(r.cashFlow.byMethod.CASH)} · MoMo ${formatMoney(r.cashFlow.byMethod.MOMO)}`} href={`${base}/money`} />
          <StatCard tone={r.outstanding.total ? "warn" : "default"} label="Still owed by clients" value={formatMoney(r.outstanding.total)} hint={`${r.outstanding.rows.length} booking(s) · advances held ${formatMoney(r.outstanding.advances)}`} href={`${base}/reports?period=month#outstanding`} />
          <StatCard
            tone={r.verification.discrepancies ? "out" : "default"}
            label="Cash to hand over"
            value={formatMoney(r.verification.toHandOver)}
            hint={`${formatMoney(r.cashFlow.handedOver)} handed over this month${r.verification.discrepancies ? ` · ${formatMoney(r.verification.discrepancies)} in discrepancies` : " · no discrepancy"}`}
            href={`${base}/reports?period=month#cash`}
          />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Upcoming bookings" value={r.upcomingCount} hint={`${r.bookings.total} booking(s) this month${r.upcoming[0] ? ` · next ${formatDateKey(r.upcoming[0].eventDateKey, { weekday: false })}` : ""}`} href={`${base}/bookings`} icon={CalendarDays} />
        <StatCard label="Free dates" value={`${r.available.next30} in 30 days`} hint={`${r.available.next90} in the next 90 days`} href={`${base}/calendar`} />
        <StatCard label="Leads this month" value={r.leads.total} hint={`${r.leads.booked} booked · ${r.leads.lost} lost · ${r.leads.open} open · ${formatRate(r.leads.conversionRate)} converted`} href={`${base}/leads?period=month`} />
        <StatCard
          tone={r.assets.open ? "warn" : "default"}
          label="Asset damage & event costs"
          value={formatMoney(r.assets.loss + r.eventExpenses)}
          hint={`Losses ${formatMoney(r.assets.loss)} · event expenses ${formatMoney(r.eventExpenses)}${r.assets.open ? ` · ${formatMoney(r.assets.open)} to settle` : ""}`}
          href={`${base}/assets`}
        />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Next events" description="Reserved and confirmed, with what is still owed" className="xl:col-span-2" actions={<Link className="text-sm font-medium underline" href={`${base}/bookings`}>All bookings</Link>}>
          <UpcomingList base={base} bookings={serialize(r.upcoming)} todayKey={todayKey} />
        </Section>
        <Section title="Most profitable periods" description="Last 12 months, completed events">
          <BestPeriods best={serialize(r.best)} />
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Revenue by month" description="Completed events on their date, last 12 months">
          <ValueBars data={byMonth} valueKey="revenue" empty="No completed event in the last 12 months." />
        </Section>
        <Section title="Revenue by day of the week" description="Last 12 months: which days earn the most">
          <ValueBars data={byWeekday} valueKey="revenue" color="#0f766e" empty="No completed event in the last 12 months." />
        </Section>
      </div>

      {perms.boss ? <DepartmentTeam departmentId={department.id} team={team} /> : null}
    </div>
  );
}
