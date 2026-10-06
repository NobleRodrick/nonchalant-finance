"use client";

import { useState } from "react";
import { Archive, Pencil, SlidersHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { unitArchiveSpec, unitStateSpec } from "@/lib/property/specs";
import { MANUAL_STATES, UNIT_STATUS } from "@/lib/property/unit-math";
import { OfficeDialog } from "./office-dialog";

function StateDialog({ departmentId, unit, onClose }) {
  const record = useRecorder();
  const occupied = ["OCCUPIED", "RESERVED"].includes(unit.status);
  const [f, setF] = useState({ state: unit.status === "AWAITING_HANDOVER" ? "AVAILABLE" : unit.state, note: "", availableFrom: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(unitStateSpec(departmentId, unit, f), { success: `${unit.name}: ${UNIT_STATUS[f.state].label.toLowerCase()}.` });
    setBusy(false);
    if (out) onClose();
  };
  const states = occupied ? ["MAINTENANCE"] : MANUAL_STATES;
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`State of ${unit.name}`} description={unit.status === "AWAITING_HANDOVER" ? "Confirm the office is ready for a new tenant (repairs done, keys back, cleaned)." : undefined} footer={<SubmitButton busy={busy} disabled={f.state !== "AVAILABLE" && !f.note.trim()} onClick={submit}>Save</SubmitButton>}>
      <Field label="State" htmlFor="st-s"><select id="st-s" className={selectClass} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>{states.map((s) => <option key={s} value={s}>{UNIT_STATUS[s].label}</option>)}</select></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Why / what is being done" required={f.state !== "AVAILABLE"} htmlFor="st-n"><input id="st-n" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
        <Field label="Available from" htmlFor="st-d"><input id="st-d" type="date" className={inputClass} value={f.availableFrom} onChange={(e) => setF({ ...f, availableFrom: e.target.value })} /></Field>
      </div>
    </FormDialog>
  );
}

function ArchiveDialog({ departmentId, unit, onClose }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const restore = !unit.isActive;
  const submit = async () => {
    setBusy(true);
    const out = await record(unitArchiveSpec(departmentId, unit, restore ? { archive: false } : { reason }), { success: restore ? `${unit.name} restored.` : `${unit.name} archived.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={restore ? `Restore ${unit.name}` : `Archive ${unit.name}`} description={restore ? "The office is offered again." : "No longer offered; its contracts and money stay in the history. Nothing is deleted."} footer={<SubmitButton busy={busy} disabled={!restore && reason.trim().length < 3} onClick={submit}>{restore ? "Restore" : "Archive"}</SubmitButton>}>
      {restore ? null : <Field label="Why" required htmlFor="ar-r"><input id="ar-r" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>}
    </FormDialog>
  );
}

/** Edit, state, archive of an office. */
export function OfficeActions({ departmentId, unit, buildings, thisMonth, canManage, canArchive }) {
  const [open, setOpen] = useState(null);
  if (!canManage) return null;
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="outline" onClick={() => setOpen("edit")}><Pencil className="h-4 w-4" /> Edit</Button>
      <Button variant={unit.status === "AWAITING_HANDOVER" ? "default" : "outline"} onClick={() => setOpen("state")}><SlidersHorizontal className="h-4 w-4" /> {unit.status === "AWAITING_HANDOVER" ? "Confirm ready" : "Set state"}</Button>
      {canArchive ? <Button variant="ghost" onClick={() => setOpen("archive")}><Archive className="h-4 w-4" /> {unit.isActive ? "Archive" : "Restore"}</Button> : null}
      {open === "edit" ? <OfficeDialog departmentId={departmentId} buildings={buildings} unit={unit} thisMonth={thisMonth} onClose={() => setOpen(null)} /> : null}
      {open === "state" ? <StateDialog departmentId={departmentId} unit={unit} onClose={() => setOpen(null)} /> : null}
      {open === "archive" ? <ArchiveDialog departmentId={departmentId} unit={unit} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}
