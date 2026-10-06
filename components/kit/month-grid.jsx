"use client";

import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const WEEK = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

const shift = (monthKey, delta) => {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
};

/**
 * A month as whole weeks (Monday to Sunday) with links to the months before and after. Each day
 * is drawn by `renderDay(day)` → { body, className, label, onClick } (a button when it has
 * onClick). `days`: [{ dateKey, … }] of the grid; `first` / `last`: the month's own days; `hrefOf`
 * (monthKey) → the page of another month. Shared by the calendars of the department types.
 */
export function MonthGrid({ monthKey, todayKey, days, first, last, hrefOf, renderDay, toolbar, selectedKey }) {
  const title = new Date(`${monthKey}-01T00:00:00Z`).toLocaleDateString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={hrefOf(shift(monthKey, -1))} aria-label="Previous month"><Button variant="outline" size="icon"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <h2 className="min-w-40 text-center text-lg font-semibold text-slate-900" data-testid="calendar-month">{title}</h2>
          <Link href={hrefOf(shift(monthKey, 1))} aria-label="Next month"><Button variant="outline" size="icon"><ChevronRight className="h-4 w-4" /></Button></Link>
          {monthKey !== todayKey.slice(0, 7) ? <Link href={hrefOf(todayKey.slice(0, 7))}><Button variant="ghost" size="sm">This month</Button></Link> : null}
        </div>
        {toolbar}
      </div>
      <div className="overflow-x-auto">
        <div className="grid min-w-[44rem] grid-cols-7 gap-1.5" role="grid" aria-label={`Calendar of ${title}`}>
          {WEEK.map((w) => <div key={w} role="columnheader" className="px-1 pb-1 text-center text-xs font-semibold uppercase tracking-wide text-slate-500">{w}</div>)}
          {days.map((day) => {
            const outside = day.dateKey < first || day.dateKey > last;
            const { body, className, label, onClick } = renderDay(day);
            const dayNo = Number(day.dateKey.slice(8));
            const cls = cn(
              "flex min-h-24 flex-col rounded-lg border p-1.5 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400",
              className,
              outside && "opacity-45",
              selectedKey === day.dateKey && "ring-2 ring-slate-900"
            );
            const content = (
              <>
                <span className={cn("text-sm font-semibold tabular-nums", day.dateKey === todayKey && "flex h-6 w-6 items-center justify-center rounded-full bg-slate-900 text-white")}>{dayNo}</span>
                {body}
              </>
            );
            return onClick ? (
              <button key={day.dateKey} type="button" role="gridcell" className={cls} aria-label={label || `${dayNo} ${title}`} aria-selected={selectedKey === day.dateKey} data-testid={`day-${day.dateKey}`} onClick={() => onClick(day)}>{content}</button>
            ) : (
              <div key={day.dateKey} role="gridcell" className={cls} aria-label={label || `${dayNo} ${title}`} data-testid={`day-${day.dateKey}`}>{content}</div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
