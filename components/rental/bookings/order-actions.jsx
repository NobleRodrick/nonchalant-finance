"use client";

import Link from "next/link";
import { useState } from "react";
import { Ban, CheckCircle2, ClipboardList, FileText, Lock, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { orderCancelSpec, orderStepSpec } from "@/lib/rental/specs";
import { EDITABLE_STATUSES, NEXT_STEPS } from "@/lib/rental/booking-math";

const STEPS = {
  quote: { label: "Quotation sent", icon: FileText, done: "Quotation sent." },
  confirm: { label: "Confirm the booking", icon: CheckCircle2, done: "Booking confirmed: its items are held." },
  prepare: { label: "Start preparing", icon: ClipboardList, done: "Preparation started." },
  close: { label: "Close the booking", icon: Lock, done: "Booking closed." },
};

function CancelDialog({ departmentId, order, onClose }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(orderCancelSpec(departmentId, order, reason.trim()), { success: `${order.referenceNo} cancelled.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Cancel ${order.referenceNo}?`} description="Its items become free for other customers. Money received stays recorded until you refund it; what is kept counts as income." footer={<SubmitButton variant="destructive" busy={busy} disabled={reason.trim().length < 3} onClick={submit}>Cancel the booking</SubmitButton>}>
      <Field label="Reason" required htmlFor="oc-r"><input id="oc-r" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the customer postponed the event" /></Field>
    </FormDialog>
  );
}

/** The next steps of a booking (quote, confirm, prepare, close), change and cancel. */
export function OrderActions({ departmentId, order, canBook }) {
  const record = useRecorder();
  const [busy, setBusy] = useState(null);
  const [cancelling, setCancelling] = useState(false);
  if (!canBook) return null;
  const steps = (NEXT_STEPS[order.status] || []).filter((s) => s !== "cancel");
  const go = async (step) => {
    setBusy(step);
    await record(orderStepSpec(departmentId, order, step), { success: STEPS[step].done });
    setBusy(null);
  };
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {steps.map((s) => {
        const Icon = STEPS[s].icon;
        return <SubmitButton key={s} busy={busy === s} variant={s === "confirm" ? "default" : "outline"} onClick={() => go(s)}><Icon className="h-4 w-4" /> {STEPS[s].label}</SubmitButton>;
      })}
      {EDITABLE_STATUSES.includes(order.status) ? <Link href={`/d/${departmentId}/bookings/${order.id}/edit`}><Button variant="outline"><Pencil className="h-4 w-4" /> Change</Button></Link> : null}
      {NEXT_STEPS[order.status]?.includes("cancel") ? <Button variant="ghost" onClick={() => setCancelling(true)}><Ban className="h-4 w-4" /> Cancel</Button> : null}
      {cancelling ? <CancelDialog departmentId={departmentId} order={order} onClose={() => setCancelling(false)} /> : null}
    </div>
  );
}
