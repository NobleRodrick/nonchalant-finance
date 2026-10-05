"use client";

import { Check } from "lucide-react";
import { DomainIcon } from "@/components/domains/domain-icon";
import { DOMAIN_LIST } from "@/lib/domains/registry";
import { cn } from "@/lib/utils";

/** Department type chooser: one card per type, "coming soon" for types not built yet. */
export function DepartmentTypePicker({ value, onChange, disabled = false, compact = false }) {
  return (
    <div className={cn("grid gap-2", compact ? "grid-cols-2 sm:grid-cols-4" : "grid-cols-1 sm:grid-cols-2")} role="radiogroup" aria-label="Department type">
      {DOMAIN_LIST.map((d) => {
        const selected = value === d.key;
        return (
          <button
            key={d.key}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={d.label}
            disabled={disabled && !selected}
            onClick={() => onChange(d.key)}
            className={cn(
              "relative flex items-start gap-3 rounded-lg border p-3 text-left transition",
              selected ? "border-slate-900 ring-2 ring-slate-900/10" : "border-slate-200 hover:border-slate-400",
              disabled && !selected && "cursor-not-allowed opacity-50"
            )}
          >
            <DomainIcon domain={d.key} className={cn("mt-0.5 h-5 w-5 shrink-0", selected ? "text-slate-900" : "text-slate-400")} />
            <span className="min-w-0">
              <span className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                {d.label}
                {!d.enabled ? <span className="rounded bg-violet-100 px-1.5 py-0.5 text-[10px] font-medium text-violet-800">Coming soon</span> : null}
              </span>
              {!compact ? <span className="mt-0.5 block text-xs text-slate-500">{d.description}</span> : null}
            </span>
            {selected ? <Check className="absolute right-2 top-2 h-4 w-4 text-slate-900" /> : null}
          </button>
        );
      })}
    </div>
  );
}
