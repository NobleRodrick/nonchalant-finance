"use client";

import { useState } from "react";
import { AlertTriangle, ArrowDownToLine, ArrowUpFromLine, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { dispatchSpec, returnSpec } from "@/lib/rental/specs";
import { cn } from "@/lib/utils";

const out = (l) => l.issued - l.returned - l.damaged - l.broken - l.missing;
const num = (v) => Number(v) || 0;

/** The items leave: quantities pre-filled from the booking, confirmed by the manager. */
function DispatchDialog({ departmentId, order, onClose }) {
  const record = useRecorder();
  const lines = order.lines.filter((l) => l.kind === "ITEM");
  const [q, setQ] = useState(() => Object.fromEntries(lines.map((l) => [l.id, String(l.quantity)])));
  const [f, setF] = useState({ counterpart: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const less = lines.filter((l) => num(q[l.id]) < l.quantity);
  const submit = async () => {
    setBusy(true);
    const res = await record(dispatchSpec(departmentId, order, { lines: lines.map((l) => ({ lineId: l.id, quantity: num(q[l.id]) })), counterpart: f.counterpart.trim(), notes: f.notes.trim() }), { success: (r) => `${r.referenceNo}: ${r.issued} item(s) out.` });
    setBusy(false);
    if (res) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={`Items leaving for ${order.referenceNo}`} description="Count what is loaded. Fewer than booked may leave; never more." footer={<SubmitButton busy={busy} disabled={!lines.some((l) => num(q[l.id]) > 0)} onClick={submit}><ArrowUpFromLine className="h-4 w-4" /> Confirm: the items leave</SubmitButton>}>
      <table className="w-full text-sm">
        <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Item</th><th className="text-right">Booked</th><th className="px-2">Leaving</th></tr></thead>
        <tbody>
          {lines.map((l) => (
            <tr key={l.id} className="border-b border-slate-100">
              <td className="py-2 font-medium">{l.label}</td>
              <td className="text-right tabular-nums">{l.quantity}</td>
              <td className="px-2 py-1.5"><input aria-label={`Leaving: ${l.label}`} className={cn(inputClass, "w-24", num(q[l.id]) > l.quantity && "border-rose-400")} inputMode="numeric" value={q[l.id]} onChange={(e) => setQ({ ...q, [l.id]: wholeNumber(e.target.value) })} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      {less.length ? <p className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> Fewer than booked: {less.map((l) => `${l.label} (${l.quantity - num(q[l.id])} less)`).join(", ")}.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Taken by" htmlFor="ds-who"><input id="ds-who" className={inputClass} value={f.counterpart} onChange={(e) => setF({ ...f, counterpart: e.target.value })} placeholder="Driver, customer…" /></Field>
        <Field label="Notes" htmlFor="ds-notes"><input id="ds-notes" className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </FormDialog>
  );
}

/**
 * Items coming back: per line, back in good condition, damaged (can be repaired), broken, missing.
 * The difference with what left is shown at once ("5 chairs short").
 */
function ReturnDialog({ departmentId, order, onClose }) {
  const record = useRecorder();
  const lines = order.lines.filter((l) => l.kind === "ITEM" && out(l) > 0);
  const [q, setQ] = useState(() => Object.fromEntries(lines.map((l) => [l.id, { good: String(out(l)), damaged: "", broken: "", missing: "", reason: "" }])));
  const [f, setF] = useState({ counterpart: "", notes: "" });
  const [busy, setBusy] = useState(false);
  const set = (id, k, v) => setQ({ ...q, [id]: { ...q[id], [k]: v } });
  const counted = (id) => num(q[id].good) + num(q[id].damaged) + num(q[id].broken) + num(q[id].missing);
  const over = lines.filter((l) => counted(l.id) > out(l));
  const diffs = lines.filter((l) => num(q[l.id].good) < out(l));
  const submit = async () => {
    setBusy(true);
    const res = await record(
      returnSpec(departmentId, order, { lines: lines.map((l) => ({ lineId: l.id, good: num(q[l.id].good), damaged: num(q[l.id].damaged), broken: num(q[l.id].broken), missing: num(q[l.id].missing), reason: q[l.id].reason.trim() })), counterpart: f.counterpart.trim(), notes: f.notes.trim() }),
      { success: (r) => (r.differences.length ? `${r.referenceNo}: ${r.differences.length} difference(s) to settle.` : `${r.referenceNo}: everything is back.`) }
    );
    setBusy(false);
    if (res) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={`Items back from ${order.referenceNo}`} description="Count each item: back in good condition, damaged, broken or missing. Anything not counted is still out." footer={<SubmitButton busy={busy} disabled={over.length > 0 || !lines.some((l) => counted(l.id) > 0)} onClick={submit}><ArrowDownToLine className="h-4 w-4" /> Record the return</SubmitButton>}>
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2">Item</th><th className="text-right">Out</th><th className="px-1">Back good</th><th className="px-1">Damaged</th><th className="px-1">Broken</th><th className="px-1">Missing</th><th className="px-1">What happened</th></tr></thead>
          <tbody>
            {lines.map((l) => {
              const short = out(l) - num(q[l.id].good);
              return (
                <tr key={l.id} className="border-b border-slate-100 align-top">
                  <td className="py-2 font-medium">{l.label}{short > 0 ? <div className={cn("text-xs font-semibold", counted(l.id) > out(l) ? "text-rose-700" : "text-amber-700")} data-testid={`short-${l.label}`}>{short} short</div> : null}</td>
                  <td className="pt-2 text-right tabular-nums">{out(l)}</td>
                  {["good", "damaged", "broken", "missing"].map((k) => (
                    <td key={k} className="px-1 py-1.5"><input aria-label={`${k === "good" ? "Back good" : k[0].toUpperCase() + k.slice(1)}: ${l.label}`} className={cn(inputClass, "w-20", counted(l.id) > out(l) && "border-rose-400")} inputMode="numeric" value={q[l.id][k]} onChange={(e) => set(l.id, k, wholeNumber(e.target.value))} /></td>
                  ))}
                  <td className="px-1 py-1.5"><input aria-label={`What happened: ${l.label}`} className={cn(inputClass, "w-40")} value={q[l.id].reason} onChange={(e) => set(l.id, "reason", e.target.value)} disabled={short <= 0} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {over.length ? <p className="text-xs font-medium text-rose-700">More counted than went out for {over.map((l) => l.label).join(", ")}.</p> : diffs.length ? <p className="flex items-center gap-1 text-xs text-amber-800"><AlertTriangle className="h-3.5 w-3.5" /> Differences are recorded as damage / loss to settle; anything not counted stays out.</p> : <p className="flex items-center gap-1 text-xs text-emerald-700"><CheckCircle2 className="h-3.5 w-3.5" /> Everything back in good condition.</p>}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Brought back by" htmlFor="rt-who"><input id="rt-who" className={inputClass} value={f.counterpart} onChange={(e) => setF({ ...f, counterpart: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="rt-notes"><input id="rt-notes" className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </FormDialog>
  );
}

/** "Dispatch the items" / "Record a return" for a booking at the right stage. */
export function CheckButtons({ departmentId, order, canBook }) {
  const [open, setOpen] = useState(null);
  if (!canBook) return null;
  const canDispatch = ["CONFIRMED", "PREPARING"].includes(order.status) && order.lines.some((l) => l.kind === "ITEM");
  const canReturn = order.status === "DISPATCHED";
  if (!canDispatch && !canReturn) return null;
  return (
    <>
      {canDispatch ? <Button onClick={() => setOpen("dispatch")}><ArrowUpFromLine className="h-4 w-4" /> Dispatch the items</Button> : null}
      {canReturn ? <Button onClick={() => setOpen("return")}><ArrowDownToLine className="h-4 w-4" /> Record a return</Button> : null}
      {open === "dispatch" ? <DispatchDialog departmentId={departmentId} order={order} onClose={() => setOpen(null)} /> : null}
      {open === "return" ? <ReturnDialog departmentId={departmentId} order={order} onClose={() => setOpen(null)} /> : null}
    </>
  );
}
