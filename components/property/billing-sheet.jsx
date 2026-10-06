"use client";

import { useState } from "react";
import { Receipt } from "lucide-react";
import { Field, inputClass, Money, Pill } from "@/components/kit/primitives";
import { SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { billMonthSpec } from "@/lib/property/specs";
import { formatMoney } from "@/lib/format";

/**
 * The month's billing sheet: meter readings of every office (previous → current × rate), fixed
 * charges, shares of each building's bill; "Bill the month" bills what is not billed yet (twice
 * bills nothing twice).
 */
export function BillingSheet({ departmentId, sheet, canBill }) {
  const record = useRecorder();
  const [readings, setReadings] = useState({});
  const [bills, setBills] = useState({});
  const [busy, setBusy] = useState(false);
  const preview = (r) => {
    if (r.billed) return r.billed.amount;
    if (r.method === "FIXED") return r.amount;
    if (r.method === "METER") {
      const cur = readings[`${r.leaseId}:${r.kind}`];
      return cur !== undefined && cur !== "" && r.previousReading !== null ? Math.max(0, Math.round((Number(cur) - r.previousReading) * r.rate)) : null;
    }
    const total = Number(bills[`${r.unit.building.id}:${r.kind}`]) || 0;
    return total ? Math.round((total * r.rate) / 100) : null;
  };
  const toBill = sheet.rows.filter((r) => !r.billed && (preview(r) || 0) > 0);
  const total = toBill.reduce((s, r) => s + preview(r), 0);
  const submit = async () => {
    setBusy(true);
    await record(
      billMonthSpec(departmentId, {
        monthKey: sheet.monthKey,
        readings: Object.entries(readings).filter(([, v]) => v !== "").map(([k, v]) => ({ leaseId: k.split(":")[0], kind: k.split(":")[1], currentReading: v })),
        buildingBills: Object.entries(bills).filter(([, v]) => Number(v) > 0).map(([k, v]) => ({ buildingId: k.split(":")[0], kind: k.split(":")[1], amount: Number(v) })),
      }),
      { success: (r) => `${r.billed.length} charge(s) billed for ${formatMoney(r.total)}${r.skipped.length ? ` · ${r.skipped.length} already billed` : ""}.` }
    );
    setBusy(false);
    setReadings({});
  };
  return (
    <div className="space-y-4">
      {sheet.shareKinds.length ? (
        <div className="grid gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-3">
          <p className="text-sm text-slate-600 sm:col-span-3">Bills of the buildings shared between offices (each office pays its %):</p>
          {sheet.shareKinds.map((b) => <Field key={`${b.buildingId}:${b.kind}`} label={`${b.kindLabel} bill · ${b.building} (${b.shares}% shared)`} htmlFor={`bb-${b.buildingId}-${b.kind}`}><input id={`bb-${b.buildingId}-${b.kind}`} className={inputClass} inputMode="numeric" value={bills[`${b.buildingId}:${b.kind}`] || ""} onChange={(e) => setBills({ ...bills, [`${b.buildingId}:${b.kind}`]: e.target.value.replace(/\D/g, "") })} /></Field>)}
        </div>
      ) : null}
      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-sm" data-testid="billing-sheet">
          <thead className="bg-slate-50 text-left text-xs text-slate-500">
            <tr><th className="px-3 py-2 font-medium">Office</th><th className="px-3 py-2 font-medium">Tenant</th><th className="px-3 py-2 font-medium">Charge</th><th className="px-3 py-2 font-medium">How</th><th className="px-3 py-2 text-right font-medium">Previous</th><th className="px-3 py-2 text-right font-medium">Current reading</th><th className="px-3 py-2 text-right font-medium">Amount</th></tr>
          </thead>
          <tbody>
            {sheet.rows.map((r) => {
              const k = `${r.leaseId}:${r.kind}`;
              const p = preview(r);
              return (
                <tr key={k} className="border-t border-slate-100">
                  <td className="px-3 py-1.5 font-medium">{r.unit.name} <span className="text-xs text-slate-500">{r.unit.building.name}</span></td>
                  <td className="px-3 py-1.5">{r.tenant}</td>
                  <td className="px-3 py-1.5">{r.kindLabel}{r.meterNumber ? <span className="block text-[11px] text-slate-500">meter {r.meterNumber}</span> : null}</td>
                  <td className="px-3 py-1.5 text-xs text-slate-600">{r.method === "METER" ? `${r.rate} / unit` : r.method === "SHARE" ? `${r.rate}% of the bill` : "fixed"}</td>
                  <td className="px-3 py-1.5 text-right tabular-nums">{r.method === "METER" ? r.previousReading ?? "—" : ""}</td>
                  <td className="px-3 py-1.5 text-right">{r.method === "METER" && !r.billed && canBill ? <input aria-label={`Current reading: ${r.unit.name} ${r.kindLabel}`} className={`${inputClass} h-8 w-28 text-right`} inputMode="decimal" value={readings[k] || ""} onChange={(e) => setReadings({ ...readings, [k]: e.target.value })} /> : null}</td>
                  <td className="px-3 py-1.5 text-right">{r.billed ? <span className="inline-flex items-center gap-1"><Money value={r.billed.amount} suffix={false} /><Pill tone="emerald">{r.billed.referenceNo}</Pill></span> : p !== null ? <Money value={p} suffix={false} /> : <span className="text-slate-400">—</span>}</td>
                </tr>
              );
            })}
            {!sheet.rows.length ? <tr><td colSpan={7} className="px-3 py-6 text-center text-slate-500">No active contract has a charge billed apart (set them on each office).</td></tr> : null}
          </tbody>
        </table>
      </div>
      {canBill ? (
        <div className="flex flex-wrap items-center justify-end gap-3">
          <span className="text-sm text-slate-600">{toBill.length} charge(s) to bill · <strong>{formatMoney(total)}</strong></span>
          <SubmitButton busy={busy} disabled={!toBill.length} onClick={submit}><Receipt className="h-4 w-4" /> Bill the month</SubmitButton>
        </div>
      ) : null}
    </div>
  );
}
