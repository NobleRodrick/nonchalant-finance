"use client";

import { useState } from "react";
import { ClipboardCheck, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useRecorder } from "@/lib/offline/react";
import { inspectionCompleteSpec, inspectionSpec } from "@/lib/property/specs";
import { CONDITION_LABELS } from "@/lib/property/unit-math";

import { INSPECTION_KIND_LABELS as INSPECTION_KINDS } from "@/lib/property/unit-math";

export { INSPECTION_KINDS };
const AREAS = ["Walls & paint", "Floor", "Doors & locks", "Windows", "Electricity & sockets", "Lighting", "Plumbing", "Air conditioning", "Furniture", "Keys"];

/**
 * The findings of an inspection: rows (area, condition, note), overall condition, damage cost,
 * notes. `value` / `onChange`. Shared by inspections and the move-out.
 */
export function InspectionFindings({ value: f, onChange, canBill, idPrefix = "in" }) {
  const setRow = (i, k, v) => onChange({ ...f, rows: f.rows.map((r, j) => (j === i ? { ...r, [k]: v } : r)) });
  return (
    <div className="space-y-3">
      <div className="space-y-2">
        {f.rows.map((r, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-[12rem_9rem_1fr_auto]">
            <Field label="Area" htmlFor={`${idPrefix}-a-${i}`}><input id={`${idPrefix}-a-${i}`} className={inputClass} list={`${idPrefix}-areas`} value={r.area} onChange={(e) => setRow(i, "area", e.target.value)} /></Field>
            <Field label="Condition" htmlFor={`${idPrefix}-c-${i}`}><select id={`${idPrefix}-c-${i}`} className={selectClass} value={r.condition} onChange={(e) => setRow(i, "condition", e.target.value)}>{Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
            <Field label="Note" htmlFor={`${idPrefix}-n-${i}`}><input id={`${idPrefix}-n-${i}`} className={inputClass} value={r.note} onChange={(e) => setRow(i, "note", e.target.value)} /></Field>
            <Button size="icon" variant="ghost" aria-label="Remove the row" onClick={() => onChange({ ...f, rows: f.rows.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <datalist id={`${idPrefix}-areas`}>{AREAS.map((a) => <option key={a} value={a} />)}</datalist>
        <Button size="sm" variant="outline" onClick={() => onChange({ ...f, rows: [...f.rows, { area: "", condition: "GOOD", note: "" }] })}><Plus className="h-3.5 w-3.5" /> Add an area</Button>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Overall condition" htmlFor={`${idPrefix}-oc`}><select id={`${idPrefix}-oc`} className={selectClass} value={f.condition} onChange={(e) => onChange({ ...f, condition: e.target.value })}>{Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Cost of damages (FCFA)" htmlFor={`${idPrefix}-dc`}><input id={`${idPrefix}-dc`} className={inputClass} inputMode="numeric" value={f.damageCost} onChange={(e) => onChange({ ...f, damageCost: wholeNumber(e.target.value) })} /></Field>
        <Field label="Inspected by" htmlFor={`${idPrefix}-by`}><input id={`${idPrefix}-by`} className={inputClass} value={f.inspector} onChange={(e) => onChange({ ...f, inspector: e.target.value })} /></Field>
      </div>
      {canBill && Number(f.damageCost) > 0 ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.chargeDamages} onChange={(e) => onChange({ ...f, chargeDamages: e.target.checked })} /> Bill the damages to the tenant</label> : null}
      <Field label="Notes" htmlFor={`${idPrefix}-no`}><textarea id={`${idPrefix}-no`} rows={2} className={textareaClass} value={f.notes} onChange={(e) => onChange({ ...f, notes: e.target.value })} /></Field>
    </div>
  );
}

export const blankFindings = (inspector = "") => ({ rows: AREAS.slice(0, 4).map((area) => ({ area, condition: "GOOD", note: "" })), condition: "GOOD", damageCost: "", inspector, notes: "", chargeDamages: false });

/** Plans an inspection or records one done now (move-in, move-out, damage, maintenance, routine). */
export function InspectionDialog({ departmentId, units, unit = null, kind = "ROUTINE", currentUserName, onClose }) {
  const record = useRecorder();
  const [meta, setMeta] = useState({ unitId: unit?.id || units?.[0]?.id || "", kind, done: true, scheduledFor: "" });
  const [f, setF] = useState(blankFindings(currentUserName));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const occupied = (unit || units?.find((u) => u.id === meta.unitId))?.lease;
  const submit = async () => {
    setBusy(true);
    const input = meta.done ? { ...meta, ...f, damageCost: Number(f.damageCost) || 0 } : { unitId: meta.unitId, kind: meta.kind, done: false, scheduledFor: meta.scheduledFor, inspector: f.inspector };
    const out = await record(inspectionSpec(departmentId, input, meta.done ? files : []), { success: (r) => `${r.referenceNo} ${meta.done ? "recorded" : "planned"}${r.charge ? ` · damages billed ${r.charge}` : ""}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="Inspection" footer={<SubmitButton busy={busy} disabled={!meta.unitId || (!meta.done && !meta.scheduledFor)} onClick={submit}>{meta.done ? "Record the inspection" : "Plan it"}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        {unit ? null : <Field label="Office" required htmlFor="ip-u"><select id="ip-u" className={selectClass} value={meta.unitId} onChange={(e) => setMeta({ ...meta, unitId: e.target.value })}>{units.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.building.name}</option>)}</select></Field>}
        <Field label="Kind" htmlFor="ip-k"><select id="ip-k" className={selectClass} value={meta.kind} onChange={(e) => setMeta({ ...meta, kind: e.target.value })}>{Object.entries(INSPECTION_KINDS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="When" htmlFor="ip-w"><select id="ip-w" className={selectClass} value={meta.done ? "now" : "later"} onChange={(e) => setMeta({ ...meta, done: e.target.value === "now" })}><option value="now">Done now</option><option value="later">Plan for a date</option></select></Field>
        {!meta.done ? <Field label="Date" required htmlFor="ip-d"><input id="ip-d" type="date" className={inputClass} value={meta.scheduledFor} onChange={(e) => setMeta({ ...meta, scheduledFor: e.target.value })} /></Field> : null}
      </div>
      {meta.done ? (
        <>
          <InspectionFindings value={f} onChange={setF} canBill={Boolean(occupied) || Boolean(unit?.lease)} />
          <ProofUpload value={files} onChange={setFiles} label="Add photos" />
        </>
      ) : null}
    </FormDialog>
  );
}

/** Records the findings of a planned inspection. */
export function CompleteInspectionDialog({ departmentId, inspection, currentUserName, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(blankFindings(currentUserName));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(inspectionCompleteSpec(departmentId, inspection, { ...f, damageCost: Number(f.damageCost) || 0 }, files), { success: `${inspection.referenceNo} done.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={`${inspection.referenceNo} · ${INSPECTION_KINDS[inspection.kind]}`} description={`${inspection.unit.name} · ${inspection.unit.building.name}`} footer={<SubmitButton busy={busy} onClick={submit}>Record the findings</SubmitButton>}>
      <InspectionFindings value={f} onChange={setF} canBill={Boolean(inspection.leaseId)} idPrefix="ci" />
      <ProofUpload value={files} onChange={setFiles} label="Add photos" />
    </FormDialog>
  );
}

export function InspectionButton({ departmentId, units, unit, kind, currentUserName, label = "Inspection", variant = "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><ClipboardCheck className="h-4 w-4" /> {label}</Button>
      {open ? <InspectionDialog departmentId={departmentId} units={units} unit={unit} kind={kind} currentUserName={currentUserName} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
