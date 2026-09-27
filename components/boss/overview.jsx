import Link from "next/link";
import { AlertTriangle, ArrowRight, Info, OctagonAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Money, Pill, Section, StatCard, StatusBadge } from "@/components/kit/primitives";
import { MoneyBars } from "@/components/charts/money-bars";
import { ReportCalendar } from "@/components/boss/report-calendar";
import { getDomain } from "@/lib/domains/registry";
import { formatDateKey } from "@/lib/timezone";
import { countOf, formatPct } from "@/lib/format";
import { cn } from "@/lib/utils";

const ALERT_ICON = { bad: OctagonAlert, warn: AlertTriangle, info: Info };
const ALERT_TONE = { bad: "border-rose-200 bg-rose-50 text-rose-900", warn: "border-amber-200 bg-amber-50 text-amber-900", info: "border-sky-200 bg-sky-50 text-sky-900" };

export function BossOverview({ data, dateKey, isToday }) {
  if (!data) {
    return (
      <EmptyState
        title="No departments yet"
        description="Create your first department and choose its type. Then add its department head."
        action={<Link href="/boss/departments"><Button>Create a department</Button></Link>}
      />
    );
  }
  const k = data.kpis;
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
        <StatCard label={isToday ? "Money in today" : "Money in"} value={<Money value={k.moneyIn} />} tone="in" hint={k.moneyInChange === null ? "vs the day before: —" : `vs the day before: ${formatPct(k.moneyInChange)}`} href={`/statements?period=custom&from=${dateKey}&to=${dateKey}`} />
        <StatCard label="Money out" value={<Money value={k.moneyOut} />} tone="out" href={`/statements?period=custom&from=${dateKey}&to=${dateKey}`} />
        <StatCard label="Result" value={<Money value={k.result} />} tone="dark" hint={k.resultChange === null ? "" : `vs the day before: ${formatPct(k.resultChange)}`} />
        <StatCard label="Cash received" value={<Money value={k.handedOver} />} hint={k.pendingHandoverCount ? `${k.pendingHandoverCount} waiting for your confirmation` : "Nothing waiting"} href="/boss/cash" />
        <StatCard label="Owed by customers" value={<Money value={k.debtsOwed} />} tone="warn" href="/statements?tab=debts" />
        <StatCard label="Stock value" value={<Money value={k.stockValue} />} href="/statements?tab=stock&period=today" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-xs">
        This month so far: money in <Money value={k.month.moneyIn} className="font-semibold text-slate-900" /> · money out <Money value={k.month.moneyOut} className="font-semibold text-slate-900" /> · result <Money value={k.month.result} className="font-semibold text-slate-900" /> ·{" "}
        <Link href="/statements" className="font-medium underline">Open the statements</Link>
      </div>

      {data.alerts.length ? (
        <div className="space-y-2">
          {data.alerts.slice(0, 8).map((a, i) => {
            const Icon = ALERT_ICON[a.tone] || Info;
            return (
              <Link key={i} href={a.href} className={cn("flex items-center gap-3 rounded-lg border px-4 py-2.5 text-sm transition hover:shadow-sm", ALERT_TONE[a.tone])}>
                <Icon className="h-4 w-4 shrink-0" />
                <span className="flex-1">{a.text}</span>
                <ArrowRight className="h-4 w-4 opacity-60" />
              </Link>
            );
          })}
        </div>
      ) : (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">Nothing needs your attention.</div>
      )}

      <div>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-900">Departments</h2>
          <Link href="/boss/departments" className="text-sm text-slate-500 hover:text-slate-900">Manage</Link>
        </div>
        <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {data.cards.map((c) => {
            const domain = getDomain(c.domain);
            return (
              <div key={c.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <Link href={`/d/${c.id}`} className="font-semibold text-slate-900 hover:underline">{c.name}</Link>
                    <div className="mt-1"><Pill tone={domain.color}>{domain.label}</Pill></div>
                    <div className="mt-1.5 text-xs text-slate-500">
                      {c.heads.length ? <>{c.heads.length === 1 ? "Head" : "Heads"}: <span className="font-medium text-slate-700">{c.heads.join(", ")}</span></> : <Link href={`/boss/people?dept=${c.id}`} className="font-medium text-amber-700 underline">No head: assign one</Link>}
                    </div>
                  </div>
                  {domain.enabled && c.report ? (
                    c.report.reportId ? (
                      <Link href={`/boss/daily-reports/${c.report.reportId}`}><StatusBadge status={c.report.status} /></Link>
                    ) : (
                      <StatusBadge status={c.report.status} />
                    )
                  ) : !domain.enabled ? <StatusBadge status="COMING_SOON" /> : null}
                </div>
                {domain.enabled ? (
                  <>
                    <div className="mt-4 grid grid-cols-3 gap-2 text-center">
                      <div className="rounded-lg bg-emerald-50 px-2 py-2"><div className="text-[11px] text-emerald-800">In</div><Money value={c.moneyIn} suffix={false} className="text-sm font-semibold" /></div>
                      <div className="rounded-lg bg-rose-50 px-2 py-2"><div className="text-[11px] text-rose-800">Out</div><Money value={c.moneyOut} suffix={false} className="text-sm font-semibold" /></div>
                      <div className="rounded-lg bg-slate-900 px-2 py-2 text-white"><div className="text-[11px] text-slate-300">Result</div><Money value={c.result} suffix={false} className="text-sm font-semibold" /></div>
                    </div>
                    <div className="mt-3 space-y-1 text-sm text-slate-600">
                      <div className="flex justify-between"><span>Stock value</span><span><Money value={c.stockValue} /> <span className="text-xs text-slate-400">({countOf(c.plates, "plate")})</span></span></div>
                      <div className="flex justify-between"><span>Owed by customers</span><Money value={c.debts} /></div>
                      <div className="flex justify-between"><span>Cash handed over</span><span><Money value={c.handedOver} />{c.handoverPending ? <span className="text-xs text-amber-700"> · <Money value={c.handoverPending} suffix={false} /> to confirm</span> : null}</span></div>
                      {c.outOfStock ? <div className="text-xs text-rose-700">{c.outOfStock === 1 ? "1 dish" : `${c.outOfStock} dishes`} out of stock</div> : null}
                    </div>
                  </>
                ) : (
                  <p className="mt-4 text-sm text-slate-500">This department type is coming soon.</p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-6 2xl:grid-cols-2">
        <Section title="Daily reports this week" actions={<Link className="text-sm font-medium underline" href="/boss/daily-reports">All reports</Link>}>
          <ReportCalendar calendar={data.calendar} />
        </Section>
        <Section title="Last 30 days" description="Money in and money out of every department">
          <MoneyBars data={data.series} height={260} />
        </Section>
      </div>

      {data.toReview.length ? (
        <Section title="Reports waiting for you">
          <ul className="divide-y divide-slate-100">
            {data.toReview.map((r) => (
              <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
                <span>
                  <strong>{r.department}</strong> · {formatDateKey(r.dateKey)} · sent by {r.submittedBy}
                  {r.version > 1 ? ` · version ${r.version}` : ""}
                </span>
                <span className="flex items-center gap-3">
                  <span className="text-slate-500">Result <Money value={r.totals?.result} /></span>
                  <Link href={`/boss/daily-reports/${r.id}`}><Button size="sm">Review</Button></Link>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
    </div>
  );
}
