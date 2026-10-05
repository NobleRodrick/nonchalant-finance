"use client";

import Link from "next/link";
import { useState } from "react";
import { BedDouble, CheckCircle2, LogIn, LogOut, Paperclip, Pencil, Plus, Printer, Undo2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, KeyValues, Money, Section, StatCard, StatusBadge, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { useOfflineContext, useRecorder } from "@/lib/offline/react";
import { voidSpec } from "@/lib/offline/specs";
import { stayCancelSpec, stayPaymentSpec, stayRefundSpec, stayStepSpec, stayUpdateSpec } from "@/lib/rooms/specs";
import { BOOKING_TYPE_LABELS, STAY_STATUS_LABELS, nightsOf, suggestedPrice } from "@/lib/rooms/stay-math";
import { PAYMENT_STATUS_LABELS } from "@/lib/finance/booking-money";
import { addDaysToKey, formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { STAY_BADGE } from "./stays-board";

const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"]];
const METHOD_LABEL = Object.fromEntries(METHODS);
const when = (v) => (v ? new Date(v).toLocaleString("en-GB", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—");

function PaymentDialog({ departmentId, stay, onClose }) {
  const record = useRecorder();
  const me = useOfflineContext();
  const balance = stay.figures.balance;
  const [f, setF] = useState({ amount: balance > 0 ? String(balance) : "", paymentMethod: "CASH", receivedByName: me.userName || "", reference: "", remarks: "", overpay: false, files: [] });
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const over = amount > balance;
  const valid = amount > 0 && (!over || f.overpay) && (f.paymentMethod === "CASH" || f.reference.trim()) && f.receivedByName.trim();
  const submit = async () => {
    setBusy(true);
    const spec = stayPaymentSpec(departmentId, stay, { amount, paymentMethod: f.paymentMethod, receivedByName: f.receivedByName.trim(), reference: f.reference.trim(), remarks: f.remarks.trim(), overpay: f.overpay });
    const out = await record({ ...spec, files: f.files }, { success: (r) => `Payment ${r.referenceNo} recorded. Balance: ${formatMoney(r.balance)}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Payment for ${stay.referenceNo}`} description={`${stay.guestName} · price ${formatMoney(stay.figures.total)} · paid ${formatMoney(stay.figures.paid)} · balance ${formatMoney(balance)}`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record {amount ? formatMoney(amount) : "the payment"}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount received (FCFA)" required htmlFor="sp-amount" error={over && !f.overpay ? `More than the balance (${formatMoney(balance)}).` : null}>
          <input id="sp-amount" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
        </Field>
        <Field label="Paid by" htmlFor="sp-method">
          <select id="sp-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Received by" required htmlFor="sp-by" hint="The person who took the money.">
          <input id="sp-by" className={inputClass} value={f.receivedByName} onChange={(e) => setF({ ...f, receivedByName: e.target.value })} />
        </Field>
        <Field label={f.paymentMethod === "CASH" ? "Reference (optional)" : "Transaction reference"} required={f.paymentMethod !== "CASH"} htmlFor="sp-ref">
          <input id="sp-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
        </Field>
      </div>
      {over ? (
        <label className="flex items-start gap-2 rounded-md bg-violet-50 p-2 text-sm text-violet-900">
          <input type="checkbox" className="mt-0.5" checked={f.overpay} onChange={(e) => setF({ ...f, overpay: e.target.checked })} />
          The guest pays {formatMoney(amount - Math.max(0, balance))} more than the balance (it will show as overpaid).
        </label>
      ) : null}
      <Field label="Remarks" htmlFor="sp-remarks"><input id="sp-remarks" className={inputClass} value={f.remarks} onChange={(e) => setF({ ...f, remarks: e.target.value })} placeholder="e.g. deposit, balance at check-out" /></Field>
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach proof (receipt, transfer confirmation)" />
    </FormDialog>
  );
}

function RefundDialog({ departmentId, stay, onClose }) {
  const record = useRecorder();
  const max = stay.status === "CANCELLED" ? stay.figures.paid : Math.max(0, -stay.figures.balance);
  const [f, setF] = useState({ amount: max > 0 ? String(max) : "", paymentMethod: "CASH", reason: stay.status === "CANCELLED" ? "Booking cancelled" : "Paid too much", reference: "", files: [] });
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const valid = amount > 0 && amount <= max && f.reason.trim();
  const submit = async () => {
    setBusy(true);
    const spec = stayRefundSpec(departmentId, stay, { amount, paymentMethod: f.paymentMethod, reason: f.reason.trim(), reference: f.reference.trim() });
    const out = await record({ ...spec, files: f.files }, { success: (r) => `Refund ${r.referenceNo} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Refund for ${stay.referenceNo}`} description={`At most ${formatMoney(max)} can be given back.`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record the refund</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount given back (FCFA)" required htmlFor="sr-amount"><input id="sr-amount" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
        <Field label="Given back by" htmlFor="sr-method">
          <select id="sr-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Why" required htmlFor="sr-reason"><input id="sr-reason" className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} /></Field>
      <Field label="Reference (optional)" htmlFor="sr-ref"><input id="sr-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} />
    </FormDialog>
  );
}

/** Changes a booking: guest, apartment and dates, price (with a reason). */
function EditDialog({ departmentId, stay, rooms, todayKey, onClose }) {
  const record = useRecorder();
  const inRoom = stay.status === "CHECKED_IN";
  const [f, setF] = useState({ guestName: stay.guestName, guestPhone: stay.guestPhone || "", guestEmail: stay.guestEmail || "", guestCount: stay.guestCount ?? "", roomId: stay.roomId, checkInKey: stay.checkInKey, checkOutKey: stay.checkOutKey, bookingType: stay.bookingType, totalPrice: String(stay.totalPrice), priceNote: "", notes: stay.notes || "" });
  const [busy, setBusy] = useState(false);
  const room = rooms.find((r) => r.id === f.roomId);
  const nights = nightsOf(f.checkInKey, f.checkOutKey);
  const price = Number(f.totalPrice) || 0;
  const priceChanged = !stay.complimentary && price !== stay.totalPrice;
  const valid = f.guestName.trim() && nights > 0 && (!priceChanged || f.priceNote.trim());
  const submit = async () => {
    setBusy(true);
    const input = { guestName: f.guestName.trim(), guestPhone: f.guestPhone, guestEmail: f.guestEmail, guestCount: f.guestCount || null, notes: f.notes, bookingType: f.bookingType };
    if (!stay.complimentary) Object.assign(input, { roomId: f.roomId, checkInKey: f.checkInKey, checkOutKey: f.checkOutKey, totalPrice: price, priceNote: priceChanged ? f.priceNote.trim() : null });
    const out = await record(stayUpdateSpec(departmentId, stay, input), { success: `${stay.referenceNo} saved.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={`Change ${stay.referenceNo}`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Guest" required htmlFor="se-guest" className="sm:col-span-2"><input id="se-guest" className={inputClass} value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} /></Field>
        <Field label="Phone" htmlFor="se-phone"><input id="se-phone" className={inputClass} value={f.guestPhone} onChange={(e) => setF({ ...f, guestPhone: e.target.value })} /></Field>
        <Field label="Guests" htmlFor="se-count"><input id="se-count" className={inputClass} inputMode="numeric" value={f.guestCount} onChange={(e) => setF({ ...f, guestCount: wholeNumber(e.target.value) })} /></Field>
        <Field label="E-mail" htmlFor="se-email" className="sm:col-span-4"><input id="se-email" className={inputClass} value={f.guestEmail} onChange={(e) => setF({ ...f, guestEmail: e.target.value })} /></Field>
      </div>
      {!stay.complimentary ? (
        <>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Apartment" htmlFor="se-room">
              <select id="se-room" className={selectClass} disabled={inRoom} value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
                {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
              </select>
            </Field>
            <Field label="Arrival" htmlFor="se-in"><input id="se-in" type="date" className={inputClass} disabled={inRoom} min={inRoom ? undefined : todayKey} value={f.checkInKey} onChange={(e) => setF({ ...f, checkInKey: e.target.value })} /></Field>
            <Field label="Departure" htmlFor="se-out" hint={`${nights} night(s)`}><input id="se-out" type="date" className={inputClass} min={addDaysToKey(f.checkInKey, 1)} value={f.checkOutKey} onChange={(e) => setF({ ...f, checkOutKey: e.target.value })} /></Field>
          </div>
          <div className="grid gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
            <Field label="Priced" htmlFor="se-type">
              <select id="se-type" className={selectClass} value={f.bookingType} onChange={(e) => setF({ ...f, bookingType: e.target.value })}>
                {Object.entries(BOOKING_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
              </select>
            </Field>
            <Field label="Price of the stay (FCFA)" htmlFor="se-price" hint={`Usual price for ${nights} night(s): ${formatMoney(suggestedPrice(room, nights, f.bookingType))}`}>
              <input id="se-price" className={inputClass} inputMode="numeric" value={f.totalPrice} onChange={(e) => setF({ ...f, totalPrice: wholeNumber(e.target.value) })} />
            </Field>
            <Field label="Why the price changes" required={priceChanged} htmlFor="se-note"><input id="se-note" className={inputClass} disabled={!priceChanged} value={f.priceNote} onChange={(e) => setF({ ...f, priceNote: e.target.value })} /></Field>
          </div>
        </>
      ) : null}
      <Field label="Notes" htmlFor="se-notes"><textarea id="se-notes" className={textareaClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </FormDialog>
  );
}

/** Check-out: before the planned departure, the stay ends today and its price may change. */
function CheckoutDialog({ departmentId, stay, todayKey, onClose }) {
  const record = useRecorder();
  const early = todayKey < stay.checkOutKey;
  const endKey = todayKey > stay.checkInKey ? todayKey : addDaysToKey(stay.checkInKey, 1);
  const nights = nightsOf(stay.checkInKey, endKey);
  const [f, setF] = useState({ totalPrice: String(stay.totalPrice), priceNote: "" });
  const [busy, setBusy] = useState(false);
  const price = Number(f.totalPrice) || 0;
  const changed = early && !stay.complimentary && price !== stay.totalPrice;
  const balanceAfter = (changed ? price : stay.totalPrice) - stay.figures.paid;
  const submit = async () => {
    setBusy(true);
    const out = await record(stayStepSpec(departmentId, stay, "checkout", changed ? { totalPrice: price, priceNote: f.priceNote.trim() } : {}), { success: `${stay.guestName} checked out.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Check out ${stay.guestName}`} description={early ? `Planned departure ${formatDateKey(stay.checkOutKey)}: leaving early, the stay ends ${formatDateKey(endKey)} (${nights} night(s)).` : `${stay.nights} night(s) in ${stay.room.name}.`} footer={<SubmitButton busy={busy} disabled={changed && !f.priceNote.trim()} onClick={submit}>Check out</SubmitButton>}>
      {early && !stay.complimentary ? (
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Price of the stay (FCFA)" htmlFor="co-price" hint={`Was ${formatMoney(stay.totalPrice)} for ${stay.nights} night(s).`}><input id="co-price" className={inputClass} inputMode="numeric" value={f.totalPrice} onChange={(e) => setF({ ...f, totalPrice: wholeNumber(e.target.value) })} /></Field>
          <Field label="Why the price changes" required={changed} htmlFor="co-note"><input id="co-note" className={inputClass} disabled={!changed} value={f.priceNote} onChange={(e) => setF({ ...f, priceNote: e.target.value })} /></Field>
        </div>
      ) : null}
      {!stay.complimentary ? (
        <p className={`rounded-md p-2 text-sm ${balanceAfter > 0 ? "bg-amber-50 text-amber-900" : balanceAfter < 0 ? "bg-violet-50 text-violet-900" : "bg-emerald-50 text-emerald-900"}`}>
          {balanceAfter > 0 ? `The guest still owes ${formatMoney(balanceAfter)}: record the payment, or it stays owed.` : balanceAfter < 0 ? `The guest paid ${formatMoney(-balanceAfter)} too much: give it back after the check-out.` : "Paid in full."}
        </p>
      ) : null}
    </FormDialog>
  );
}

function CancelDialog({ departmentId, stay, onClose }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(stayCancelSpec(departmentId, stay, reason.trim()), { success: `${stay.referenceNo} cancelled.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Cancel ${stay.referenceNo}`} description={stay.figures.paid > 0 ? `${formatMoney(stay.figures.paid)} was paid: refund what must be given back after cancelling; what is kept counts as income.` : "The nights become free."} footer={<SubmitButton variant="destructive" busy={busy} disabled={!reason.trim()} onClick={submit}>Cancel the booking</SubmitButton>}>
      <Field label="Why" required htmlFor="sc-reason"><textarea id="sc-reason" className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  );
}

/** One booking: guest and stay, its money with receipts and proof, its history; check-in / check-out. */
export function StayDetail({ departmentId, stay, rooms, todayKey, canBook }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(false);
  const base = `/d/${departmentId}/stays/${stay.id}`;
  const f = stay.figures;
  const step = async (s, msg) => {
    setBusy(true);
    await record(stayStepSpec(departmentId, stay, s), { success: msg });
    setBusy(false);
  };
  const voidPayment = (t) => (reason) => record(voidSpec({ departmentId, row: { ...t, methodCode: t.paymentMethod, categoryId: t.type === "BOOKING_PAYMENT" ? "stay-payment" : "stay-refund" }, type: t.type, reason }), { success: `${t.referenceNo} voided.` });
  const open = ["RESERVED", "CONFIRMED", "CHECKED_IN"].includes(stay.status);
  const canRefund = stay.status === "CANCELLED" ? f.paid > 0 : f.balance < 0;
  const money = stay.transactions.filter((t) => ["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(t.type));
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2" data-testid="stay-actions">
        <StatusBadge status={STAY_BADGE[stay.status]} label={STAY_STATUS_LABELS[stay.status]} />
        {!stay.complimentary ? <StatusBadge status={f.paymentStatus} label={PAYMENT_STATUS_LABELS[f.paymentStatus]} /> : <StatusBadge status="INFO" label="Free with a venue package" />}
        <div className="ml-auto flex flex-wrap gap-2 print:hidden">
          {canBook && stay.status === "RESERVED" ? <Button variant="outline" disabled={busy} onClick={() => step("confirm", `${stay.referenceNo} confirmed.`)}><CheckCircle2 className="h-4 w-4" /> Confirm</Button> : null}
          {canBook && ["RESERVED", "CONFIRMED"].includes(stay.status) && stay.checkInKey <= todayKey ? <Button disabled={busy} onClick={() => step("checkin", `${stay.guestName} checked in.`)}><LogIn className="h-4 w-4" /> Check in</Button> : null}
          {canBook && stay.status === "CHECKED_IN" ? <Button onClick={() => setDialog("checkout")}><LogOut className="h-4 w-4" /> Check out</Button> : null}
          {canBook && open ? <Button variant="outline" onClick={() => setDialog("edit")}><Pencil className="h-4 w-4" /> Change</Button> : null}
          {canBook && ["RESERVED", "CONFIRMED"].includes(stay.status) && !stay.complimentary ? <Button variant="ghost" className="text-rose-700" onClick={() => setDialog("cancel")}><XCircle className="h-4 w-4" /> Cancel</Button> : null}
        </div>
      </div>

      {!stay.complimentary ? (
        <div className="grid gap-4 sm:grid-cols-4">
          <StatCard label="Price of the stay" value={formatMoney(f.total)} hint={`${stay.nights} night(s) · ${BOOKING_TYPE_LABELS[stay.bookingType] || stay.bookingType}`} />
          <StatCard tone="in" label="Paid" value={formatMoney(f.paid)} hint={f.refunded ? `Refunded ${formatMoney(f.refunded)}` : undefined} />
          <StatCard tone={f.balance > 0 ? "warn" : "default"} label={f.balance < 0 ? "Paid too much" : "Balance due"} value={formatMoney(Math.abs(f.balance))} />
          <StatCard label="Apartment" value={stay.room.name} hint={stay.room.roomType || undefined} icon={BedDouble} />
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Guest and stay">
          <KeyValues
            rows={[
              { label: "Guest", value: stay.guestName },
              { label: "Contact", value: [stay.guestPhone, stay.guestEmail].filter(Boolean).join(" · ") || "—" },
              { label: "Guests", value: stay.guestCount ?? "—" },
              { label: "Arrival", value: formatDateKey(stay.checkInKey) },
              { label: "Departure", value: formatDateKey(stay.checkOutKey) },
              { label: "Checked in", value: when(stay.checkedInAt) },
              { label: "Checked out", value: when(stay.checkedOutAt) },
              stay.priceNote ? { label: "Price note", value: stay.priceNote } : null,
              stay.sourceVenueBooking ? { label: "Venue package", value: <Link className="underline" href={`/d/${stay.sourceVenueBooking.departmentId}/bookings/${stay.sourceVenueBooking.id}`}>{stay.sourceVenueBooking.referenceNo} · {stay.sourceVenueBooking.department?.name}</Link> } : null,
              { label: "Booked", value: `${when(stay.createdAt)}${stay.createdBy ? ` by ${stay.createdBy.name}` : ""}` },
              stay.cancelReason ? { label: "Cancelled", value: `${when(stay.cancelledAt)} · ${stay.cancelReason}` } : null,
              stay.notes ? { label: "Notes", value: stay.notes } : null,
            ]}
          />
        </Section>
        <Section title="History">
          <ol className="space-y-1.5 text-sm" data-testid="stay-history">
            {stay.history.map((h) => (
              <li key={h.id} className="flex justify-between gap-3"><span>{h.action.replace(/^STAY_/, "").replace(/_/g, " ").toLowerCase()}{h.by ? ` · ${h.by}` : ""}</span><span className="shrink-0 text-slate-500">{when(h.createdAt)}</span></li>
            ))}
          </ol>
        </Section>
      </div>

      {!stay.complimentary ? (
        <Section
          title="Payments and receipts"
          description="Every payment has a receipt; who received it and how is recorded."
          actions={
            canBook ? (
              <>
                {stay.status !== "CANCELLED" ? <Button size="sm" onClick={() => setDialog("pay")}><Plus className="h-4 w-4" /> Record a payment</Button> : null}
                {canRefund ? <Button size="sm" variant="outline" onClick={() => setDialog("refund")}><Undo2 className="h-4 w-4" /> Refund</Button> : null}
              </>
            ) : null
          }
        >
          <DataTable
            dense
            rows={money}
            empty="No payment yet."
            columns={[
              { key: "ref", label: "Receipt", render: (t) => <Link className="font-medium hover:underline" href={`${base}/receipt/${t.id}`}>{t.referenceNo}</Link> },
              { key: "date", label: "Date and time", render: (t) => when(t.date) },
              { key: "type", label: "", render: (t) => (t.type === "BOOKING_REFUND" ? "Refund" : "Payment") },
              { key: "method", label: "Method", render: (t) => `${METHOD_LABEL[t.paymentMethod] || t.paymentMethod}${t.reference ? ` · ${t.reference}` : ""}` },
              { key: "by", label: "Received / given by", render: (t) => t.receivedByName || t.user?.name },
              { key: "proof", label: "Proof", render: (t) => (t.proofs?.length ? t.proofs.map((p) => <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer" className="mr-1 inline-flex items-center gap-1 text-xs underline"><Paperclip className="h-3 w-3" />{p.fileName}</a>) : "—") },
              { key: "amount", label: "Amount", align: "right", render: (t) => (t.status === "VOIDED" ? <span className="text-slate-400 line-through">{formatMoney(t.amount)}</span> : <Money value={t.type === "BOOKING_REFUND" ? -t.amount : t.amount} />) },
              {
                key: "actions",
                label: "",
                align: "right",
                render: (t) =>
                  t.status === "VOIDED" ? <span className="text-xs text-rose-700">Void · {t.voidReason}</span> : (
                    <span className="inline-flex gap-1">
                      <Link href={`${base}/receipt/${t.id}`} aria-label={`Print receipt ${t.referenceNo}`}><Button size="icon-sm" variant="ghost"><Printer className="h-4 w-4" /></Button></Link>
                      {canBook ? <VoidButton onVoid={voidPayment(t)} reference={t.referenceNo} what="payment" /> : null}
                    </span>
                  ),
              },
            ]}
          />
        </Section>
      ) : null}

      {dialog === "pay" ? <PaymentDialog departmentId={departmentId} stay={stay} onClose={() => setDialog(null)} /> : null}
      {dialog === "refund" ? <RefundDialog departmentId={departmentId} stay={stay} onClose={() => setDialog(null)} /> : null}
      {dialog === "edit" ? <EditDialog departmentId={departmentId} stay={stay} rooms={rooms} todayKey={todayKey} onClose={() => setDialog(null)} /> : null}
      {dialog === "checkout" ? <CheckoutDialog departmentId={departmentId} stay={stay} todayKey={todayKey} onClose={() => setDialog(null)} /> : null}
      {dialog === "cancel" ? <CancelDialog departmentId={departmentId} stay={stay} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
