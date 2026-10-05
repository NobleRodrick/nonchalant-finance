"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { ACTIVE_STATUSES, BOOKING_STATUS_LABELS, calendarCounts, calendarDays } from "@/lib/venue/booking-math";
import { shiftMonth } from "@/lib/venue/dates";
import { monthGrid } from "@/lib/venue/calendar";
import { priceForDate } from "@/lib/venue/pricing";
import { usePendingBookings } from "@/components/venue/use-pending-venue";
import { BookingDialog } from "@/components/venue/bookings/booking-dialog";

/** How each state of a date looks (colour + words: never colour alone). */
export const DAY_STATES = {
  AVAILABLE: { label: "Available", cell: "border-emerald-200 bg-white hover:border-emerald-400", chip: "bg-emerald-50 text-emerald-800 ring-emerald-200" },
  RESERVED: { label: "Reserved", cell: "border-amber-300 bg-amber-50/70 hover:border-amber-400", chip: "bg-amber-100 text-amber-900 ring-amber-200" },
  CONFIRMED: { label: "Confirmed", cell: "border-sky-300 bg-sky-50/70 hover:border-sky-400", chip: "bg-sky-100 text-sky-800 ring-sky-200" },
  COMPLETED: { label: "Completed", cell: "border-slate-300 bg-slate-100 hover:border-slate-400", chip: "bg-slate-200 text-slate-700 ring-slate-300" },
  PAST: { label: "Past", cell: "border-slate-100 bg-slate-50 text-slate-400", chip: "bg-slate-100 text-slate-500 ring-slate-200" },
};
const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

function Legend({ counts }) {
  return (
    <ul className="flex flex-wrap gap-2 text-xs" aria-label="Legend">
      {["AVAILABLE", "RESERVED", "CONFIRMED", "COMPLETED"].map((s) => (
        <li key={s} className={cn("inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 font-medium ring-1 ring-inset", DAY_STATES[s].chip)}>
          {DAY_STATES[s].label} <span className="tabular-nums">{counts[s]}</span>
        </li>
      ))}
      <li className="inline-flex items-center gap-1.5 rounded-full bg-white px-2 py-0.5 font-medium text-slate-600 ring-1 ring-inset ring-slate-200">
        <span className="line-through">Cancelled</span> <span className="tabular-nums">{counts.CANCELLED}</span>
      </li>
    </ul>
  );
}

/**
 * The month of the hall: each date available, reserved, confirmed, completed (cancelled bookings
 * noted), with the client and the event. A free date opens a new booking; a booked one its page.
 */
export function MonthCalendar({ departmentId, renderedAt, monthKey, todayKey, bookings, hall, packages, heads, canBook, currentUserId }) {
  const shown = usePendingBookings(departmentId, renderedAt, bookings);
  const grid = useMemo(() => monthGrid(monthKey), [monthKey]);
  const days = useMemo(() => calendarDays(grid.keys, shown, todayKey), [grid, shown, todayKey]);
  const inMonth = days.filter((d) => d.dateKey >= grid.first && d.dateKey <= grid.last);
  const counts = calendarCounts(inMonth);
  const taken = shown.filter((b) => ACTIVE_STATUSES.includes(b.status)).map((b) => b.eventDateKey);
  const [booking, setBooking] = useState(null); // date key of a new booking
  const base = `/d/${departmentId}`;
  const title = new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={`${base}/calendar?month=${shiftMonth(monthKey, -1)}`} aria-label="Previous month">
            <Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button>
          </Link>
          <h2 className="min-w-40 text-center text-lg font-semibold text-slate-900" data-testid="calendar-month">{title}</h2>
          <Link href={`${base}/calendar?month=${shiftMonth(monthKey, 1)}`} aria-label="Next month">
            <Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button>
          </Link>
          {monthKey !== todayKey.slice(0, 7) ? (
            <Link href={`${base}/calendar`}><Button variant="ghost" size="sm">This month</Button></Link>
          ) : null}
        </div>
        <div className="flex items-center gap-3">
          <Legend counts={counts} />
          {canBook ? <Button onClick={() => setBooking("")}><Plus className="h-4 w-4" /> New booking</Button> : null}
        </div>
      </div>

      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-7 gap-1.5" role="grid" aria-label={`Calendar of ${title}`}>
          {WEEK.map((w) => (
            <div key={w} role="columnheader" className="px-1 pb-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{w}</div>
          ))}
          {days.map((d) => {
            const outside = d.dateKey < grid.first || d.dateKey > grid.last;
            const style = DAY_STATES[d.state];
            const dayNo = Number(d.dateKey.slice(8));
            const b = d.booking;
            const label = b
              ? `${dayNo} ${title}: ${BOOKING_STATUS_LABELS[b.status]}, ${b.eventType} for ${b.client?.name || ""}`
              : `${dayNo} ${title}: ${style.label}`;
            const body = (
              <>
                <div className="flex items-start justify-between gap-1">
                  <span className={cn("text-sm font-semibold tabular-nums", d.isToday && "flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white")}>{dayNo}</span>
                  {d.state !== "PAST" ? <span className={cn("rounded px-1 text-[10px] font-semibold ring-1 ring-inset", style.chip)}>{style.label}</span> : null}
                </div>
                {b ? (
                  <div className="mt-1 min-w-0 text-left">
                    <div className="truncate text-xs font-medium text-slate-900">{b.client?.name}</div>
                    <div className="truncate text-[11px] text-slate-600">{b.eventType}</div>
                    {b.pending ? <div className="truncate text-[10px] font-medium text-amber-700">Not sent yet</div> : b.holdExpired ? <div className="truncate text-[10px] font-semibold text-rose-700">Hold over</div> : null}
                  </div>
                ) : d.state === "AVAILABLE" ? (
                  <div className="mt-1 text-left text-[11px] text-slate-500">{formatMoney(priceForDate(d.dateKey, { basePrice: hall.basePrice, rules: hall.rules }).price)}</div>
                ) : null}
                {d.cancelled.length ? <div className="mt-0.5 truncate text-left text-[10px] text-slate-400 line-through">{d.cancelled.length} cancelled</div> : null}
              </>
            );
            const cls = cn("flex min-h-24 flex-col rounded-lg border p-1.5 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400", style.cell, outside && "opacity-45");
            if (b && !String(b.id).startsWith("local:")) {
              return (
                <Link key={d.dateKey} role="gridcell" href={`${base}/bookings/${b.id}`} className={cls} aria-label={label} data-testid={`day-${d.dateKey}`} data-state={d.state}>
                  {body}
                </Link>
              );
            }
            if (d.state === "AVAILABLE" && canBook) {
              return (
                <button key={d.dateKey} type="button" role="gridcell" className={cls} aria-label={`${label}. Book this date`} data-testid={`day-${d.dateKey}`} data-state={d.state} onClick={() => setBooking(d.dateKey)}>
                  {body}
                </button>
              );
            }
            return (
              <div key={d.dateKey} role="gridcell" className={cls} aria-label={label} data-testid={`day-${d.dateKey}`} data-state={d.state}>
                {body}
              </div>
            );
          })}
        </div>
      </div>

      {booking !== null ? (
        <BookingDialog
          open
          onOpenChange={(v) => !v && setBooking(null)}
          departmentId={departmentId}
          hall={hall}
          packages={packages}
          heads={heads}
          takenDates={taken}
          initialDate={booking}
          currentUserId={currentUserId}
          todayKey={todayKey}
        />
      ) : null}
    </div>
  );
}
