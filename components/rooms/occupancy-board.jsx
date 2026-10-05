"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { ChevronLeft, ChevronRight, Gift, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, StatCard } from "@/components/kit/primitives";
import { addDaysToKey } from "@/lib/timezone";
import { occupancyGrid, occupancyRate } from "@/lib/rooms/stay-math";
import { cn } from "@/lib/utils";
import { StayDialog } from "./stay-dialog";

const TONE = {
  RESERVED: "bg-amber-100 text-amber-900",
  CONFIRMED: "bg-sky-100 text-sky-900",
  CHECKED_IN: "bg-emerald-100 text-emerald-900",
  CHECKED_OUT: "bg-slate-200 text-slate-700",
};

/** Rooms × nights for two weeks: who is in which room each night; free nights open a new stay. */
export function OccupancyBoard({ departmentId, rooms, stays, fromKey, todayKey, canBook }) {
  const toKey = addDaysToKey(fromKey, 13);
  const grid = useMemo(() => occupancyGrid(rooms, stays, fromKey, toKey), [rooms, stays, fromKey, toKey]);
  const tonight = useMemo(() => occupancyGrid(rooms, stays, todayKey, todayKey), [rooms, stays, todayKey]);
  const [create, setCreate] = useState(null);
  const base = `/d/${departmentId}`;
  const arrivals = stays.filter((s) => s.checkInKey === todayKey && s.status !== "CANCELLED");
  const departures = stays.filter((s) => s.checkOutKey === todayKey && s.status !== "CANCELLED");
  if (!rooms.length) return <EmptyState title="No apartment yet" description="Add the apartments and their rates first." action={<Link href={`${base}/rooms`}><Button size="sm">Add apartments</Button></Link>} />;
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Occupied tonight" value={`${tonight.filter((r) => r.nights[0].stay).length} / ${rooms.length}`} hint={`${occupancyRate(tonight)}%`} />
        <StatCard label="Occupancy (these 2 weeks)" value={`${occupancyRate(grid)}%`} />
        <StatCard label="Arrivals today" value={arrivals.length} hint={arrivals.map((s) => s.guestName).join(", ") || "—"} />
        <StatCard label="Departures today" value={departures.length} hint={departures.map((s) => s.guestName).join(", ") || "—"} />
      </div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Link href={`${base}/occupancy?from=${addDaysToKey(fromKey, -14)}`} aria-label="Two weeks earlier"><Button size="icon" variant="outline"><ChevronLeft className="h-4 w-4" /></Button></Link>
          <Link href={`${base}/occupancy?from=${addDaysToKey(fromKey, 14)}`} aria-label="Two weeks later"><Button size="icon" variant="outline"><ChevronRight className="h-4 w-4" /></Button></Link>
          {fromKey !== todayKey ? <Link href={`${base}/occupancy`}><Button size="sm" variant="ghost">From today</Button></Link> : null}
        </div>
        {canBook ? <Button onClick={() => setCreate({})}><Plus className="h-4 w-4" /> New booking</Button> : null}
      </div>
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[56rem] border-collapse text-xs" data-testid="occupancy">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-600">Apartment</th>
              {grid[0].nights.map((n) => (
                <th key={n.dateKey} className={cn("px-1 py-2 text-center font-medium text-slate-500", n.dateKey === todayKey && "text-slate-900")}>
                  {new Date(`${n.dateKey}T00:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", timeZone: "UTC" })}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {grid.map((row) => (
              <tr key={row.room.id} className="border-t border-slate-100">
                <th className="sticky left-0 z-10 bg-white px-3 py-2 text-left font-semibold text-slate-800">{row.room.name}</th>
                {row.nights.map((n) => {
                  const s = n.stay;
                  const label = s ? `${row.room.name}, night of ${n.dateKey}: ${s.guestName}${s.complimentary ? " (free with a venue package)" : ""}` : `${row.room.name}, night of ${n.dateKey}: free`;
                  return (
                    <td key={n.dateKey} className="p-0.5">
                      {s ? (
                        <Link href={`${base}/stays/${s.id}`} className={cn("flex h-9 items-center gap-1 truncate rounded px-1 font-medium hover:ring-2 hover:ring-slate-300", s.complimentary ? "bg-violet-100 text-violet-900" : TONE[s.status])} title={label} aria-label={label} data-testid={`night-${row.room.name}-${n.dateKey}`}>
                          {s.complimentary ? <Gift className="h-3 w-3 shrink-0" /> : null}
                          {s.checkInKey === n.dateKey || n.dateKey === fromKey ? <span className="truncate">{s.guestName}</span> : null}
                        </Link>
                      ) : canBook && n.dateKey >= todayKey ? (
                        <button type="button" aria-label={`${label}. Book it`} className="h-9 w-full rounded border border-dashed border-slate-200 hover:border-emerald-400 hover:bg-emerald-50" onClick={() => setCreate({ roomId: row.room.id, checkInKey: n.dateKey })} data-testid={`night-${row.room.name}-${n.dateKey}`} />
                      ) : (
                        <div className="h-9 rounded bg-slate-50" aria-label={label} data-testid={`night-${row.room.name}-${n.dateKey}`} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="flex flex-wrap gap-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-sky-100" /> Confirmed</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-amber-100" /> Reserved</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-emerald-100" /> In the room</span>
        <span className="inline-flex items-center gap-1"><span className="h-3 w-3 rounded bg-violet-100" /> Free with a venue package</span>
      </p>
      {create ? <StayDialog departmentId={departmentId} rooms={rooms} todayKey={todayKey} initial={create} onClose={() => setCreate(null)} /> : null}
    </div>
  );
}
