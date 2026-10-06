"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, X } from "lucide-react";
import { inputClass, selectClass } from "@/components/kit/primitives";
import { cn } from "@/lib/utils";

/**
 * Filters of a list kept in the page address (?q=…&status=…), so a filtered list can be shared,
 * printed and reloaded. fields: [{ name, label, type: "search" | "select" | "date" | "month" | "number", options:
 * [{ value, label }], placeholder }]. Text is applied after a short pause; selects at once.
 */
export function FilterBar({ fields, className }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [values, setValues] = useState(() => Object.fromEntries(fields.map((f) => [f.name, params.get(f.name) || ""])));
  const timer = useRef(null);

  const apply = (next) => {
    const q = new URLSearchParams(params.toString());
    for (const f of fields) {
      if (next[f.name]) q.set(f.name, next[f.name]);
      else q.delete(f.name);
    }
    q.delete("page");
    const s = q.toString();
    router.replace(s ? `${pathname}?${s}` : pathname, { scroll: false });
  };

  const set = (name, value, { now = true } = {}) => {
    const next = { ...values, [name]: value };
    setValues(next);
    clearTimeout(timer.current);
    if (now) apply(next);
    else timer.current = setTimeout(() => apply(next), 350);
  };

  useEffect(() => () => clearTimeout(timer.current), []);
  const active = fields.some((f) => values[f.name]);

  return (
    <div className={cn("flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end print:hidden", className)} role="search">
      {fields.map((f) => (
        <label key={f.name} className={cn("flex flex-col gap-1 text-xs font-medium text-slate-600", f.type === "search" ? "sm:min-w-64 sm:flex-1" : "sm:w-48")}>
          {f.label}
          {f.type === "select" ? (
            <select aria-label={f.label} className={selectClass} value={values[f.name]} onChange={(e) => set(f.name, e.target.value)}>
              {(f.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          ) : f.type === "date" || f.type === "month" || f.type === "number" ? (
            <input type={f.type} aria-label={f.label} className={inputClass} placeholder={f.placeholder} value={values[f.name]} onChange={(e) => set(f.name, e.target.value, { now: f.type !== "number" })} />
          ) : (
            <span className="relative">
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
              <input type="search" aria-label={f.label} className={cn(inputClass, "pl-9")} placeholder={f.placeholder} value={values[f.name]} onChange={(e) => set(f.name, e.target.value, { now: false })} />
            </span>
          )}
        </label>
      ))}
      {active ? (
        <button type="button" className="inline-flex h-10 items-center gap-1 rounded-md px-2 text-sm text-slate-600 hover:bg-slate-100" onClick={() => { const empty = Object.fromEntries(fields.map((f) => [f.name, ""])); setValues(empty); apply(empty); }}>
          <X className="h-4 w-4" /> Clear
        </button>
      ) : null}
    </div>
  );
}
