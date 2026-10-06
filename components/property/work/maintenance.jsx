"use client";

import { useState } from "react";
import { CheckCircle2, CircleX, Play, ThumbsUp, CalendarClock, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { METHODS } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { maintenanceReportSpec, maintenanceStepSpec } from "@/lib/property/specs";
import { formatMoney } from "@/lib/format";

const PRIORITIES = [["NORMAL", "Normal"], ["URGENT", "Urgent"], ["LOW", "Low"]];

/** Reports a problem on an office (the office chosen, or `unit` given). */
export function MaintenanceReportDialog({ departmentId, units, unit = null, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ unitId: unit?.id || units?.[0]?.id || "", title: "", description: "", priority: "NORMAL", reportedBy: "", assignedTo: "", scheduledFor: "", technician: "", estimatedCost: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    const out = await record(maintenanceReportSpec(departmentId, { ...f, title: f.title.trim(), estimatedCost: Number(f.estimatedCost) || 0 }, files), { success: (r) => `${r.referenceNo} reported.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="Report a maintenance problem" footer={<SubmitButton busy={busy} disabled={!f.unitId || !f.title.trim()} onClick={submit}>Report</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        {unit ? null : <Field label="Office" required htmlFor="mr-u"><select id="mr-u" className={selectClass} value={f.unitId} onChange={set("unitId")}>{units.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.building.name}</option>)}</select></Field>}
        <Field label="Priority" htmlFor="mr-p"><select id="mr-p" className={selectClass} value={f.priority} onChange={set("priority")}>{PRIORITIES.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Reported by" htmlFor="mr-rb"><input id="mr-rb" className={inputClass} value={f.reportedBy} onChange={set("reportedBy")} placeholder="Tenant, caretaker…" /></Field>
      </div>
      <Field label="Problem" required htmlFor="mr-t"><input id="mr-t" className={inputClass} value={f.title} onChange={set("title")} placeholder="e.g. Leaking sink, broken lock" /></Field>
      <Field label="Details" htmlFor="mr-d"><textarea id="mr-d" rows={2} className={textareaClass} value={f.description} onChange={set("description")} /></Field>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Assigned to" htmlFor="mr-a"><input id="mr-a" className={inputClass} value={f.assignedTo} onChange={set("assignedTo")} /></Field>
        <Field label="Appointment" htmlFor="mr-s"><input id="mr-s" type="datetime-local" className={inputClass} value={f.scheduledFor} onChange={set("scheduledFor")} /></Field>
        <Field label="Technician / supplier" htmlFor="mr-te"><input id="mr-te" className={inputClass} value={f.technician} onChange={set("technician")} /></Field>
        <Field label="Estimated cost" htmlFor="mr-c"><input id="mr-c" className={inputClass} inputMode="numeric" value={f.estimatedCost} onChange={(e) => setF({ ...f, estimatedCost: wholeNumber(e.target.value) })} /></Field>
      </div>
      <ProofUpload value={files} onChange={setFiles} label="Add photos" />
    </FormDialog>
  );
}

function CompleteDialog({ departmentId, request, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ cost: request.cost ? String(request.cost) : "", technician: request.technician || "", notes: "", pay: true, paymentMethod: "CASH", reference: "", counterparty: request.technician || "", chargeTenant: false, chargeAmount: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.type === "checkbox" ? e.target.checked : e.target.value });
  const cost = Number(f.cost) || 0;
  const submit = async () => {
    setBusy(true);
    const input = { cost, technician: f.technician, notes: f.notes, ...(f.pay && cost ? { pay: { paymentMethod: f.paymentMethod, reference: f.reference, counterparty: f.counterparty || f.technician } } : {}), ...(f.chargeTenant ? { chargeTenant: true, chargeAmount: Number(f.chargeAmount) || cost } : {}) };
    const out = await record(maintenanceStepSpec(departmentId, request, "complete", input, files), { success: (r) => `${request.referenceNo} completed${r.expense ? ` · expense ${r.expense}` : ""}${r.charge ? ` · billed ${r.charge}` : ""}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`${request.referenceNo} completed`} description={request.title} footer={<SubmitButton busy={busy} disabled={f.pay && cost > 0 && f.paymentMethod !== "CASH" && !f.reference.trim()} onClick={submit}>Mark completed</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Final cost (FCFA)" htmlFor="mc-c"><input id="mc-c" className={inputClass} inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: wholeNumber(e.target.value) })} /></Field>
        <Field label="Technician / supplier" htmlFor="mc-t"><input id="mc-t" className={inputClass} value={f.technician} onChange={set("technician")} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.pay} onChange={set("pay")} /> Paid now from the drawer (an expense of this office)</label>
      {f.pay && cost > 0 ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Paid by" htmlFor="mc-m"><select id="mc-m" className={selectClass} value={f.paymentMethod} onChange={set("paymentMethod")}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
          <Field label="Reference" required={f.paymentMethod !== "CASH"} htmlFor="mc-r"><input id="mc-r" className={inputClass} value={f.reference} onChange={set("reference")} /></Field>
          <Field label="Paid to" htmlFor="mc-cp"><input id="mc-cp" className={inputClass} value={f.counterparty} onChange={set("counterparty")} /></Field>
        </div>
      ) : null}
      {request.lease ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.chargeTenant} onChange={set("chargeTenant")} /> Bill it to the tenant ({request.lease.client.name})</label> : null}
      {f.chargeTenant ? <Field label="Amount billed to the tenant" htmlFor="mc-ca" hint={`Default: the cost (${formatMoney(cost)}).`}><input id="mc-ca" className={inputClass} inputMode="numeric" value={f.chargeAmount} onChange={(e) => setF({ ...f, chargeAmount: wholeNumber(e.target.value) })} /></Field> : null}
      <Field label="Notes" htmlFor="mc-n"><textarea id="mc-n" rows={2} className={textareaClass} value={f.notes} onChange={set("notes")} /></Field>
      <ProofUpload value={files} onChange={setFiles} label="Attach the receipt" />
    </FormDialog>
  );
}

function PlanDialog({ departmentId, request, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ assignedTo: request.assignedTo || "", scheduledFor: request.scheduledFor ? String(request.scheduledFor).slice(0, 16) : "", technician: request.technician || "", cost: request.cost ? String(request.cost) : "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(maintenanceStepSpec(departmentId, request, "plan", f), { success: "Appointment saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Plan ${request.referenceNo}`} description={request.title} footer={<SubmitButton busy={busy} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Assigned to" htmlFor="mp-a"><input id="mp-a" className={inputClass} value={f.assignedTo} onChange={(e) => setF({ ...f, assignedTo: e.target.value })} /></Field>
        <Field label="Appointment" htmlFor="mp-s"><input id="mp-s" type="datetime-local" className={inputClass} value={f.scheduledFor} onChange={(e) => setF({ ...f, scheduledFor: e.target.value })} /></Field>
        <Field label="Technician / supplier" htmlFor="mp-t"><input id="mp-t" className={inputClass} value={f.technician} onChange={(e) => setF({ ...f, technician: e.target.value })} /></Field>
        <Field label="Estimated cost" htmlFor="mp-c"><input id="mp-c" className={inputClass} inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: wholeNumber(e.target.value) })} /></Field>
      </div>
    </FormDialog>
  );
}

function CancelDialog({ departmentId, request, onClose }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(maintenanceStepSpec(departmentId, request, "cancel", { reason }), { success: `${request.referenceNo} cancelled.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Cancel ${request.referenceNo}`} footer={<SubmitButton busy={busy} variant="destructive" disabled={reason.trim().length < 3} onClick={submit}>Cancel the request</SubmitButton>}>
      <Field label="Why" required htmlFor="mx-r"><input id="mx-r" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  );
}

/** The next steps of a request: approve, plan, start, complete, cancel. */
export function MaintenanceActions({ departmentId, request, canAct }) {
  const record = useRecorder();
  const [open, setOpen] = useState(null);
  if (!canAct || ["COMPLETED", "CANCELLED"].includes(request.status)) return null;
  const quick = (step, success) => record(maintenanceStepSpec(departmentId, request, step), { success });
  return (
    <div className="flex flex-wrap gap-1.5">
      {request.status === "REPORTED" ? <Button size="sm" variant="outline" onClick={() => quick("approve", `${request.referenceNo} approved.`)}><ThumbsUp className="h-3.5 w-3.5" /> Approve</Button> : null}
      <Button size="sm" variant="ghost" onClick={() => setOpen("plan")}><CalendarClock className="h-3.5 w-3.5" /> Plan</Button>
      {request.status !== "IN_PROGRESS" ? <Button size="sm" variant="ghost" onClick={() => quick("start", `${request.referenceNo} in progress.`)}><Play className="h-3.5 w-3.5" /> Start</Button> : null}
      {request.status !== "REPORTED" ? <Button size="sm" onClick={() => setOpen("complete")}><CheckCircle2 className="h-3.5 w-3.5" /> Complete</Button> : null}
      <Button size="sm" variant="ghost" onClick={() => setOpen("cancel")}><CircleX className="h-3.5 w-3.5" /> Cancel</Button>
      {open === "complete" ? <CompleteDialog departmentId={departmentId} request={request} onClose={() => setOpen(null)} /> : null}
      {open === "plan" ? <PlanDialog departmentId={departmentId} request={request} onClose={() => setOpen(null)} /> : null}
      {open === "cancel" ? <CancelDialog departmentId={departmentId} request={request} onClose={() => setOpen(null)} /> : null}
    </div>
  );
}

/** "Report a problem" button (office given, or chosen in the dialog). */
export function ReportMaintenanceButton({ departmentId, units, unit, label = "Report a problem", variant = "outline" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} onClick={() => setOpen(true)}><Wrench className="h-4 w-4" /> {label}</Button>
      {open ? <MaintenanceReportDialog departmentId={departmentId} units={units} unit={unit} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
