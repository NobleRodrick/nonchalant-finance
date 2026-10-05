import Link from "next/link";
import { AlertTriangle, BedDouble, CalendarDays, FileBarChart, Plus, Wrench } from "lucide-react";
import { pageDate } from "@/lib/page-guards";
import { formatDateKey, periodRange } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { apartmentsNow, listStaysView } from "@/lib/rooms/room-queries";
import { staysReport } from "@/lib/rooms/reports";
import { ROOM_STATE_LABELS } from "@/lib/rooms/stay-math";
import { departmentTeam } from "@/lib/departments/team";
import { serialize } from "@/lib/serialize";
import { Banner, DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { Button } from "@/components/ui/button";
import { DepartmentTeam } from "@/components/departments/department-team";
import { ValueBars } from "@/components/charts/value-bars";
import { NewStayButton } from "./new-stay-button";
import { STATE_TONE } from "./state-tone";
import { cn } from "@/lib/utils";

/**
 * Dashboard of a guest house (Executive Stay, docs/EXECUTIVE_STAY_PLAN.md): every apartment and
 * its state, today's arrivals and departures, upcoming bookings, revenue today / this week / this
 * month, expenses, cash received and handed over, balances owed, profit, pending maintenance and
 * the apartments compared. Every figure comes from lib/rooms/reports (the Reports page and the
 * statements read the same).
 */
export async function RoomsHome({ page }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const base = `/d/${department.id}`;
  const week = periodRange("week", todayKey);
  const month = periodRange("month", todayKey);
  const args = { departmentId: department.id, organizationId: user.organizationId, timeZone, todayKey };
  const [rooms, today, wk, mo, upcoming, team] = await Promise.all([
    apartmentsNow({ departmentId: department.id, todayKey, includeInactive: false }),
    staysReport({ ...args, fromKey: todayKey, toKey: todayKey }),
    staysReport({ ...args, fromKey: week.fromKey, toKey: week.toKey }),
    staysReport({ ...args, fromKey: month.fromKey, toKey: month.toKey }),
    listStaysView({ departmentId: department.id, view: "upcoming", take: 6 }),
    perms.boss ? departmentTeam(department.id) : [],
  ]);
  const count = (s) => rooms.filter((r) => r.displayState === s).length;
  const arrivals = upcoming.filter((s) => s.checkInKey === todayKey);
  const departures = rooms.filter((r) => r.current?.checkOutKey === todayKey).map((r) => r.current);
  const pendingByRoom = {};
  for (const r of mo.repairs.openList) (pendingByRoom[r.roomId] ||= []).push(r);
  const comparison = mo.profitability.rows.map((x) => ({ label: x.name, value: x.revenue, detail: `profit ${formatMoney(x.profit)} · ${formatRate(x.occupancyRate)} occupied` }));

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={`${formatDateKey(todayKey)} · ${rooms.length} apartment(s)`}
        actions={
          <>
            {perms.roomsBook && rooms.length ? <NewStayButton departmentId={department.id} rooms={serialize(rooms)} todayKey={todayKey} /> : null}
            <Link href={`${base}/occupancy`}><Button variant="outline"><CalendarDays className="h-4 w-4" /> Calendar</Button></Link>
            <Link href={`${base}/reports`}><Button variant="outline"><FileBarChart className="h-4 w-4" /> Reports</Button></Link>
          </>
        }
      />

      {!rooms.length ? (
        <Banner tone="warn" action={perms.roomsManage ? <Link href={`${base}/rooms`}><Button size="sm"><Plus className="h-4 w-4" /> Add the apartments</Button></Link> : null}>
          Start by adding the apartments, their rates and what is in them.
        </Banner>
      ) : null}
      {mo.unvalidated.count ? (
        <Banner tone="info" action={<Link href={`${base}/money?pending=1&period=year`}><Button size="sm" variant="outline">Check them</Button></Link>}>
          {mo.unvalidated.count} expense(s) for {formatMoney(mo.unvalidated.amount)} are waiting for validation by the Boss or another head.
        </Banner>
      ) : null}
      {today.verification.discrepancies ? (
        <Banner tone="bad"><AlertTriangle className="mr-1 inline h-4 w-4" /> Cash discrepancies today: {formatMoney(today.verification.discrepancies)}. <Link className="underline" href={`${base}/reports#cash`}>See the cash verification</Link></Banner>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5" data-testid="apartments-now">
        {rooms.map((r) => (
          <Link key={r.id} href={`${base}/rooms/${r.id}`} className={cn("rounded-xl border p-3 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md", STATE_TONE[r.displayState])}>
            <div className="flex items-center justify-between gap-2">
              <span className="inline-flex items-center gap-1.5 font-semibold"><BedDouble className="h-4 w-4" />{r.name}</span>
              {pendingByRoom[r.id] ? <span className="inline-flex items-center gap-0.5 text-xs" title="Repairs pending"><Wrench className="h-3.5 w-3.5" />{pendingByRoom[r.id].length}</span> : null}
            </div>
            <div className="mt-1 text-xs font-semibold uppercase tracking-wide">{ROOM_STATE_LABELS[r.displayState]}</div>
            <div className="mt-1 truncate text-sm">{r.current ? `${r.current.guestName} · until ${formatDateKey(r.current.checkOutKey, { weekday: false })}` : r.next ? `Next: ${r.next.guestName} ${formatDateKey(r.next.checkInKey, { weekday: false })}` : r.stateNote || "Free"}</div>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="stay-kpis">
        <StatCard label="Occupied vs available" value={`${count("OCCUPIED")} / ${rooms.length}`} hint={`${count("AVAILABLE")} available · ${count("RESERVED")} reserved · ${count("MAINTENANCE") + count("UNAVAILABLE")} out of use`} href={`${base}/rooms`} />
        <StatCard label="Today's bookings" value={`${arrivals.length} arriving · ${departures.length} leaving`} hint={`${today.activity.newBookings} new booking(s) made today`} href={`${base}/stays`} />
        <StatCard label="Upcoming bookings" value={mo.now.upcoming} hint={upcoming[0] ? `Next: ${upcoming[0].guestName}, ${formatDateKey(upcoming[0].checkInKey, { weekday: false })}` : "None"} href={`${base}/stays`} />
        <StatCard tone={mo.repairs.pending ? "warn" : "default"} label="Pending maintenance" value={mo.repairs.pending} hint={mo.repairs.pending ? `${Object.keys(pendingByRoom).length} apartment(s) · ${mo.repairs.urgent} urgent or high` : "Nothing to fix"} href={`${base}/maintenance`} icon={Wrench} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="dark" label="Revenue today" value={formatMoney(today.income.revenue)} hint={`This week ${formatMoney(wk.income.revenue)} · this month ${formatMoney(mo.income.revenue)}`} href={`${base}/reports?period=today`} />
        <StatCard tone="out" label="Expenses this month" value={formatMoney(mo.income.costs)} hint={`Maintenance ${formatMoney(mo.income.repairs)} · losses ${formatMoney(mo.income.assetLosses)}`} href={`${base}/money?period=month`} />
        <StatCard tone={mo.income.result < 0 ? "out" : "in"} label="Profit this month" value={formatMoney(mo.income.result)} hint={`Margin ${formatRate(mo.income.margin)} · this week ${formatMoney(wk.income.result)}`} href={`${base}/reports?period=month`} />
        <StatCard label="Occupancy this month" value={formatRate(mo.occupancy.rate)} hint={`${mo.nightsSold} night(s) sold`} />
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="in" label="Cash received this month" value={formatMoney(mo.cashFlow.receivedFromClients + mo.cashFlow.otherIncome)} hint={`Today ${formatMoney(today.cashFlow.receivedFromClients + today.cashFlow.otherIncome)}`} />
        <StatCard label="Cash handed over this month" value={formatMoney(mo.cashFlow.handedOver)} hint={mo.cashFlow.handoverPending ? `${formatMoney(mo.cashFlow.handoverPending)} waiting for the Boss` : undefined} />
        <StatCard tone={mo.verification.toHandOver ? "warn" : "default"} label="Cash to hand over now" value={formatMoney(mo.verification.toHandOver)} hint={mo.verification.discrepancies ? `Discrepancies this month ${formatMoney(mo.verification.discrepancies)}` : "No discrepancy this month"} href={`${base}/reports?period=month#cash`} />
        <StatCard tone={mo.balances.owedTotal ? "warn" : "default"} label="Outstanding balances" value={formatMoney(mo.balances.owedTotal)} hint={`For nights already stayed ${formatMoney(mo.balances.receivable)}`} href={`${base}/reports?period=month#outstanding`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Apartment performance" description="This month: revenue of each apartment" className="xl:col-span-2" actions={<Link className="text-sm font-medium underline" href={`${base}/reports?period=month`}>Full report</Link>}>
          <ValueBars data={comparison} empty="No revenue yet this month." />
          <DataTable
            dense
            rowKey={(x) => x.roomId}
            rows={mo.profitability.rows}
            columns={[
              { key: "name", label: "Apartment", render: (x) => <Link className="font-medium hover:underline" href={`${base}/rooms/${x.roomId}`}>{x.name}</Link> },
              { key: "occ", label: "Occupancy", align: "right", render: (x) => formatRate(x.occupancyRate) },
              { key: "rev", label: "Revenue", align: "right", render: (x) => <Money value={x.revenue} suffix={false} /> },
              { key: "costs", label: "Costs", align: "right", render: (x) => <Money value={x.costs} suffix={false} /> },
              { key: "profit", label: "Profit", align: "right", render: (x) => <Money value={x.profit} className="font-semibold" /> },
            ]}
          />
        </Section>
        <Section title="Upcoming bookings" actions={<Link className="text-sm font-medium underline" href={`${base}/stays`}>All</Link>}>
          {upcoming.length ? (
            <ul className="divide-y divide-slate-100 text-sm" data-testid="stay-upcoming">
              {upcoming.map((s) => (
                <li key={s.id}>
                  <Link href={`${base}/stays/${s.id}`} className="flex items-center justify-between gap-2 py-2 hover:bg-slate-50">
                    <span className="min-w-0"><span className="block truncate font-medium">{s.guestName}</span><span className="text-xs text-slate-500">{s.room.name} · {formatDateKey(s.checkInKey, { weekday: false })} → {formatDateKey(s.checkOutKey, { weekday: false })}</span></span>
                    {s.figures.balance > 0 && !s.complimentary ? <span className="whitespace-nowrap text-xs text-amber-800">{formatMoney(s.figures.balance)} owed</span> : null}
                  </Link>
                </li>
              ))}
            </ul>
          ) : <p className="py-6 text-center text-sm text-slate-500">No upcoming booking.</p>}
          {mo.repairs.openList.length ? (
            <div className="mt-4 border-t border-slate-100 pt-3">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Needs attention</h3>
              <ul className="space-y-1 text-sm">
                {mo.repairs.openList.slice(0, 5).map((r) => <li key={r.id}><Link className="hover:underline" href={`${base}/maintenance?room=${r.roomId}`}>{r.room.name}: {r.title}</Link> <span className="text-xs text-slate-500">({r.priority.toLowerCase()})</span></li>)}
              </ul>
            </div>
          ) : null}
        </Section>
      </div>

      {perms.boss ? <DepartmentTeam departmentId={department.id} team={team} /> : null}
    </div>
  );
}
