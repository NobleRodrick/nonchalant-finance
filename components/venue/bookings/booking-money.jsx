"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { FileText, Paperclip, Plus, Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { useOutboxOps, useOfflineContext, useRecorder } from "@/lib/offline/react";
import { opsInEffect } from "@/lib/offline/overlay";
import { voidSpec } from "@/lib/offline/specs";
import { chargeSpec, chargeVoidSpec, paymentSpec, refundSpec } from "@/lib/venue/specs";
import { NOT_SENT } from "@/lib/venue/overlay";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const METHODS = [
  ["CASH", "Cash"],
  ["MOMO", "Mobile Money"],
  ["BANK_TRANSFER", "Bank"],
];
const METHOD_LABEL = Object.fromEntries(METHODS);

function when(value) {
  return new Date(value).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function PaymentDialog({ booking, departmentId, onClose }) {
  const record = useRecorder();
  const me = useOfflineContext();
  const balance = booking.figures.balance;
  const [f, setF] = useState({ amount: balance > 0 ? String(balance) : "", paymentMethod: "CASH", receivedByName: me.userName || "", reference: "", remarks: "", overpay: false, files: [] });
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const over = amount > balance;
  const valid = amount > 0 && (!over || f.overpay) && (f.paymentMethod === "CASH" || f.reference.trim()) && f.receivedByName.trim();
  const submit = async () => {
    setBusy(true);
    const spec = paymentSpec({ departmentId, booking, amount, paymentMethod: f.paymentMethod, receivedByName: f.receivedByName.trim(), reference: f.reference.trim(), remarks: f.remarks.trim(), overpay: f.overpay });
    const out = await record({ ...spec, files: f.files }, { success: (r) => `Payment ${r.referenceNo} recorded. Balance: ${formatMoney(r.balance)}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Payment for ${booking.referenceNo}`}
      description={`${booking.client?.name} · total ${formatMoney(booking.figures.total)} · paid ${formatMoney(booking.figures.paid)} · balance ${formatMoney(balance)}`}
      footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record {amount ? formatMoney(amount) : "the payment"}</SubmitButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount received (FCFA)" required htmlFor="pay-amount" error={over && !f.overpay ? `More than the balance (${formatMoney(balance)}).` : null}>
          <input id="pay-amount" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
        </Field>
        <Field label="Paid by" htmlFor="pay-method">
          <select id="pay-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Received by" required htmlFor="pay-by" hint="The person who took the money.">
          <input id="pay-by" className={inputClass} value={f.receivedByName} onChange={(e) => setF({ ...f, receivedByName: e.target.value })} />
        </Field>
        <Field label={f.paymentMethod === "CASH" ? "Reference (optional)" : "Transaction reference"} required={f.paymentMethod !== "CASH"} htmlFor="pay-ref" hint={f.paymentMethod === "CASH" ? undefined : "The Mobile Money or bank transaction number."}>
          <input id="pay-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Field>
      </div>
      {over ? (
        <label className="flex items-start gap-2 rounded-md bg-violet-50 p-2 text-sm text-violet-900">
          <input type="checkbox" className="mt-0.5" checked={f.overpay} onChange={(e) => setF({ ...f, overpay: e.target.checked })} />
          The client pays {formatMoney(amount - Math.max(0, balance))} more than the balance (it will show as overpaid; refund it or add a charge).
        </label>
      ) : null}
      <Field label="Remarks" htmlFor="pay-remarks">
        <input id="pay-remarks" className={inputClass} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="e.g. deposit, second instalment" />
      </Field>
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach proof (receipt, transfer confirmation)" />
    </FormDialog>
  );
}

function RefundDialog({ booking, departmentId, onClose }) {
  const record = useRecorder();
  const max = booking.status === "CANCELLED" ? booking.figures.paid : Math.max(0, -booking.figures.balance);
  const [f, setF] = useState({ amount: max > 0 ? String(max) : "", paymentMethod: "CASH", reason: booking.status === "CANCELLED" ? "Booking cancelled" : "Paid too much", reference: "", files: [] });
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const valid = amount > 0 && amount <= max && f.reason.trim();
  const submit = async () => {
    setBusy(true);
    const spec = refundSpec({ departmentId, booking, amount, paymentMethod: f.paymentMethod, reason: f.reason.trim(), reference: f.reference.trim() });
    const out = await record({ ...spec, files: f.files }, { success: (r) => `Refund ${r.referenceNo} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Refund for ${booking.referenceNo}`}
      description={`At most ${formatMoney(max)} can be given back${booking.status === "CANCELLED" ? " (everything paid)" : " (what was paid too much)"}.`}
      footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record the refund</SubmitButton>}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount given back (FCFA)" required htmlFor="rf-amount">
          <input id="rf-amount" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
        </Field>
        <Field label="Given back by" htmlFor="rf-method">
          <select id="rf-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Why" required htmlFor="rf-reason">
        <input id="rf-reason" className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} />
      </Field>
      <Field label="Reference (optional)" htmlFor="rf-ref">
        <input id="rf-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
      </Field>
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} />
    </FormDialog>
  );
}

function ChargeDialog({ booking, departmentId, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ kind: "EXTRA_SERVICE", label: "", amount: "" });
  const [busy, setBusy] = useState(false);
  const valid = f.label.trim() && Number(f.amount) > 0;
  const submit = async () => {
    setBusy(true);
    const out = await record(chargeSpec({ departmentId, booking, kind: f.kind, label: f.label.trim(), amount: f.amount }), { success: (r) => `Charge ${r.referenceNo} added.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Add a charge to ${booking.referenceNo}`} description="It is added to what the client owes." footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Add the charge</SubmitButton>}>
      <Field label="Kind" htmlFor="ch-kind">
        <select id="ch-kind" className={selectClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
          <option value="EXTRA_SERVICE">Extra service</option>
          <option value="DAMAGE">Damage</option>
          <option value="OTHER">Other</option>
        </select>
      </Field>
      <Field label="What is charged" required htmlFor="ch-label">
        <input id="ch-label" className={inputClass} value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="e.g. two extra hours" />
      </Field>
      <Field label="Amount (FCFA)" required htmlFor="ch-amount">
        <input id="ch-amount" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
      </Field>
    </FormDialog>
  );
}

/**
 * The money of a booking: payments received and refunds (with receipts and proof), charges added,
 * and recording new ones. Records made on this computer show at once as "Not sent yet".
 */
export function BookingMoney({ departmentId, renderedAt, booking, canBook }) {
  const record = useRecorder();
  const ops = useOutboxOps();
  const [dialog, setDialog] = useState(null);
  const base = `/d/${departmentId}/bookings/${booking.id}`;

  const pending = useMemo(
    () => opsInEffect(ops, { departmentId, renderedAt }).filter((op) => op.input?.bookingId === booking.id && ["venue.payment.record", "venue.refund.record", "venue.charge.add"].includes(op.kind)),
    [ops, departmentId, renderedAt, booking.id]
  );
  const pendingMoney = pending
    .filter((op) => op.kind !== "venue.charge.add")
    .map((op) => ({
      id: op.key,
      type: op.kind === "venue.refund.record" ? "BOOKING_REFUND" : "BOOKING_PAYMENT",
      referenceNo: op.status === "applied" ? op.result?.referenceNo : NOT_SENT,
      amount: op.input.amount,
      paymentMethod: op.input.paymentMethod,
      reference: op.input.reference,
      receivedByName: op.input.receivedByName,
      date: op.createdAt,
      status: "COMPLETED",
      pending: true,
      proofs: [],
    }));
  const rows = [...(booking.transactions || []).filter((t) => t.type === "BOOKING_PAYMENT" || t.type === "BOOKING_REFUND"), ...pendingMoney];
  const expenses = (booking.transactions || []).filter((t) => !["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(t.type));
  const charges = [
    ...(booking.charges || []),
    ...pending.filter((op) => op.kind === "venue.charge.add").map((op) => ({ id: op.key, referenceNo: NOT_SENT, label: op.input.label, amount: op.input.amount, kind: op.input.kind, date: op.createdAt, pending: true })),
  ];

  const voidPayment = (t) => (reason) => {
    const spec = voidSpec({ departmentId, row: { ...t, methodCode: t.paymentMethod }, type: t.type, reason });
    // The booking's balance follows the void at once (lib/venue/overlay).
    return record({ ...spec, meta: { ...spec.meta, bookingId: booking.id, voidType: t.type, amount: t.amount } }, { success: `${t.referenceNo} voided.` });
  };
  const removeCharge = (c) => (reason) => record(chargeVoidSpec({ departmentId, booking, charge: c, reason }), { success: `${c.referenceNo} removed.` });

  const open = booking.status !== "CANCELLED";
  const canRefund = booking.status === "CANCELLED" ? booking.figures.paid > 0 : booking.figures.balance < 0;

  const columns = [
    { key: "when", label: "Date", render: (t) => <span className="whitespace-nowrap text-xs">{when(t.date)}</span> },
    {
      key: "ref",
      label: "Receipt",
      render: (t) =>
        t.pending ? <span className="font-medium text-amber-700">{t.referenceNo}</span> : <Link className="font-medium underline-offset-2 hover:underline" href={`${base}/receipt/${t.id}`}>{t.referenceNo}</Link>,
    },
    { key: "kind", label: "", render: (t) => (t.type === "BOOKING_REFUND" ? <StatusBadge status="REFUNDED" label="Refund" /> : <StatusBadge status="PAID" label="Payment" />) },
    { key: "method", label: "Method", render: (t) => <span>{METHOD_LABEL[t.paymentMethod] || t.paymentMethod}{t.reference ? <span className="block text-xs text-slate-500">{t.reference}</span> : null}</span> },
    { key: "by", label: "Received by", render: (t) => t.receivedByName || t.user?.name || "—" },
    {
      key: "proof",
      label: "Proof",
      render: (t) =>
        t.proofs?.length ? (
          <span className="flex flex-wrap gap-1">
            {t.proofs.map((p) => (
              <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs hover:bg-slate-50">
                <Paperclip className="h-3 w-3" /> {p.fileName}
              </a>
            ))}
          </span>
        ) : (
          <span className="text-xs text-slate-400">—</span>
        ),
    },
    {
      key: "amount",
      label: "Amount",
      align: "right",
      render: (t) => (
        <span className={cn(t.status === "VOIDED" && "line-through opacity-60")}>
          <Money value={t.type === "BOOKING_REFUND" ? -t.amount : t.amount} tone={t.type === "BOOKING_REFUND" ? "out" : "in"} />
          {t.status === "VOIDED" ? <span className="block text-[11px] text-rose-700">Void: {t.voidReason}</span> : null}
        </span>
      ),
    },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (t) =>
        t.pending || t.status === "VOIDED" ? null : (
          <span className="inline-flex gap-1">
            <Link href={`${base}/receipt/${t.id}`} aria-label={`Print receipt ${t.referenceNo}`}><Button size="icon-sm" variant="ghost"><Printer className="h-4 w-4" /></Button></Link>
            {canBook ? <VoidButton onVoid={voidPayment(t)} reference={t.referenceNo} what="payment" /> : null}
          </span>
        ),
    },
  ];

  return (
    <>
      <Section
        title="Payments"
        description={`Total due ${formatMoney(booking.figures.total)} · paid ${formatMoney(booking.figures.paid)} · balance ${formatMoney(booking.figures.balance)}`}
        actions={
          <span className="flex flex-wrap gap-2">
            <Link href={`${base}/statement`}><Button size="sm" variant="outline"><FileText className="h-4 w-4" /> Statement</Button></Link>
            {canBook && open ? <Button size="sm" onClick={() => setDialog("pay")}><Plus className="h-4 w-4" /> Record a payment</Button> : null}
            {canBook && canRefund ? <Button size="sm" variant="outline" onClick={() => setDialog("refund")}><Undo2 className="h-4 w-4" /> Refund</Button> : null}
          </span>
        }
      >
        <DataTable columns={columns} rows={rows} empty="No payment yet." rowClassName={(t) => (t.pending ? "bg-amber-50/40" : "")} />
      </Section>

      <Section title="Charges" description="Added to what the client owes (extra services, damages)." actions={canBook && open ? <Button size="sm" variant="outline" onClick={() => setDialog("charge")}><Plus className="h-4 w-4" /> Add a charge</Button> : null}>
        <DataTable
          dense
          rows={charges}
          empty="No charge."
          columns={[
            { key: "ref", label: "Reference", render: (c) => <span className={cn("font-medium", c.pending && "text-amber-700")}>{c.referenceNo}</span> },
            { key: "label", label: "What", render: (c) => <span className={cn(c.voidedAt && "line-through opacity-60")}>{c.label}{c.voidedAt ? <span className="block text-[11px] text-rose-700">Removed: {c.voidReason}</span> : null}</span> },
            { key: "amount", label: "Amount", align: "right", render: (c) => <Money value={c.amount} className={cn(c.voidedAt && "line-through opacity-60")} /> },
            { key: "actions", label: "", align: "right", render: (c) => (canBook && !c.pending && !c.voidedAt ? <VoidButton onVoid={removeCharge(c)} reference={c.referenceNo} what="charge" label="Remove" /> : null) },
          ]}
        />
      </Section>

      {expenses.length ? (
        <Section title="Expenses of this event">
          <DataTable
            dense
            rows={expenses}
            columns={[
              { key: "ref", label: "Reference", render: (t) => t.referenceNo },
              { key: "what", label: "What", render: (t) => t.description },
              { key: "amount", label: "Amount", align: "right", render: (t) => <Money value={t.amount} tone="out" className={cn(t.status === "VOIDED" && "line-through opacity-60")} /> },
            ]}
          />
        </Section>
      ) : null}

      {dialog === "pay" ? <PaymentDialog booking={booking} departmentId={departmentId} onClose={() => setDialog(null)} /> : null}
      {dialog === "refund" ? <RefundDialog booking={booking} departmentId={departmentId} onClose={() => setDialog(null)} /> : null}
      {dialog === "charge" ? <ChargeDialog booking={booking} departmentId={departmentId} onClose={() => setDialog(null)} /> : null}
    </>
  );
}
