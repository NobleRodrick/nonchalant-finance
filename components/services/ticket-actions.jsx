"use client";

import { useState } from "react";
import { Ban, CheckCircle2, HandCoins, MessageCircle, Pencil, Play, ShieldAlert, Undo2, PackageCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { PaymentFields, paymentReady, METHODS } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { ticketCancelSpec, ticketCompensateSpec, ticketNotifiedSpec, ticketPaymentSpec, ticketRefundSpec, ticketStepSpec, ticketUpdateSpec } from "@/lib/trade/specs";
import { readyMessage } from "@/lib/services/ticket-math";
import { whatsappLink } from "@/lib/property/reminder-text";
import { formatMoney } from "@/lib/format";

const blank = (amount = "") => ({ amount: amount ? String(amount) : "", paymentMethod: "CASH", reference: "", receivedByName: "" });

/** Start (with the washer) and Ready without a form: the queue and the board use these. */
export function QuickSteps({ departmentId, ticket, workers = [], size = "sm" }) {
  const record = useRecorder();
  const [busy, setBusy] = useState(false);
  const [washer, setWasher] = useState("");
  const step = async (s, extra = {}) => {
    setBusy(true);
    await record(ticketStepSpec(departmentId, ticket, s, extra), { success: s === "start" ? `${ticket.referenceNo} started.` : `${ticket.referenceNo} is ready.` });
    setBusy(false);
  };
  if (ticket.status === "RECEIVED") {
    return (
      <span className="inline-flex items-center gap-1">
        {workers.length ? <select aria-label="Washer" className={`${selectClass} h-8 w-28 text-xs`} value={washer} onChange={(e) => setWasher(e.target.value)}><option value="">Washer…</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select> : null}
        <Button size={size} variant="outline" disabled={busy} onClick={() => step("start", washer ? { workerId: washer } : {})}><Play className="h-4 w-4" /> Start</Button>
        <Button size={size} variant="outline" disabled={busy} onClick={() => step("ready")}><CheckCircle2 className="h-4 w-4" /> Ready</Button>
      </span>
    );
  }
  if (ticket.status === "IN_PROGRESS") return <Button size={size} variant="outline" disabled={busy} onClick={() => step("ready")}><CheckCircle2 className="h-4 w-4" /> Ready</Button>;
  return null;
}

function CollectDialog({ departmentId, ticket, canCredit, onClose }) {
  const record = useRecorder();
  const due = Math.max(0, ticket.balance);
  const [f, setF] = useState(blank(due));
  const [credit, setCredit] = useState(false);
  const [busy, setBusy] = useState(false);
  const paying = Number(f.amount) || 0;
  const valid = paying <= due && (paying === 0 || paymentReady(f)) && (paying === due || credit);
  const submit = async () => {
    setBusy(true);
    const out = await record(ticketStepSpec(departmentId, ticket, "collect", { ...(paying ? { payment: { amount: paying, paymentMethod: f.paymentMethod, reference: f.reference.trim() || null, receivedByName: f.receivedByName } } : {}), onCredit: credit }), { success: `${ticket.referenceNo} collected.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Hand over ${ticket.referenceNo}`} description={due ? `${formatMoney(due)} left to pay (total ${formatMoney(ticket.total)}, paid ${formatMoney(ticket.paid)}).` : "Fully paid."} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}><PackageCheck className="h-4 w-4" /> Collected</SubmitButton>}>
      {due ? <PaymentFields value={f} onChange={setF} idPrefix="cl" /> : <p className="text-sm text-slate-600">Nothing to pay: hand the {ticket.plate ? "vehicle" : "items"} over.</p>}
      {due && canCredit ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={credit} onChange={(e) => setCredit(e.target.checked)} /> The customer leaves owing {formatMoney(due - paying)}</label> : null}
    </FormDialog>
  );
}

function MoneyDialog({ departmentId, ticket, kind, onClose }) {
  const record = useRecorder();
  const max = kind === "pay" ? Math.max(0, ticket.balance) : kind === "refund" ? (ticket.status === "CANCELLED" ? ticket.paid : Math.max(0, -ticket.balance)) : null;
  const [f, setF] = useState(blank(max || ""));
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const titles = { pay: "Record a payment", refund: "Give money back", compensate: "Compensation for a damaged or lost item" };
  const valid = paymentReady(f) && (max === null || Number(f.amount) <= max) && (kind === "pay" || reason.trim());
  const submit = async () => {
    setBusy(true);
    const input = { amount: Number(f.amount), paymentMethod: f.paymentMethod, reference: f.reference.trim() || null, receivedByName: f.receivedByName, reason: reason.trim() || null };
    const spec = kind === "pay" ? ticketPaymentSpec : kind === "refund" ? ticketRefundSpec : ticketCompensateSpec;
    const out = await record(spec(departmentId, ticket, input), { success: (d) => `${d?.referenceNo || "Recorded"}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={titles[kind]} description={max !== null ? `At most ${formatMoney(max)}.` : "Paid to the customer: an expense of the pressing, linked to this ticket."} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record</SubmitButton>}>
      <PaymentFields value={f} onChange={setF} idPrefix="tm" amountLabel={kind === "pay" ? "Amount received (FCFA)" : "Amount given (FCFA)"} byLabel={kind === "pay" ? "Received by" : "Given by"} />
      {kind !== "pay" ? <Field label={kind === "refund" ? "Why" : "What was damaged or lost"} required htmlFor="tm-why"><textarea id="tm-why" rows={2} className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field> : null}
    </FormDialog>
  );
}

function CancelDialog({ departmentId, ticket, onClose }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [refund, setRefund] = useState(ticket.paid > 0);
  const [method, setMethod] = useState("CASH");
  const [reference, setReference] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(ticketCancelSpec(departmentId, ticket, { reason: reason.trim(), refund, paymentMethod: method, reference: reference.trim() || null }), { success: `${ticket.referenceNo} cancelled.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Cancel ${ticket.referenceNo}`} description="Nothing is deleted: the ticket stays, marked cancelled." footer={<SubmitButton variant="destructive" busy={busy} disabled={!reason.trim() || (refund && method !== "CASH" && !reference.trim())} onClick={submit}>Cancel the ticket</SubmitButton>}>
      <Field label="Why" required htmlFor="tc-r"><input id="tc-r" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
      {ticket.paid > 0 ? (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3 text-sm">
          <p>{formatMoney(ticket.paid)} was paid on this ticket.</p>
          <label className="flex items-center gap-2"><input type="radio" checked={refund} onChange={() => setRefund(true)} /> Give it back to the customer</label>
          <label className="flex items-center gap-2"><input type="radio" checked={!refund} onChange={() => setRefund(false)} /> Keep it (counts as income today)</label>
          {refund ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <select aria-label="Given back by" className={selectClass} value={method} onChange={(e) => setMethod(e.target.value)}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
              {method !== "CASH" ? <input aria-label="Reference" className={inputClass} value={reference} onChange={(e) => setReference(e.target.value)} placeholder="Reference" /> : null}
            </div>
          ) : null}
        </div>
      ) : null}
    </FormDialog>
  );
}

function EditDialog({ departmentId, ticket, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ express: ticket.express, tagNo: ticket.tagNo || "", notes: ticket.notes || "", promised: ticket.promisedAt ? new Date(ticket.promisedAt).toLocaleString("sv-SE").slice(0, 16).replace(" ", "T") : "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(ticketUpdateSpec(departmentId, ticket, { express: f.express, tagNo: f.tagNo, notes: f.notes, ...(f.promised ? { promisedAt: new Date(f.promised).toISOString() } : {}) }), { success: "Saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Change ${ticket.referenceNo}`} footer={<SubmitButton busy={busy} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ready by" htmlFor="te-p"><input id="te-p" type="datetime-local" className={inputClass} value={f.promised} onChange={(e) => setF({ ...f, promised: e.target.value })} /></Field>
        <Field label="Tag numbers" htmlFor="te-t"><input id="te-t" className={inputClass} value={f.tagNo} onChange={(e) => setF({ ...f, tagNo: e.target.value })} /></Field>
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.express} onChange={(e) => setF({ ...f, express: e.target.checked })} /> Express</label>
        <Field label="Notes" htmlFor="te-n" className="sm:col-span-2"><textarea id="te-n" rows={3} className={textareaClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
    </FormDialog>
  );
}

/** Everything that can happen to a ticket, by its status and the person's rights. */
export function TicketActions({ departmentId, domain, ticket, workers, business, perms }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const open = !["COLLECTED", "CANCELLED"].includes(ticket.status);
  const wa = ticket.phone && ticket.status === "READY" ? whatsappLink(ticket.phone, readyMessage({ business, customer: ticket.customer, referenceNo: ticket.referenceNo, balance: ticket.balance, kind: domain })) : null;
  const can = perms.servicesTicket;
  return (
    <div className="flex flex-wrap gap-2" data-testid="ticket-actions">
      {can && open ? <QuickSteps departmentId={departmentId} ticket={ticket} workers={workers} size="default" /> : null}
      {can && open ? <Button onClick={() => setDialog("collect")}><PackageCheck className="h-4 w-4" /> Collected</Button> : null}
      {wa ? <a href={wa} target="_blank" rel="noreferrer" onClick={() => record(ticketNotifiedSpec(departmentId, ticket))}><Button variant="outline"><MessageCircle className="h-4 w-4" /> {ticket.notified ? "Tell again" : "Tell the customer"} (WhatsApp)</Button></a> : null}
      {can && ticket.status !== "CANCELLED" && ticket.balance > 0 ? <Button variant="outline" onClick={() => setDialog("pay")}><HandCoins className="h-4 w-4" /> Payment</Button> : null}
      {can && ((ticket.status === "CANCELLED" && ticket.paid > 0) || ticket.balance < 0) ? <Button variant="outline" onClick={() => setDialog("refund")}><Undo2 className="h-4 w-4" /> Refund</Button> : null}
      {perms.expenses && domain === "PRESSING" && ticket.status !== "CANCELLED" ? <Button variant="outline" onClick={() => setDialog("compensate")}><ShieldAlert className="h-4 w-4" /> Damage / loss</Button> : null}
      {can && open ? <Button variant="ghost" onClick={() => setDialog("edit")}><Pencil className="h-4 w-4" /> Change</Button> : null}
      {can && open ? <Button variant="ghost" className="text-rose-700" onClick={() => setDialog("cancel")}><Ban className="h-4 w-4" /> Cancel</Button> : null}
      {dialog === "collect" ? <CollectDialog departmentId={departmentId} ticket={ticket} canCredit={perms.debts} onClose={() => setDialog(null)} /> : null}
      {["pay", "refund", "compensate"].includes(dialog) ? <MoneyDialog departmentId={departmentId} ticket={ticket} kind={dialog} onClose={() => setDialog(null)} /> : null}
      {dialog === "cancel" ? <CancelDialog departmentId={departmentId} ticket={ticket} onClose={() => setDialog(null)} /> : null}
      {dialog === "edit" ? <EditDialog departmentId={departmentId} ticket={ticket} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
