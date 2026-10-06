"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, CalendarClock, Plus, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/kit/primitives";
import { MonthGrid } from "@/components/kit/month-grid";
import { formatDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { PaymentBadge, StageBadge } from "@/components/rental/bookings/stage-badge";

const DOT = { slate: "bg-slate-400", emerald: "bg-emerald-500", amber: "bg-amber-500", sky: "bg-sky-500", cyan: "bg-cyan-500", violet: "bg-violet-500" };

/** What happens on a day for one booking. */
function rolesOn(o, k) {
  return [
    o.eventDateKey === k && "Event",
    o.dispatchDateKey === k && o.status !== "INQUIRY" && o.status !== "QUOTED" && "Items leave",
    o.returnDateKey === k && o.status !== "INQUIRY" && o.status !== "QUOTED" && "Items come back",
    o.paymentDueDateKey === k && o.figures.balance > 0 && "Payment due",
  ].filter(Boolean);
}

/**
 * The month of an event rental department: events coloured by their stage, items leaving and
 * coming back, payment deadlines. A day opens everything scheduled that day: customer, event,
 * place, items and quantities, amount, payment, person responsible.
 */
export function RentalCalendar({ departmentId, monthKey, todayKey, grid, days, orders, canBook }) {
  const [selected, setSelected] = useState(todayKey >= grid.first && todayKey <= grid.last ? todayKey : grid.first);
  const base = `/d/${departmentId}`;
  const agenda = useMemo(() => orders.map((o) => ({ ...o, roles: rolesOn(o, selected) })).filter((o) => o.roles.length || (o.dispatchDateKey < selected && selected < o.returnDateKey && !["INQUIRY", "QUOTED"].includes(o.status))), [orders, selected]);
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
          hrefOf={(m) => `${base}/calendar?month=${m}`}
          toolbar={
            <div className="flex flex-wrap items-center gap-3 text-xs text-slate-600">
              <span className="inline-flex items-center gap-1"><ArrowUpFromLine className="h-3.5 w-3.5" /> leave</span>
              <span className="inline-flex items-center gap-1"><ArrowDownToLine className="h-3.5 w-3.5" /> back</span>
              <span className="inline-flex items-center gap-1"><Wallet className="h-3.5 w-3.5" /> payment due</span>
              {canBook ? <Link href={`${base}/bookings/new?date=${selected}`}><Button size="sm"><Plus className="h-4 w-4" /> Book {formatDateKey(selected, { weekday: false })}</Button></Link> : null}
            </div>
          }
          renderDay={(d) => {
            const busy = d.events.length + d.dispatch.length + d.returns.length + d.payments.length;
            return {
              className: cn("border-slate-200 bg-white hover:border-slate-400", d.events.length && "bg-orange-50/40", d.dateKey < todayKey && "bg-slate-50"),
              label: `${formatDateKey(d.dateKey)}: ${d.events.length} event(s), ${d.dispatch.length} leaving, ${d.returns.length} coming back`,
              onClick: () => setSelected(d.dateKey),
              body: (
                <div className="mt-1 min-w-0 space-y-0.5">
                  {d.events.slice(0, 3).map((o) => (
                    <div key={o.id} className="flex items-center gap-1 truncate text-[11px]">
                      <span className={cn("h-2 w-2 shrink-0 rounded-full", DOT[o.stage.tone])} aria-hidden="true" />
                      <span className={cn("truncate", o.status === "CANCELLED" && "line-through text-slate-400")}>{o.client.name} · {o.eventType}</span>
                    </div>
                  ))}
                  {d.events.length > 3 ? <div className="text-[10px] text-slate-500">+{d.events.length - 3} more</div> : null}
                  {busy ? (
                    <div className="flex gap-2 pt-0.5 text-[10px] text-slate-500">
                      {d.dispatch.length ? <span className="inline-flex items-center gap-0.5"><ArrowUpFromLine className="h-3 w-3" />{d.dispatch.length}</span> : null}
                      {d.returns.length ? <span className="inline-flex items-center gap-0.5"><ArrowDownToLine className="h-3 w-3" />{d.returns.length}</span> : null}
                      {d.payments.length ? <span className="inline-flex items-center gap-0.5 text-rose-600"><Wallet className="h-3 w-3" />{d.payments.length}</span> : null}
                    </div>
                  ) : null}
                </div>
              ),
            };
          }}
        />
      </div>
      <aside className="space-y-3" aria-live="polite" data-testid="day-agenda">
        <h3 className="flex items-center gap-2 text-base font-semibold"><CalendarClock className="h-4 w-4" /> {formatDateKey(selected)}</h3>
        {!agenda.length ? <p className="text-sm text-slate-500">Nothing scheduled.</p> : null}
        {agenda.map((o) => (
          <Link key={o.id} href={`${base}/bookings/${o.id}`} className="block rounded-xl border border-slate-200 bg-white p-3 shadow-xs hover:border-slate-400">
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="font-semibold">{o.client.name} <span className="font-normal text-slate-500">· {o.referenceNo}</span></div>
                <div className="text-sm text-slate-600">{o.eventType}{o.eventLocation ? ` · ${o.eventLocation}` : ""}</div>
              </div>
              <StageBadge stage={o.stage} />
            </div>
            <div className="mt-1 flex flex-wrap gap-1">{(o.roles.length ? o.roles : ["Items out"]).map((r) => <span key={r} className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] font-medium text-slate-700">{r}</span>)}</div>
            <ul className="mt-2 text-xs text-slate-600">{o.lines.slice(0, 6).map((l, i) => <li key={i}>{l.quantity} × {l.label}</li>)}{o.lines.length > 6 ? <li>+{o.lines.length - 6} more</li> : null}</ul>
            <div className="mt-2 flex items-center justify-between text-sm">
              <span><Money value={o.figures.total} /> <PaymentBadge order={o} /></span>
              <span className="text-xs text-slate-500">{o.handledBy?.name}</span>
            </div>
          </Link>
        ))}
      </aside>
    </div>
  );
}
