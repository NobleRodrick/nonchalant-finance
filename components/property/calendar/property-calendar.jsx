"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarClock } from "lucide-react";
import { Money, Pill } from "@/components/kit/primitives";
import { MonthGrid } from "@/components/kit/month-grid";
import { formatDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const DOT = { amber: "bg-amber-500", sky: "bg-sky-500", rose: "bg-rose-500", emerald: "bg-emerald-500", violet: "bg-violet-500", cyan: "bg-cyan-500", slate: "bg-slate-400" };

/**
 * The month of a property rental department: rent and charges due (red when still owed after the
 * date), contract expiries, move-ins and move-outs, maintenance appointments, inspections. A day
 * opens everything scheduled that day.
 */
export function PropertyCalendar({ departmentId, monthKey, todayKey, grid, days, kinds }) {
  const [selected, setSelected] = useState(todayKey >= grid.first && todayKey <= grid.last ? todayKey : grid.first);
  const agenda = days.find((d) => d.dateKey === selected)?.entries || [];
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      <div className="xl:col-span-2">
        <MonthGrid
          monthKey={monthKey}
          todayKey={todayKey}
          days={days}
          first={grid.first}
          last={grid.last}
          selectedKey={selected}
          hrefOf={(m) => `/d/${departmentId}/calendar?month=${m}`}
          toolbar={<div className="flex flex-wrap gap-2 text-xs text-slate-600">{Object.entries(kinds).map(([k, v]) => <span key={k} className="inline-flex items-center gap-1"><span className={cn("h-2 w-2 rounded-full", DOT[v.tone])} aria-hidden="true" />{v.label}</span>)}</div>}
          renderDay={(d) => ({
            className: cn("border-slate-200 bg-white hover:border-slate-400", d.dateKey < todayKey && "bg-slate-50", d.entries.some((e) => e.owed > 0 && e.dateKey < todayKey) && "border-rose-300"),
            label: `${formatDateKey(d.dateKey)}: ${d.entries.length} item(s)`,
            onClick: () => setSelected(d.dateKey),
            body: (
              <div className="mt-1 min-w-0 space-y-0.5">
                {d.entries.slice(0, 3).map((e, n) => (
                  <div key={n} className="flex items-center gap-1 truncate text-[11px]">
                    <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[kinds[e.kind].tone])} aria-hidden="true" />
                    <span className={cn("truncate", e.paid && "text-slate-400 line-through")}>{e.label}</span>
                  </div>
                ))}
                {d.entries.length > 3 ? <div className="text-[10px] text-slate-500">+{d.entries.length - 3} more</div> : null}
              </div>
            ),
          })}
        />
      </div>
      <aside className="space-y-3" aria-live="polite" data-testid="day-agenda">
        <h3 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="h-4 w-4" /> {formatDateKey(selected)}</h3>
        {!agenda.length ? <p className="text-sm text-slate-500">Nothing scheduled.</p> : null}
        {agenda.map((e, n) => (
          <Link key={n} href={e.href} className="block rounded-xl border border-slate-200 bg-white p-3 shadow-xs hover:border-slate-400">
            <div className="flex items-start justify-between gap-2">
              <div className="font-medium">{e.label}</div>
              <Pill tone={kinds[e.kind].tone}>{kinds[e.kind].label}</Pill>
            </div>
            {e.detail ? <div className="text-sm text-slate-600">{e.detail}</div> : null}
            {e.amount ? <div className="mt-1 text-sm">{e.owed ? <span className="font-semibold text-rose-700">owes <Money value={e.owed} /></span> : <span className="text-emerald-700">paid <Money value={e.amount} /></span>}</div> : null}
          </Link>
        ))}
      </aside>
    </div>
  );
}
