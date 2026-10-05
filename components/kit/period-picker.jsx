"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import { Field, inputClass } from "@/components/kit/primitives";
import { PERIOD_PRESETS } from "@/lib/reports/periods";
import { navigateTo } from "@/lib/navigation";
import { cn } from "@/lib/utils";

/**
 * The report period in the URL (?period=, and ?from=&to= when custom): lib/reports/periods
 * resolves it on the server. Other search parameters are kept.
 */
export function PeriodPicker({ range, presets = PERIOD_PRESETS }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [pending, start] = useTransition();
  const [custom, setCustom] = useState({ from: range.fromKey, to: range.toKey });
  const go = (patch) => {
    const p = new URLSearchParams(search.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    start(() => navigateTo(router, `${pathname}${p.toString() ? `?${p}` : ""}`));
  };
  const applyCustom = () => custom.from && custom.to && go({ period: "custom", from: custom.from, to: custom.to });
  return (
    <div className="space-y-3 print:hidden">
      <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Period">
        {presets.map((p) => (
          <button
            key={p.key}
            type="button"
            aria-pressed={range.preset === p.key}
            onClick={() => (p.key === "custom" ? applyCustom() : go({ period: p.key, from: null, to: null }))}
            className={cn("rounded-full border px-3 py-1 text-sm", range.preset === p.key ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50")}
          >
            {p.label}
          </button>
        ))}
        {pending ? <Loader2 className="h-4 w-4 animate-spin text-slate-500" aria-label="Loading" /> : null}
      </div>
      {range.preset === "custom" ? (
        <div className="grid max-w-md grid-cols-2 gap-3">
          <Field label="From" htmlFor="pp-from"><input id="pp-from" type="date" className={inputClass} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} onBlur={applyCustom} /></Field>
          <Field label="To" htmlFor="pp-to"><input id="pp-to" type="date" className={inputClass} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} onBlur={applyCustom} /></Field>
        </div>
      ) : null}
    </div>
  );
}
