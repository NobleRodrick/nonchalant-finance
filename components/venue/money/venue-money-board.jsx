"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, StatCard, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { usePendingEffects, useRecorder } from "@/lib/offline/react";
import { moneySpec, voidSpec } from "@/lib/offline/specs";
import { categoriesFor, categoryLabel } from "@/data/categories";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const ENTRY = {
  EXPENSE: { title: "Record an expense", counterparty: "Paid to", event: true },
  OTHER_EXPENSE: { title: "Record another expense", counterparty: "Paid to", event: false },
  OTHER_INCOME: { title: "Record other income", counterparty: "Received from", event: true },
};

function EntryDialog({ type, departmentId, dateKey, bookings, onClose }) {
  const record = useRecorder();
  const cats = categoriesFor(type, "EVENT_VENUE");
  const cfg = ENTRY[type];
  const [f, setF] = useState({ amount: "", category: cats[0]?.id || "", paymentMethod: "CASH", counterparty: "", reference: "", description: "", bookingId: "", files: [] });
  const [busy, setBusy] = useState(false);
  const valid = Number(f.amount) > 0 && f.category;
  const booking = bookings.find((b) => b.id === f.bookingId);
  const submit = async () => {
    setBusy(true);
    const spec = moneySpec({ departmentId, dateKey, type, amount: f.amount, category: f.category, categoryLabel: categoryLabel(f.category), paymentMethod: f.paymentMethod, counterparty: f.counterparty, reference: f.reference, description: f.description, bookingId: f.bookingId || null, bookingRef: booking?.label.split(" · ")[0] || null });
    const out = await record({ ...spec, files: f.files }, { success: (r) => `${r.referenceNo} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={cfg.title} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record {f.amount ? formatMoney(f.amount) : ""}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Amount (FCFA)" required htmlFor="vm-amount">
          <input id="vm-amount" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
        </Field>
        <Field label="Category" required htmlFor="vm-category">
          <select id="vm-category" className={selectClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
        <Field label="Paid / received by" htmlFor="vm-method">
          <select id="vm-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            <option value="CASH">Cash</option>
            <option value="MOMO">Mobile Money</option>
            <option value="BANK_TRANSFER">Bank</option>
          </select>
        </Field>
        <Field label={cfg.counterparty} htmlFor="vm-counterparty">
          <input id="vm-counterparty" className={inputClass} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} />
        </Field>
      </div>
      {cfg.event ? (
        <Field label="Event (optional)" htmlFor="vm-booking" hint="Name the booking when the expense is for one event: it counts in that event's profitability.">
          <select id="vm-booking" className={selectClass} value={f.bookingId} onChange={(e) => setF({ ...f, bookingId: e.target.value })}>
            <option value="">The hall in general</option>
            {bookings.map((b) => <option key={b.id} value={b.id}>{b.label}</option>)}
          </select>
        </Field>
      ) : null}
      <Field label="Description" htmlFor="vm-description">
        <input id="vm-description" className={inputClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} />
      </Field>
      <Field label="Reference (optional)" htmlFor="vm-reference">
        <input id="vm-reference" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
      </Field>
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} />
    </FormDialog>
  );
}

/** The day's money of an event venue, with this computer's records not sent yet. */
export function VenueMoneyBoard({ departmentId, dateKey, renderedAt, canRecord, canVoid, summary, records, bookings }) {
  const record = useRecorder();
  const effects = usePendingEffects(departmentId, renderedAt);
  const [entry, setEntry] = useState(null);
  const pending = useMemo(
    () =>
      effects
        .filter((e) => e.op.kind === "money.record" || e.op.kind === "venue.payment.record" || e.op.kind === "venue.refund.record")
        .map((e) => {
          const op = e.op;
          const type = op.kind === "money.record" ? op.input.type : op.kind === "venue.payment.record" ? "BOOKING_PAYMENT" : "BOOKING_REFUND";
          return {
            id: op.key,
            referenceNo: "Not sent yet",
            type,
            direction: ["BOOKING_PAYMENT", "OTHER_INCOME"].includes(type) ? "in" : "out",
            time: op.meta?.time,
            category: op.kind === "money.record" ? categoryLabel(op.input.category) : type === "BOOKING_PAYMENT" ? "Booking payment" : "Booking refund",
            method: op.input.paymentMethod,
            description: op.meta?.summary,
            amount: Number(op.input.amount),
            pending: true,
          };
        }),
    [effects]
  );
  const voided = new Set(effects.filter((e) => e.op.kind === "record.void").map((e) => e.op.input.transactionId));
  const rows = [...pending, ...records.map((r) => (voided.has(r.id) ? { ...r, voided: true, voidReason: "Not sent yet" } : r))];
  const add = (type) => rows.filter((r) => r.pending && r.type === type).reduce((s, r) => s + r.amount, 0);
  const totals = {
    payments: summary.bookingPayments + add("BOOKING_PAYMENT"),
    refunds: summary.bookingRefunds + add("BOOKING_REFUND"),
    expenses: summary.expenses + summary.otherExpenses + add("EXPENSE") + add("OTHER_EXPENSE"),
    otherIncome: summary.otherIncome + add("OTHER_INCOME"),
  };
  const columns = [
    { key: "time", label: "Time", render: (r) => <span className="tabular-nums text-xs">{r.time}</span> },
    { key: "ref", label: "Reference", render: (r) => <span className={cn("font-medium", r.pending && "text-amber-700")}>{r.referenceNo}</span> },
    { key: "what", label: "What", render: (r) => <span>{r.category}{r.booking ? <Link className="block text-xs underline" href={`/d/${departmentId}/bookings/${r.booking.id}`}>{r.booking.label}</Link> : null}{r.description && !r.pending ? <span className="block text-xs text-slate-500">{r.description}</span> : null}</span> },
    { key: "method", label: "Method", render: (r) => <span>{r.method}{r.receivedBy ? <span className="block text-xs text-slate-500">{r.receivedBy}</span> : null}</span> },
    { key: "amount", label: "Amount", align: "right", render: (r) => <span className={cn(r.voided && "line-through opacity-60")}><Money value={r.direction === "in" ? r.amount : -r.amount} tone={r.direction} />{r.voided ? <span className="block text-[11px] text-rose-700">Void: {r.voidReason}</span> : null}</span> },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (r) => (canVoid && !r.pending && !r.voided && !["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(r.type) ? <VoidButton reference={r.referenceNo} onVoid={(reason) => record(voidSpec({ departmentId, dateKey, row: r, type: r.type, reason }), { success: `${r.referenceNo} voided.` })} /> : null),
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Received from clients" value={<Money value={totals.payments} />} tone="in" hint={`Cash ${formatMoney(summary.receivedByMethod.CASH)} · MoMo ${formatMoney(summary.receivedByMethod.MOMO)} · Bank ${formatMoney(summary.receivedByMethod.BANK_TRANSFER)}`} />
        <StatCard label="Given back to clients" value={<Money value={totals.refunds} />} />
        <StatCard label="Other income" value={<Money value={totals.otherIncome} />} />
        <StatCard label="Expenses" value={<Money value={totals.expenses} />} tone="out" />
      </div>
      <Section
        title="Records of the day"
        description="Payments and refunds are recorded on their booking (Bookings); voiding them is done there too."
        actions={
          canRecord ? (
            <span className="flex flex-wrap gap-2">
              <Button size="sm" onClick={() => setEntry("EXPENSE")}><Plus className="h-4 w-4" /> Expense</Button>
              <Button size="sm" variant="outline" onClick={() => setEntry("OTHER_EXPENSE")}><Plus className="h-4 w-4" /> Other expense</Button>
              <Button size="sm" variant="outline" onClick={() => setEntry("OTHER_INCOME")}><Plus className="h-4 w-4" /> Other income</Button>
            </span>
          ) : null
        }
      >
        <DataTable columns={columns} rows={rows} empty="Nothing recorded on this day." rowClassName={(r) => (r.pending ? "bg-amber-50/40" : "")} />
      </Section>
      {entry ? <EntryDialog type={entry} departmentId={departmentId} dateKey={dateKey} bookings={bookings} onClose={() => setEntry(null)} /> : null}
    </div>
  );
}
