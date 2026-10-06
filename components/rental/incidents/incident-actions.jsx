"use client";

import { useState } from "react";
import { Plus, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { useRecorder } from "@/lib/offline/react";
import { chargeAddSpec, chargeVoidSpec, incidentReportSpec, incidentSettleSpec, repairCompleteSpec } from "@/lib/rental/specs";
import { CHARGE_KINDS } from "@/lib/rental/booking-math";
import { INCIDENT_KIND_LABELS } from "@/lib/rental/stock-math";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank transfer"], ["OTHER", "Other"]];

/** Decide what happens to damaged, broken or missing items. */
function SettleDialog({ departmentId, incident, onClose }) {
  const record = useRecorder();
  const replacement = incident.quantity * (incident.item.replacementValue || incident.item.purchasePrice);
  const choices = [
    incident.orderId ? ["charge", "Charge the customer", `Added to ${incident.order?.client?.name || "the customer"}'s balance.`] : null,
    ["loss", "Record a loss", "The business bears it; the items leave the stock."],
    incident.kind !== "MISSING" ? ["repair", "Send to repair", "They come back to the store when repaired."] : null,
    incident.kind === "MISSING" ? ["found", "They were found", "Back in the store."] : null,
  ].filter(Boolean);
  const [f, setF] = useState({ decision: choices[0][0], amount: String(replacement || ""), stock: incident.kind === "DAMAGED" ? "repair" : "write_off", repairBy: "", repairCost: "", note: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const input = { decision: f.decision, note: f.note.trim(), ...(f.decision === "charge" ? { amount: Number(f.amount), stock: f.stock } : {}), ...(f.decision === "repair" || (f.decision === "charge" && f.stock === "repair") ? { repairBy: f.repairBy.trim(), repairCost: f.repairCost } : {}) };
    const out = await record(incidentSettleSpec(departmentId, incident, input), { success: (r) => (r.chargeReference ? `${incident.referenceNo}: ${formatMoney(Number(f.amount))} charged (${r.chargeReference}).` : `${incident.referenceNo} settled.`) });
    setBusy(false);
    if (out) onClose();
  };
  const repairing = f.decision === "repair" || (f.decision === "charge" && f.stock === "repair");
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`${incident.quantity} × ${incident.item.name} ${INCIDENT_KIND_LABELS[incident.kind].toLowerCase()}`} description={`${incident.referenceNo}${incident.order ? ` · ${incident.order.referenceNo}` : ""}${incident.reason ? ` · ${incident.reason}` : ""}. Replacement value: ${formatMoney(replacement)}.`} footer={<SubmitButton busy={busy} disabled={f.decision === "charge" && !(Number(f.amount) > 0)} onClick={submit}>Save the decision</SubmitButton>}>
      <div className="space-y-2" role="radiogroup" aria-label="Decision">
        {choices.map(([k, label, hint]) => (
          <label key={k} className={cn("flex cursor-pointer gap-3 rounded-lg border p-3", f.decision === k ? "border-slate-900 bg-slate-50" : "border-slate-200")}>
            <input type="radio" name="decision" checked={f.decision === k} onChange={() => setF({ ...f, decision: k })} />
            <span><span className="block text-sm font-medium">{label}</span><span className="block text-xs text-slate-500">{hint}</span></span>
          </label>
        ))}
      </div>
      {f.decision === "charge" ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount charged (FCFA)" required htmlFor="st-amt"><input id="st-amt" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
          {incident.kind === "DAMAGED" ? (
            <Field label="The items" htmlFor="st-stock">
              <select id="st-stock" className={selectClass} value={f.stock} onChange={(e) => setF({ ...f, stock: e.target.value })}>
                <option value="repair">go to repair</option>
                <option value="write_off">are thrown away</option>
              </select>
            </Field>
          ) : null}
        </div>
      ) : null}
      {repairing ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Repaired by" htmlFor="st-by"><input id="st-by" className={inputClass} value={f.repairBy} onChange={(e) => setF({ ...f, repairBy: e.target.value })} /></Field>
          {f.decision === "repair" ? <Field label="Estimated cost" htmlFor="st-est"><input id="st-est" className={inputClass} inputMode="numeric" value={f.repairCost} onChange={(e) => setF({ ...f, repairCost: wholeNumber(e.target.value) })} /></Field> : null}
        </div>
      ) : null}
      <Field label="Note" htmlFor="st-note"><input id="st-note" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
    </FormDialog>
  );
}

/** Items back from repair: the cost, who repaired them, paid from the drawer or not. */
function RepairDialog({ departmentId, incident, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ cost: incident.repairCost ? String(incident.repairCost) : "", paidFromDrawer: true, counterparty: incident.repairBy || "", paymentMethod: "CASH", note: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(repairCompleteSpec(departmentId, incident, { cost: f.cost, paidFromDrawer: f.paidFromDrawer, counterparty: f.counterparty.trim(), paymentMethod: f.paymentMethod, note: f.note.trim() }, files), { success: `${incident.quantity} × ${incident.item.name} back in the store.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`${incident.quantity} × ${incident.item.name} repaired`} description="They go back to the store. A cost paid from the drawer is recorded as a repair expense of the event." footer={<SubmitButton busy={busy} disabled={f.paidFromDrawer && Number(f.cost) > 0 && !f.counterparty.trim()} onClick={submit}><Wrench className="h-4 w-4" /> Back in the store</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Repair cost (FCFA)" htmlFor="rp-cost"><input id="rp-cost" className={inputClass} inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: wholeNumber(e.target.value) })} /></Field>
        <Field label="Repaired by" htmlFor="rp-by"><input id="rp-by" className={inputClass} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.paidFromDrawer} onChange={(e) => setF({ ...f, paidFromDrawer: e.target.checked })} /> Paid now from the drawer</label>
      {f.paidFromDrawer ? (
        <Field label="Paid by" htmlFor="rp-m"><select id="rp-m" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      ) : null}
      <ProofUpload value={files} onChange={setFiles} label="Attach the invoice (photo or PDF)" />
    </FormDialog>
  );
}

/** The buttons of a damage / loss record. */
export function IncidentButtons({ departmentId, incident, canBook }) {
  const [open, setOpen] = useState(null);
  if (!canBook) return null;
  const repairable = incident.stockAction === "REPAIR" && !incident.repairedAt;
  return (
    <span className="inline-flex gap-1">
      {incident.status === "OPEN" ? <Button size="sm" onClick={() => setOpen("settle")} aria-label={`Settle ${incident.referenceNo}`}>Settle</Button> : null}
      {repairable ? <Button size="sm" variant="outline" onClick={() => setOpen("repair")} aria-label={`Repair of ${incident.referenceNo} done`}><Wrench className="h-3.5 w-3.5" /> Repaired</Button> : null}
      {open === "settle" ? <SettleDialog departmentId={departmentId} incident={incident} onClose={() => setOpen(null)} /> : null}
      {open === "repair" ? <RepairDialog departmentId={departmentId} incident={incident} onClose={() => setOpen(null)} /> : null}
    </span>
  );
}

/** Damage or loss found outside an event (from an item's page). */
export function ReportIncidentButton({ departmentId, item }) {
  const record = useRecorder();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "DAMAGED", quantity: "1", reason: "", responsibleName: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(incidentReportSpec(departmentId, item, { kind: f.kind, quantity: Number(f.quantity), reason: f.reason.trim(), responsibleName: f.responsibleName.trim() }, files), { success: `${f.quantity} × ${item.name}: ${INCIDENT_KIND_LABELS[f.kind].toLowerCase()} recorded.` });
    setBusy(false);
    if (out) setOpen(false);
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Report damage or loss</Button>
      {open ? (
        <FormDialog open onOpenChange={setOpen} title={`Damage or loss: ${item.name}`} description={`${item.inStock} in the store.`} footer={<SubmitButton busy={busy} disabled={!(Number(f.quantity) > 0) || !f.reason.trim()} onClick={submit}>Record</SubmitButton>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="What" htmlFor="ri-kind"><select id="ri-kind" className={selectClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(INCIDENT_KIND_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="How many" htmlFor="ri-q"><input id="ri-q" className={inputClass} inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: wholeNumber(e.target.value) })} /></Field>
            <Field label="What happened" required htmlFor="ri-r" className="sm:col-span-2"><input id="ri-r" className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="e.g. dropped while loading" /></Field>
            <Field label="Person responsible" htmlFor="ri-p"><input id="ri-p" className={inputClass} value={f.responsibleName} onChange={(e) => setF({ ...f, responsibleName: e.target.value })} /></Field>
          </div>
          <ProofUpload value={files} onChange={setFiles} label="Attach photos" />
        </FormDialog>
      ) : null}
    </>
  );
}

/** "Add a charge" to a booking: extra days, transport, labour, other. */
export function AddChargeButton({ departmentId, order }) {
  const record = useRecorder();
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ kind: "EXTRA_DAYS", label: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(chargeAddSpec(departmentId, order, { kind: f.kind, label: f.label.trim(), amount: Number(f.amount) }), { success: (r) => `${r.referenceNo} added to ${order.referenceNo}.` });
    setBusy(false);
    if (out) setOpen(false);
  };
  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)}><Plus className="h-3.5 w-3.5" /> Add a charge</Button>
      {open ? (
        <FormDialog open onOpenChange={setOpen} title={`Charge on ${order.referenceNo}`} description="Added to what the customer owes." footer={<SubmitButton busy={busy} disabled={!(Number(f.amount) > 0)} onClick={submit}>Add</SubmitButton>}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="For" htmlFor="ch-k"><select id="ch-k" className={selectClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>{Object.entries(CHARGE_KINDS).filter(([k]) => k !== "DAMAGE").map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Amount (FCFA)" required htmlFor="ch-a"><input id="ch-a" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
            <Field label="Description" htmlFor="ch-l" className="sm:col-span-2"><input id="ch-l" className={inputClass} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. 2 extra days" /></Field>
          </div>
        </FormDialog>
      ) : null}
    </>
  );
}

/** Voids a charge of a booking (reason required; needs the right to void). */
export function ChargeVoidButton({ departmentId, charge }) {
  const record = useRecorder();
  return <VoidButton reference={charge.referenceNo} what="charge" onVoid={(reason) => record(chargeVoidSpec(departmentId, charge, reason), { success: `${charge.referenceNo} voided.` })} />;
}
