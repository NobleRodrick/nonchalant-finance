import Link from "next/link";
import { FilePlus2, HandCoins, Search } from "lucide-react";
import { pageDate } from "@/lib/page-guards";
import { formatDateKey, periodRange } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { propertyDashboard } from "@/lib/property/dashboard";
import { propertyReport, propertyTrends } from "@/lib/property/reports";
import { monthLabel } from "@/lib/property/rent-schedule";
import { unitTitle } from "@/lib/property/unit-math";
import { Button } from "@/components/ui/button";
import { DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { AttentionList } from "@/components/kit/attention-list";
import { ValueBars } from "@/components/charts/value-bars";
import { UnitStatusBadge } from "@/components/property/status";

/**
 * Property rental dashboard: offices (total, occupied, available, reserved, maintenance), money
 * of the month (rent expected, collected, outstanding, utilities, other income, expenses, net),
 * tenants (owing, paid, overdue), alerts, payments due this week, moves, the last 6 months.
 */
export async function PropertyHome({ page }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const month = periodRange("month", todayKey);
  const [d, r, trends] = await Promise.all([
    propertyDashboard({ departmentId: department.id, todayKey, timeZone }),
    propertyReport({ departmentId: department.id, organizationId: user.organizationId, fromKey: month.fromKey, toKey: month.toKey, timeZone, todayKey }),
    propertyTrends({ department, toKey: todayKey, months: 6, timeZone }),
  ]);
  const base = `/d/${department.id}`;
  const c = d.summary.all;
  const i = r.income;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={`${formatDateKey(todayKey)} · ${d.buildings.map((b) => b.name).join(" & ")}`}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/search`}><Button variant="outline"><Search className="h-4 w-4" /> Search</Button></Link>
            <Link href={`${base}/arrears`}><Button variant="outline"><HandCoins className="h-4 w-4" /> Arrears</Button></Link>
            {perms.propertyLease ? <Link href={`${base}/contracts/new`}><Button><FilePlus2 className="h-4 w-4" /> New contract</Button></Link> : null}
          </div>
        }
      />

      <Section title="Alerts" description={d.warnings.length ? `${d.warnings.length} point(s) to look at` : undefined}>
        <AttentionList warnings={d.warnings} base={base} empty="Nothing needs attention: rent, utilities, contracts, deposits and maintenance are in order." />
      </Section>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Offices</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="property-offices">
          <StatCard tone="dark" label="Total offices" value={c.total} hint={`${c.occupancyRate}% occupied`} href={`${base}/offices`} />
          <StatCard label="Occupied" value={c.OCCUPIED} href={`${base}/offices?status=OCCUPIED`} />
          <StatCard tone={c.vacant ? "warn" : "default"} label="Available" value={c.vacant} hint={c.AWAITING_HANDOVER ? `${c.AWAITING_HANDOVER} awaiting handover` : undefined} href={`${base}/offices?status=AVAILABLE`} />
          <StatCard label="Reserved" value={c.RESERVED} href={`${base}/offices?status=RESERVED`} />
          <StatCard label="Under maintenance" value={c.MAINTENANCE + c.UNAVAILABLE} href={`${base}/offices?status=MAINTENANCE`} />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Money · {monthLabel(todayKey.slice(0, 7))}</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="property-money">
          <StatCard label="Rent expected" value={formatMoney(r.rent.expected)} hint={`${formatMoney(d.rentPerMonth)} a month from active contracts`} />
          <StatCard tone="in" label="Rent collected" value={formatMoney(r.rent.collected)} href={`${base}/money`} />
          <StatCard tone={r.arrears.overdue ? "out" : r.arrears.owed ? "warn" : "default"} label="Rent outstanding (all tenants)" value={formatMoney(r.arrears.owed)} hint={`Overdue ${formatMoney(r.arrears.overdue)}`} href={`${base}/arrears`} />
          <StatCard label="Utility income" value={formatMoney(i.utilities)} hint={`Other ${formatMoney(i.otherCharges + i.otherIncome)}`} href={`${base}/billing`} />
          <StatCard tone="out" label="Expenses" value={formatMoney(i.expenses)} href={`${base}/money?kind=out`} />
          <StatCard tone={i.net < 0 ? "out" : "in"} label="Net income" value={formatMoney(i.net)} hint={`Margin ${formatRate(i.margin)}`} href={`${base}/reports`} />
          <StatCard label="Deposits held" value={formatMoney(r.deposits.held)} />
          <StatCard tone={r.verification.discrepancies ? "out" : "default"} label="Cash to hand over" value={formatMoney(r.verification.toHandOver)} href={`${base}/cash-handover`} />
        </div>
      </div>

      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Tenants</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="property-tenants">
          <StatCard label="Total tenants" value={d.tenants.total} href={`${base}/tenants`} />
          <StatCard tone={d.tenants.owing ? "warn" : "default"} label="Tenants owing" value={d.tenants.owing} href={`${base}/tenants?owing=1`} />
          <StatCard label="Fully paid" value={d.tenants.paid} href={`${base}/tenants?owing=0`} />
          <StatCard tone={d.tenants.overdue ? "out" : "default"} label="Overdue" value={d.tenants.overdue} href={`${base}/arrears`} />
        </div>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Payments due in the next 7 days" actions={<Link href={`${base}/calendar`} className="text-sm underline">Calendar</Link>}>
          <DataTable dense rows={d.dueThisWeek} empty="Nothing due in the next 7 days." columns={[{ key: "d", label: "Due", render: (x) => x.dueKey }, { key: "t", label: "Tenant", render: (x) => <Link className="hover:underline" href={`${base}/contracts/${x.id}`}>{x.tenant}</Link> }, { key: "u", label: "Office", render: (x) => unitTitle(x.unit) }, { key: "a", label: "Amount", align: "right", render: (x) => <Money value={x.amount} suffix={false} /> }]} />
        </Section>
        <Section title="By building">
          <DataTable dense rowKey={(b) => b.id} rows={d.summary.byBuilding} columns={[{ key: "n", label: "Building", render: (b) => <Link className="hover:underline" href={`${base}/offices?building=${b.id}`}>{b.name}</Link> }, { key: "o", label: "Occupied", align: "right", render: (b) => `${b.counts.OCCUPIED} / ${b.counts.total}` }, { key: "r", label: "Rent a month", align: "right", render: (b) => <Money value={b.expected} suffix={false} /> }, { key: "w", label: "Owed", align: "right", render: (b) => <Money value={b.owed} suffix={false} /> }, { key: "inc", label: "Income this month", align: "right", render: (b) => <Money value={r.by.buildings.find((x) => x.id === b.id)?.revenue || 0} suffix={false} /> }]} />
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Last 6 months" description="Total income (net on hover)" actions={<Link href={`${base}/reports`} className="text-sm underline">Reports</Link>}>
          <ValueBars data={trends.map((m) => ({ label: monthLabel(m.monthKey, true), revenue: m.revenue, detail: `net ${formatMoney(m.net)}, collected ${formatMoney(m.collected)}` }))} valueKey="revenue" empty="No income yet." />
        </Section>
        <Section title="Moves and contracts ending">
          {d.moves.length ? (
            <ul className="divide-y divide-slate-100 text-sm">{d.moves.map((m) => <li key={m.id} className="flex justify-between gap-2 py-2"><Link className="hover:underline" href={`${base}/contracts/${m.id}`}>{m.tenant} · {unitTitle(m.unit)}</Link><span className="text-slate-600">{m.kind} {m.dateKey}</span></li>)}</ul>
          ) : <p className="text-sm text-slate-500">No move-in or contract ending soon.</p>}
          <div className="mt-3 flex flex-wrap gap-2">{d.units.filter((u) => u.status !== "OCCUPIED").slice(0, 8).map((u) => <Link key={u.id} href={`${base}/offices/${u.id}`} className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">{u.name} <UnitStatusBadge status={u.status} /></Link>)}</div>
        </Section>
      </div>
    </div>
  );
}
