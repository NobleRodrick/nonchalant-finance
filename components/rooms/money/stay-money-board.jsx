"use client";

import Link from "next/link";
import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { BadgeCheck, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, StatCard, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { useOfflineContext, useRecorder } from "@/lib/offline/react";
import { voidSpec } from "@/lib/offline/specs";
import { expenseValidateSpec, stayMoneySpec } from "@/lib/rooms/specs";
import { navigateTo } from "@/lib/navigation";
import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";

const TYPES = [
  ["EXPENSE", "Expense"],
  ["OTHER_EXPENSE", "Other expense (taxes, fees …)"],
  ["OTHER_INCOME", "Other income"],
];
const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"]];

/** An expense (or other income): apartment or shared, category, description, amount, who was paid, who authorized it, proof. */
function RecordDialog({ departmentId, rooms, categories, onClose }) {
  const record = useRecorder();
  const me = useOfflineContext();
  const [f, setF] = useState({ type: "EXPENSE", roomId: "", category: categories.EXPENSE[0]?.id || "", amount: "", paymentMethod: "CASH", counterparty: "", reference: "", description: "", authorizedByName: me.userName || "", files: [] });
  const [busy, setBusy] = useState(false);
  const isExpense = f.type !== "OTHER_INCOME";
  const list = categories[f.type] || [];
  const valid = Number(f.amount) > 0 && f.category && f.description.trim() && (!isExpense || (f.counterparty.trim() && f.authorizedByName.trim()));
  const submit = async () => {
    setBusy(true);
    const room = rooms.find((r) => r.id === f.roomId);
    const spec = stayMoneySpec(departmentId, { ...f, categoryLabel: list.find((c) => c.id === f.category)?.label, roomName: room?.name, description: f.description.trim(), counterparty: f.counterparty.trim(), authorizedByName: isExpense ? f.authorizedByName.trim() : null });
    const out = await record({ ...spec, files: f.files }, { success: (r) => `${r.referenceNo} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={isExpense ? "Record an expense" : "Record other income"} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record {Number(f.amount) ? formatMoney(f.amount) : ""}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Kind" htmlFor="sm-type">
          <select id="sm-type" className={selectClass} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value, category: categories[e.target.value]?.[0]?.id || "" })}>
            {TYPES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Apartment" htmlFor="sm-room" hint="Shared: a cost of the whole house (not one apartment).">
          <select id="sm-room" className={selectClass} value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            <option value="">Shared by the house</option>
            {rooms.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Category" required htmlFor="sm-cat">
          <select id="sm-cat" className={selectClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {list.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
          </select>
        </Field>
      </div>
      <Field label="Description" required htmlFor="sm-desc"><input id="sm-desc" className={inputClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder={isExpense ? "e.g. new shower head, monthly cleaning" : "e.g. laundry for a guest"} /></Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Amount (FCFA)" required htmlFor="sm-amount"><input id="sm-amount" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
        <Field label={isExpense ? "Paid by" : "Received by"} htmlFor="sm-method">
          <select id="sm-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
            {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Field>
        <Field label="Reference (optional)" htmlFor="sm-ref"><input id="sm-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Receipt or transaction no." /></Field>
        <Field label={isExpense ? "Person / vendor paid" : "Paid by (who)"} required={isExpense} htmlFor="sm-party"><input id="sm-party" className={inputClass} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></Field>
        {isExpense ? <Field label="Authorized by" required htmlFor="sm-auth" hint="Who approved spending it."><input id="sm-auth" className={inputClass} value={f.authorizedByName} onChange={(e) => setF({ ...f, authorizedByName: e.target.value })} /></Field> : null}
      </div>
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach the receipt or invoice" />
    </FormDialog>
  );
}

function ValidateDialog({ departmentId, row, onClose }) {
  const record = useRecorder();
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(expenseValidateSpec(departmentId, row, note.trim()), { success: `${row.referenceNo} validated.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Validate ${row.referenceNo}`} description={`${row.description} · ${formatMoney(row.amount)} · paid to ${row.counterparty || "—"} · authorized by ${row.authorizedBy || "—"} · recorded by ${row.recordedBy}`} footer={<SubmitButton busy={busy} onClick={submit}>Validate</SubmitButton>}>
      {!row.proofs.length ? <p className="rounded-md bg-amber-50 p-2 text-sm text-amber-900">No receipt is attached to this expense.</p> : null}
      <Field label="Note (optional)" htmlFor="ev-note"><input id="ev-note" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </FormDialog>
  );
}

/** The records of the period with their apartment, details, proof and validation; filters by apartment and validation. */
export function StayMoneyBoard({ departmentId, isBoss, canRecord, canVoid, currentUserId, filters, pendingCount, summary, records, rooms, categories }) {
  const record = useRecorder();
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [dialog, setDialog] = useState(null);
  const base = `/d/${departmentId}`;
  const setFilter = (patch) => {
    const p = new URLSearchParams(search.toString());
    Object.entries(patch).forEach(([k, v]) => (v ? p.set(k, v) : p.delete(k)));
    navigateTo(router, `${pathname}${p.toString() ? `?${p}` : ""}`);
  };
  const voidRow = (r) => (reason) => record(voidSpec({ departmentId, row: r, type: r.type, reason }), { success: `${r.referenceNo} voided.` });
  const canValidate = (r) => ["EXPENSE", "OTHER_EXPENSE"].includes(r.type) && !r.voided && !r.validatedAt && (isBoss || r.recordedById !== currentUserId);
  const columns = [
    { key: "ref", label: "Ref.", render: (r) => <span className="font-medium">{r.referenceNo}</span> },
    { key: "when", label: "Date", render: (r) => <span className="whitespace-nowrap">{formatDateKey(r.dateKey, { weekday: false })} {r.time}</span> },
    { key: "apt", label: "Apartment", render: (r) => r.room?.name || (r.direction === "out" ? <span className="text-slate-500">Shared</span> : "—") },
    {
      key: "what",
      label: "What",
      render: (r) => (
        <span>
          <span className="block">{r.stay ? <Link className="underline" href={`${base}/stays/${r.stay.id}`}>{r.typeLabel} · {r.stay.referenceNo} · {r.stay.guestName}</Link> : `${r.category}`}</span>
          <span className="block text-xs text-slate-500">{r.description}{r.counterparty && !r.stay ? ` · ${r.direction === "out" ? "paid to" : "from"} ${r.counterparty}` : ""}</span>
        </span>
      ),
    },
    { key: "method", label: "Method", render: (r) => `${r.method}${r.reference ? ` · ${r.reference}` : ""}` },
    { key: "people", label: "People", render: (r) => <span className="text-xs">{r.receivedBy ? `Received by ${r.receivedBy}` : `By ${r.recordedBy}`}{r.authorizedBy ? <span className="block">Authorized by {r.authorizedBy}</span> : null}</span> },
    { key: "proof", label: "Proof", render: (r) => (r.proofs.length ? r.proofs.map((p) => <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline"><Paperclip className="h-3 w-3" />{p.fileName}</a>) : <span className="text-xs text-slate-400">—</span>) },
    { key: "amount", label: "Amount", align: "right", render: (r) => (r.voided ? <span className="text-slate-400 line-through">{formatMoney(r.amount)}</span> : <Money value={r.direction === "in" ? r.amount : -r.amount} />) },
    {
      key: "check",
      label: "Validation",
      render: (r) =>
        !["EXPENSE", "OTHER_EXPENSE"].includes(r.type) ? null : r.voided ? <span className="text-xs text-rose-700">Void · {r.voidReason}</span> : r.validatedAt ? (
          <span className="inline-flex items-center gap-1 text-xs text-emerald-800" title={r.validationNote || ""}><BadgeCheck className="h-3.5 w-3.5" /> {r.validatedBy}</span>
        ) : canValidate(r) ? (
          <Button size="sm" variant="outline" onClick={() => setDialog({ validate: r })}>Validate</Button>
        ) : (
          <StatusBadge status="PENDING" label="To validate" />
        ),
    },
    { key: "void", label: "", align: "right", render: (r) => (canVoid && !r.voided && !r.stay ? <VoidButton onVoid={voidRow(r)} reference={r.referenceNo} /> : null) },
  ];
  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="in" label="Received from guests" value={formatMoney(summary.bookingPayments)} hint={`Cash ${formatMoney(summary.receivedByMethod.CASH)} · MoMo ${formatMoney(summary.receivedByMethod.MOMO)}${summary.bookingRefunds ? ` · refunded ${formatMoney(summary.bookingRefunds)}` : ""}`} />
        <StatCard label="Other income" value={formatMoney(summary.otherIncome)} />
        <StatCard tone="out" label="Expenses" value={formatMoney(summary.expenses)} hint={summary.assetPurchases ? `+ ${formatMoney(summary.assetPurchases)} furniture & equipment bought (investment)` : undefined} />
        <StatCard tone={pendingCount ? "warn" : "default"} label="Expenses to validate" value={pendingCount} hint="All periods" href={pendingCount ? `${base}/money?pending=1&period=year` : undefined} />
      </div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Apartment" htmlFor="mf-room">
          <select id="mf-room" className={selectClass} value={filters.room} onChange={(e) => setFilter({ room: e.target.value })}>
            <option value="">All</option>
            <option value="shared">Shared by the house</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <label className="flex h-9 items-center gap-2 text-sm"><input type="checkbox" checked={filters.pending} onChange={(e) => setFilter({ pending: e.target.checked ? "1" : "" })} /> Only expenses to validate</label>
        {canRecord ? <Button className="ml-auto" onClick={() => setDialog({ record: true })}><Plus className="h-4 w-4" /> Record an expense or income</Button> : null}
      </div>
      <DataTable columns={columns} rows={records} empty="Nothing recorded in this period." dense />
      {dialog?.record ? <RecordDialog departmentId={departmentId} rooms={rooms} categories={categories} onClose={() => setDialog(null)} /> : null}
      {dialog?.validate ? <ValidateDialog departmentId={departmentId} row={dialog.validate} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
