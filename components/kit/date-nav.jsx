"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { ChevronLeft, ChevronRight, CalendarDays, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { navigateTo } from "@/lib/navigation";

function shift(key, days) {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** Business-date selector stored in the URL (?date=YYYY-MM-DD). */
export function DateNav({ dateKey, todayKey, param = "date", allowFuture = false, label = "Business date" }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();

  const go = (key) => {
    const next = new URLSearchParams(search.toString());
    if (key === todayKey) next.delete(param);
    else next.set(param, key);
    start(() => navigateTo(router, `${pathname}${next.toString() ? `?${next}` : ""}`));
  };

  return (
    <div className="flex items-center gap-1 print:hidden" aria-label={label}>
      <Button type="button" variant="outline" size="icon-sm" onClick={() => go(shift(dateKey, -1))} aria-label="Previous day">
        <ChevronLeft className="h-4 w-4" />
      </Button>
      <div className="relative">
        <CalendarDays className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
        <input
          type="date"
          value={dateKey}
          max={allowFuture ? undefined : todayKey}
          onChange={(e) => e.target.value && go(e.target.value)}
          className="h-8 rounded-md border border-slate-200 bg-white pl-8 pr-2 text-sm"
          aria-label={label}
        />
      </div>
      <Button
        type="button"
        variant="outline"
        size="icon-sm"
        onClick={() => go(shift(dateKey, 1))}
        disabled={!allowFuture && dateKey >= todayKey}
        aria-label="Next day"
      >
        <ChevronRight className="h-4 w-4" />
      </Button>
      {dateKey !== todayKey ? (
        <Button type="button" variant="ghost" size="sm" onClick={() => go(todayKey)}>
          Today
        </Button>
      ) : null}
      {pending ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" /> : null}
    </div>
  );
}
