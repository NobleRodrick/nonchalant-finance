"use client";

import { useState } from "react";
import { Field, inputClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

/**
 * Today's cash count of a department (event venue: venue.cash.count; guest house: rooms.cash.count): the cash really in the drawer against what it should hold. A difference
 * needs an explanation; it becomes a discrepancy the Boss is told about. Counting again today
 * replaces the count. `expected` is as the page was rendered; the server recomputes it.
 */
export function CashCountForm({ departmentId, expected, todayKey, lastCount, kind = "venue.cash.count" }) {
  const record = useRecorder();
  const [counted, setCounted] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const diff = counted === "" ? null : Number(counted) - expected;
  const valid = counted !== "" && (diff === 0 || notes.trim().length > 2);
  const submit = async () => {
    setBusy(true);
    const out = await record(
      { kind, label: "Cash count", departmentId, input: { departmentId, countedCash: Number(counted), notes }, meta: { summary: `Counted ${formatMoney(counted)}`, dateKey: todayKey } },
      { success: diff ? `Cash count recorded: ${formatMoney(Math.abs(diff))} ${diff < 0 ? "short" : "over"}. The Boss is informed.` : "Cash count recorded: the drawer is right." }
    );
    setBusy(false);
    if (out) { setCounted(""); setNotes(""); }
  };
  return (
    <div className="mt-5 rounded-lg border border-slate-200 bg-slate-50/60 p-4 print:hidden" data-testid="cash-count">
      <h3 className="text-sm font-semibold text-slate-900">Count the cash now</h3>
      <p className="mt-0.5 text-xs text-slate-500">
        The drawer should hold <strong>{formatMoney(expected)}</strong> in cash.
        {lastCount ? ` Counted today: ${formatMoney(lastCount.countedCash)}; counting again replaces it.` : ""}
      </p>
      <div className="mt-3 grid gap-3 sm:grid-cols-[12rem_1fr_auto] sm:items-end">
        <Field label="Cash counted (FCFA)" htmlFor="cc-counted">
          <input id="cc-counted" className={inputClass} inputMode="numeric" value={counted} onChange={(e) => setCounted(wholeNumber(e.target.value))} />
        </Field>
        <Field label={diff ? "Why is it different? (required)" : "Note"} htmlFor="cc-notes">
          <input id="cc-notes" className={inputClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder={diff ? "e.g. change given from the drawer, being checked" : ""} />
        </Field>
        <SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record count</SubmitButton>
      </div>
      {diff !== null ? (
        <p className={cn("mt-2 text-sm font-medium", diff === 0 ? "text-emerald-700" : "text-rose-700")}>
          {diff === 0 ? "Matches what the drawer should hold." : `${formatMoney(Math.abs(diff))} ${diff < 0 ? "short" : "over"}.`}
        </p>
      ) : null}
    </div>
  );
}
