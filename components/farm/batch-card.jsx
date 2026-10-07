import Link from "next/link";
import { Pill } from "@/components/kit/primitives";
import { formatMoney } from "@/lib/format";

/** One batch as a card: kind, age, alive and deaths, cost, sales, profit. */
export function BatchCard({ base, b }) {
  const f = b.figures;
  return (
    <Link href={`${base}/batches/${b.id}`} className="block rounded-xl border border-slate-200 bg-white p-4 shadow-xs transition hover:-translate-y-0.5 hover:shadow-md" data-testid="batch-card">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate font-semibold text-slate-900">{b.name}</div>
          <div className="text-xs text-slate-500">{b.referenceNo} · {b.kindLabel.split(" (")[0]}{b.location ? ` · ${b.location}` : ""} · day {b.age}</div>
        </div>
        {b.status === "ACTIVE" ? <Pill tone="emerald">active</Pill> : <Pill>closed</Pill>}
      </div>
      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        {f.live ? (
          <>
            <div><dt className="text-xs text-slate-500">Alive</dt><dd className="font-semibold tabular-nums">{f.alive} <span className="text-xs font-normal">{b.unit}</span></dd></div>
            <div><dt className="text-xs text-slate-500">Deaths</dt><dd className={`tabular-nums ${f.mortalityPct >= 5 ? "font-semibold text-rose-700" : ""}`}>{f.dead} ({f.mortalityPct ?? 0} %)</dd></div>
          </>
        ) : (
          <>
            <div><dt className="text-xs text-slate-500">Area</dt><dd className="font-semibold tabular-nums">{b.initialCount} {b.unit}</dd></div>
            <div><dt className="text-xs text-slate-500">Harvested</dt><dd className="tabular-nums">{Object.entries(f.produce).map(([u, q]) => `${q} ${u}`).join(", ") || "—"}</dd></div>
          </>
        )}
        <div><dt className="text-xs text-slate-500">Cost</dt><dd className="tabular-nums">{formatMoney(f.cost)}</dd></div>
        <div><dt className="text-xs text-slate-500">Sales</dt><dd className="tabular-nums">{formatMoney(f.sales)}</dd></div>
        <div><dt className="text-xs text-slate-500">Profit</dt><dd className={`font-semibold tabular-nums ${f.profit < 0 ? "text-rose-700" : "text-emerald-700"}`}>{formatMoney(f.profit)}</dd></div>
        {f.live ? <div><dt className="text-xs text-slate-500">Cost a head</dt><dd className="tabular-nums">{f.costPerHead !== null ? formatMoney(f.costPerHead) : "—"}</dd></div> : null}
      </dl>
    </Link>
  );
}
