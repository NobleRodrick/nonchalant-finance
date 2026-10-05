"use client";

import { useState } from "react";
import { Field, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { formatMoney } from "@/lib/format";

/** Settles a difference found after an event: charge the client, record a loss, or resolved. */
export function SettleDialog({ departmentId, incident, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ outcome: "CHARGE", cost: String(incident.cost), responsibility: "CLIENT", note: "" });
  const [busy, setBusy] = useState(false);
  const label = `${incident.quantity} × ${incident.asset.name} ${incident.kind === "MISSING" ? "missing" : "damaged"}`;
  const valid = f.outcome !== "CHARGE" || Number(f.cost) > 0;
  const submit = async () => {
    setBusy(true);
    const out = await record(
      { kind: "venue.incident.settle", label: "Asset difference settled", departmentId, input: { departmentId, incidentId: incident.id, outcome: f.outcome, cost: f.cost === "" ? undefined : Number(f.cost), responsibility: f.responsibility, note: f.note }, meta: { summary: `${label} · ${f.outcome}` } },
      { success: f.outcome === "CHARGE" ? `${formatMoney(f.cost)} charged to the client.` : "Difference settled." }
    );
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={label} description={`Estimated cost: ${formatMoney(incident.cost)} (units × replacement value).`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Settle</SubmitButton>}>
      <Field label="What happens" htmlFor="si-outcome">
        <select id="si-outcome" className={selectClass} value={f.outcome} onChange={(e) => setF({ ...f, outcome: e.target.value, responsibility: e.target.value === "CHARGE" ? "CLIENT" : f.responsibility })}>
          <option value="CHARGE">Charge it to the client (added to the booking)</option>
          <option value="LOSS">The hall bears the loss</option>
          <option value="RESOLVED">Resolved at no cost (repaired, found)</option>
        </select>
      </Field>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={f.outcome === "CHARGE" ? "Amount charged (FCFA)" : "Cost (FCFA)"} htmlFor="si-cost">
          <input id="si-cost" className={inputClass} inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: wholeNumber(e.target.value) })} />
        </Field>
        <Field label="Responsible" htmlFor="si-resp">
          <select id="si-resp" className={selectClass} value={f.responsibility} onChange={(e) => setF({ ...f, responsibility: e.target.value })}>
            <option value="CLIENT">The client</option>
            <option value="STAFF">Our staff</option>
            <option value="UNKNOWN">Unknown</option>
          </select>
        </Field>
      </div>
      <Field label="Note" htmlFor="si-note"><input id="si-note" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </FormDialog>
  );
}
