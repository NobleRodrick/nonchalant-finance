"use client";

import Link from "next/link";
import { useState } from "react";
import { FileText, HandCoins, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { useRecorder } from "@/lib/offline/react";
import { paymentSpec, refundSpec } from "@/lib/rental/specs";
import { voidSpec } from "@/lib/offline/specs";
import { formatMoney } from "@/lib/format";

import { METHODS } from "@/components/kit/payment-fields";

export { METHODS };
const LABEL = Object.fromEntries(METHODS);

function PaymentDialog({ departmentId, order, currentUserName, onClose }) {
  const record = useRecorder();
  const f0 = order.figures;
  const suggested = f0.paid === 0 && order.depositDue ? Math.min(order.depositDue, f0.balance) : Math.max(0, f0.balance);
  const [f, setF] = useState({ amount: suggested ? String(suggested) : "", paymentMethod: "CASH", reference: "", receivedByName: currentUserName || "", remarks: "", overpay: false });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const over = amount > f0.balance;
  const submit = async () => {
    setBusy(true);
    const out = await record(paymentSpec(departmentId, order, { amount, paymentMethod: f.paymentMethod, reference: f.reference.trim(), receivedByName: f.receivedByName.trim(), remarks: f.remarks.trim(), overpay: f.overpay }, files), { success: (r) => `Payment ${r.referenceNo} recorded. Balance: ${formatMoney(r.balance)}` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Payment for ${order.referenceNo}`} description={`Total ${formatMoney(f0.total)} · paid ${formatMoney(f0.paid)} · balance ${formatMoney(f0.balance)}`} footer={<SubmitButton busy={busy} disabled={!amount || (over && !f.overpay) || (f.paymentMethod !== "CASH" && !f.reference.trim())} onClick={submit}>Record {amount ? formatMoney(amount) : ""}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount received (FCFA)" required htmlFor="py-a" error={over && !f.overpay ? `More than the balance (${formatMoney(f0.balance)}).` : null}><input id="py-a" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
        <Field label="Paid by" htmlFor="py-m"><select id="py-m" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Transaction reference" required={f.paymentMethod !== "CASH"} htmlFor="py-r"><input id="py-r" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder={f.paymentMethod === "MOMO" ? "MoMo transaction id" : ""} /></Field>
        <Field label="Received by" htmlFor="py-by"><input id="py-by" className={inputClass} value={f.receivedByName} onChange={(e) => setF({ ...f, receivedByName: e.target.value })} /></Field>
      </div>
      <Field label="Remarks" htmlFor="py-rm"><input id="py-rm" className={inputClass} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="e.g. deposit" /></Field>
      {over ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.overpay} onChange={(e) => setF({ ...f, overpay: e.target.checked })} /> The customer really paid more (to refund or keep as credit)</label> : null}
      <ProofUpload value={files} onChange={setFiles} label="Attach proof of payment" />
    </FormDialog>
  );
}

function RefundDialog({ departmentId, order, onClose }) {
  const record = useRecorder();
  const f0 = order.figures;
  const max = order.status === "CANCELLED" ? f0.paid : Math.max(0, -f0.balance);
  const [f, setF] = useState({ amount: max ? String(max) : "", paymentMethod: "CASH", reference: "", reason: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(refundSpec(departmentId, order, { amount: Number(f.amount), paymentMethod: f.paymentMethod, reference: f.reference.trim(), reason: f.reason.trim() }), { success: (r) => `Refund ${r.referenceNo} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Refund for ${order.referenceNo}`} description={`Paid ${formatMoney(f0.paid)}; at most ${formatMoney(max)} can be given back.`} footer={<SubmitButton busy={busy} disabled={!(Number(f.amount) > 0) || Number(f.amount) > max || !f.reason.trim()} onClick={submit}>Give back {f.amount ? formatMoney(Number(f.amount)) : ""}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Amount (FCFA)" required htmlFor="rf-a"><input id="rf-a" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
        <Field label="Given back by" htmlFor="rf-m"><select id="rf-m" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Reference" htmlFor="rf-r"><input id="rf-r" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        <Field label="Why" required htmlFor="rf-w"><input id="rf-w" className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      </div>
    </FormDialog>
  );
}

/** "Record a payment" and "Refund" buttons of a booking. */
export function PaymentButtons({ departmentId, order, canBook, currentUserName }) {
  const [open, setOpen] = useState(null);
  if (!canBook) return null;
  const f = order.figures;
  const canRefund = f.paid > 0 && (order.status === "CANCELLED" || f.balance < 0);
  return (
    <>
      {order.status !== "CANCELLED" ? <Button size="sm" onClick={() => setOpen("pay")}><HandCoins className="h-4 w-4" /> Record a payment</Button> : null}
      {canRefund ? <Button size="sm" variant="outline" onClick={() => setOpen("refund")}><Undo2 className="h-4 w-4" /> Refund</Button> : null}
      {open === "pay" ? <PaymentDialog departmentId={departmentId} order={order} currentUserName={currentUserName} onClose={() => setOpen(null)} /> : null}
      {open === "refund" ? <RefundDialog departmentId={departmentId} order={order} onClose={() => setOpen(null)} /> : null}
    </>
  );
}

/** The payments and refunds of a booking, each with its receipt; void with a reason (with the right). */
export function PaymentsTable({ departmentId, order, payments, canVoid }) {
  const record = useRecorder();
  return (
    <DataTable
      rows={payments}
      empty="No payment yet."
      rowClassName={(t) => (t.status === "VOIDED" ? "opacity-50 line-through" : "")}
      columns={[
        { key: "d", label: "Date", render: (t) => t.dateLabel },
        { key: "ref", label: "No.", render: (t) => <span className="font-mono text-xs">{t.referenceNo}</span> },
        { key: "m", label: "Method", render: (t) => <span>{LABEL[t.paymentMethod] || t.paymentMethod}{t.reference ? <span className="block text-xs text-slate-500">{t.reference}</span> : null}</span> },
        { key: "by", label: "Received by", render: (t) => t.receivedByName || t.user?.name },
        { key: "a", label: "Amount", align: "right", render: (t) => <Money value={t.type === "BOOKING_REFUND" ? -t.amount : t.amount} suffix={false} /> },
        {
          key: "act",
          label: "",
          align: "right",
          render: (t) =>
            t.status === "VOIDED" ? <span className="text-xs no-underline">{t.voidReason}</span> : (
              <span className="inline-flex gap-1">
                {t.type === "BOOKING_PAYMENT" ? <Link href={`/d/${departmentId}/bookings/${order.id}/documents/receipt?t=${t.id}`} target="_blank"><Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5" /> Receipt</Button></Link> : null}
                {canVoid ? <VoidButton reference={t.referenceNo} what="payment" onVoid={(reason) => record(voidSpec({ departmentId, row: t, type: t.type, reason }), { success: `${t.referenceNo} voided.` })} /> : null}
              </span>
            ),
        },
      ]}
    />
  );
}
