"use client";

import { useMemo } from "react";
import { ArrowLeftRight, BookUser, Boxes, HandCoins } from "lucide-react";
import { Money, Plates, StatCard } from "@/components/kit/primitives";
import { countOf } from "@/lib/format";
import { usePendingEffects } from "@/lib/offline/react";
import { overlayReport } from "@/lib/offline/overlay";

function useLiveFigures({ departmentId, renderedAt, dateKey, figures }) {
  const effects = usePendingEffects(departmentId, renderedAt);
  return useMemo(() => overlayReport({ ...figures, records: [] }, effects, { dateKey }), [figures, effects, dateKey]);
}

/** Today's six key figures of a department (server figures + records not sent yet). */
export function DepartmentStats({ departmentId, renderedAt, dateKey, figures, links }) {
  const r = useLiveFigures({ departmentId, renderedAt, dateKey, figures });
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
      <StatCard label="Money in" value={<Money value={r.money.moneyIn} />} tone="in" href={links.money} icon={ArrowLeftRight} />
      <StatCard label="Money out" value={<Money value={r.money.moneyOut} />} tone="out" href={links.money} />
      <StatCard label="Result" value={<Money value={r.money.result} />} tone="dark" />
      <StatCard label="Stock value" value={<Money value={r.stock.totals.value} />} hint={<><Plates value={r.stock.totals.closing} /> plates</>} href={links.stock} icon={Boxes} />
      <StatCard label="Cash in the drawer" value={<Money value={r.cash.shouldRemain} />} hint={r.cash.handedOver ? <>Handed to Boss <Money value={r.cash.handedOver} /></> : "Nothing handed over yet"} href={links.cash} icon={HandCoins} />
      <StatCard label="Owed by customers" value={<Money value={r.debts.closing} />} hint={r.debts.given ? <>+<Money value={r.debts.given} /> today</> : null} href={links.debts} icon={BookUser} />
    </div>
  );
}

/** Plates and money of today's sales per dish. */
export function SalesByDish({ departmentId, renderedAt, dateKey, figures }) {
  const r = useLiveFigures({ departmentId, renderedAt, dateKey, figures });
  if (!r.sales.byDish.length) return <p className="text-sm text-slate-500">No sales yet today.</p>;
  return (
    <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
      {r.sales.byDish.map((d) => (
        <div key={d.dishId} className="flex items-center justify-between rounded-lg border border-slate-100 px-3 py-2 text-sm">
          <span>{d.name}</span>
          <span className="text-slate-500">{countOf(d.plates, "plate")} · <Money value={d.gross} className="text-slate-900" /></span>
        </div>
      ))}
    </div>
  );
}
