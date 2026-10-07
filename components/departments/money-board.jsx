"use client";

import Link from "next/link";
import { useState } from "react";
import { CheckCircle2, Minus, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, StatCard, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { FilterBar } from "@/components/kit/filter-bar";
import { ExportMenu } from "@/components/kit/export-menu";
import { useRecorder } from "@/lib/offline/react";
import { voidSpec } from "@/lib/offline/specs";
import { expenseApproveSpec } from "@/lib/rental/specs";
import { attachmentUrl } from "@/lib/attachments-url";
import { exportFileName } from "@/lib/export/table-export";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { METHODS } from "@/components/kit/payment-fields";
import { formatMoney as fm } from "@/lib/format";

/** The record a money entry belongs to, from the link select ("order:<id>", "unit:<id>", "building:<id>", "batch:<id>"). */
function linkInput(value) {
  const [k, id] = String(value || "").split(":");
  return { rentalOrderId: k === "order" ? id : null, propertyUnitId: k === "unit" ? id : null, buildingId: k === "building" ? id : null, ...(k === "batch" ? { farmBatchId: id } : {}) };
}

function moneySpecOf(departmentId, f, type, categoryLabel, linkLabel, files) {
  return {
    kind: "money.record",
    label: type === "OTHER_INCOME" ? "Other income" : "Expense",
    departmentId,
    input: { departmentId, type, amount: Number(f.amount), category: f.category, paymentMethod: f.paymentMethod, counterparty: f.counterparty.trim(), reference: f.reference, description: f.description.trim(), ...linkInput(f.link), spentByName: f.spentByName, authorizedByName: f.authorizedByName },
    meta: { summary: `${categoryLabel || f.category} · ${fm(Number(f.amount))}${linkLabel ? ` · ${linkLabel}` : ""}` },
    ...(files?.length ? { files } : {}),
  };
}

function MoneyDialog({ departmentId, type, categories, link, currentUserName, onClose }) {
  const record = useRecorder();
  const out = type !== "OTHER_INCOME";
  const [f, setF] = useState({ category: categories[type]?.[0]?.id || "", amount: "", paymentMethod: "CASH", counterparty: "", reference: "", description: "", link: link?.initial || "", spentByName: currentUserName || "", authorizedByName: "" });
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const valid = Number(f.amount) > 0 && f.category && (!out || (f.description.trim() && f.counterparty.trim()));
  const submit = async () => {
    setBusy(true);
    const res = await record(
      moneySpecOf(departmentId, f, type, categories[type].find((c) => c.id === f.category)?.label, link?.options.find((o) => o.value === f.link)?.label, files),
      { success: (r) => `${r.referenceNo} recorded.` }
    );
    setBusy(false);
    if (res) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={out ? "Record an expense" : "Record other income"} description={out ? "It counts at once; someone else approves it afterwards." : undefined} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record {f.amount ? formatMoney(Number(f.amount)) : ""}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Category" required htmlFor="mn-cat"><select id="mn-cat" className={selectClass} value={f.category} onChange={set("category")}>{(categories[type] || []).map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}</select></Field>
        <Field label="Amount (FCFA)" required htmlFor="mn-amt"><input id="mn-amt" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
        <Field label={out ? "Paid by" : "Received by"} htmlFor="mn-m"><select id="mn-m" className={selectClass} value={f.paymentMethod} onChange={set("paymentMethod")}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label={out ? "Paid to (supplier / payee)" : "From"} required={out} htmlFor="mn-cp"><input id="mn-cp" className={inputClass} value={f.counterparty} onChange={set("counterparty")} /></Field>
        {out ? <Field label="Spent by" htmlFor="mn-by"><input id="mn-by" className={inputClass} value={f.spentByName} onChange={set("spentByName")} /></Field> : null}
        <Field label="Reference" htmlFor="mn-ref"><input id="mn-ref" className={inputClass} value={f.reference} onChange={set("reference")} placeholder="Receipt no., MoMo id" /></Field>
        {link ? <Field label={link.label} htmlFor="mn-ev" className="sm:col-span-2" hint={link.hint}><select id="mn-ev" className={selectClass} value={f.link} onChange={set("link")}><option value="">{link.none}</option>{link.options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</select></Field> : null}
        {out ? <Field label="Authorized by" htmlFor="mn-auth"><input id="mn-auth" className={inputClass} value={f.authorizedByName} onChange={set("authorizedByName")} /></Field> : null}
      </div>
      <Field label="Description" required={out} htmlFor="mn-desc"><textarea id="mn-desc" className={textareaClass} rows={2} value={f.description} onChange={set("description")} placeholder={out ? "What was paid for" : ""} /></Field>
      <ProofUpload value={files} onChange={setFiles} label="Attach the receipt" />
    </FormDialog>
  );
}

const EXPORT_COLUMNS = [
  { label: "Date", value: "dateKey" },
  { label: "No.", value: "referenceNo" },
  { label: "Kind", value: "typeLabel" },
  { label: "Category", value: "category" },
  { label: "Description", value: "description" },
  { label: "Payee / from", value: "counterparty" },
  { label: "For", value: (r) => r.link?.label || "" },
  { label: "Method", value: "method" },
  { label: "Reference", value: "reference" },
  { label: "In (FCFA)", value: (r) => (r.direction === "in" && !r.voided ? r.amount : "") },
  { label: "Out (FCFA)", value: (r) => (r.direction === "out" && !r.voided ? r.amount : "") },
  { label: "Recorded by", value: "recordedBy" },
  { label: "Spent / received by", value: "spentBy" },
  { label: "Approved by", value: "validatedBy" },
  { label: "Status", value: (r) => (r.voided ? `Void: ${r.voidReason}` : r.needsApproval ? "Waiting for approval" : "") },
];

/**
 * Money in and out of a period, for the department types whose customers pay on their own page
 * (event rental: bookings; property rental: contracts): totals, filters, every record with what
 * it is for (an event, an office or a building), payee, proof and approval; expenses and other
 * income are recorded here. `link`: { label, none, hint, filter, options: [{ value, label }] }
 * (values "order:<id>", "unit:<id>", "building:<id>"); `labels`: { customers, investments }.
 */
export function MoneyBoard({ departmentId, currentUserName, canRecord, canApprove, canVoid, canExport, currentUserId, isBoss, filters, pendingCount, periodKey, summary, records, link, categories, labels = {}, kinds }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const s = summary;
  const received = s.bookingPayments + s.otherIncome - s.bookingRefunds;
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label={labels.customers || "From customers"} value={formatMoney(s.bookingPayments - s.bookingRefunds)} hint={s.bookingRefunds ? `after ${formatMoney(s.bookingRefunds)} refunded` : undefined} tone="in" />
        <StatCard label="Other income" value={formatMoney(s.otherIncome)} />
        <StatCard label="Expenses" value={formatMoney(s.expenses)} tone="out" />
        <StatCard label={labels.investments || "Items bought"} value={formatMoney(s.investments)} hint={labels.investmentsHint || "investments, not expenses"} />
        <StatCard label="Net cash" value={formatMoney(received - s.expenses - (labels.investmentsIn ? -s.investments : s.investments))} hint={`cash in the drawer ${formatMoney(s.cash.in - s.cash.out)}`} tone="dark" />
      </div>
      {pendingCount ? (
        <div className="flex items-center justify-between rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900 print:hidden">
          <span>{pendingCount} expense(s) waiting for approval.</span>
          <Link className="font-medium underline" href={filters.pending ? `/d/${departmentId}/money` : `/d/${departmentId}/money?pending=1`}>{filters.pending ? "Show the period" : "Show them"}</Link>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar
          fields={[
            { name: "kind", label: "Show", type: "select", options: kinds || [{ value: "", label: "Everything" }, { value: "in", label: "Money in" }, { value: "out", label: "Expenses and refunds" }, { value: "purchases", label: "Purchases of items" }] },
            ...(link ? [{ name: link.filter, label: link.label, type: "select", options: [{ value: "", label: link.every }, ...link.options.map((o) => ({ value: o.value.split(":")[1], label: o.label }))] }] : []),
          ]}
        />
        <div className="flex flex-wrap gap-2 print:hidden">
          {canRecord ? <Button onClick={() => setDialog("EXPENSE")}><Minus className="h-4 w-4" /> Record an expense</Button> : null}
          {canRecord ? <Button variant="outline" onClick={() => setDialog("OTHER_INCOME")}><Plus className="h-4 w-4" /> Other income</Button> : null}
          {canExport ? <ExportMenu fileName={exportFileName("money", periodKey)} sheets={{ name: "Money", columns: EXPORT_COLUMNS, rows: records }} /> : null}
        </div>
      </div>
      <Section bodyClassName="p-0">
        <DataTable
          rows={records}
          empty="Nothing recorded in this period."
          rowClassName={(r) => (r.voided ? "opacity-50" : "")}
          columns={[
            { key: "d", label: "Date", render: (r) => <span className="whitespace-nowrap">{formatDateKey(r.dateKey, { weekday: false })}<span className="block text-xs text-slate-400">{r.time} · {r.referenceNo}</span></span> },
            { key: "w", label: "What", render: (r) => <div className={cn(r.voided && "line-through")}><div className="font-medium">{r.typeLabel} · {r.category}</div><div className="max-w-80 text-xs text-slate-500">{[r.description, r.counterparty].filter(Boolean).join(" · ")}</div></div> },
            ...(link ? [{ key: "e", label: link.label, render: (r) => (r.link ? (r.link.href ? <Link className="underline" href={r.link.href}>{r.link.label}</Link> : r.link.label) : <span className="text-slate-400">—</span>) }] : []),
            { key: "m", label: "Method", render: (r) => <span className="text-xs">{r.method}{r.reference ? <span className="block text-slate-400">{r.reference}</span> : null}</span> },
            { key: "who", label: "People", render: (r) => <span className="text-xs text-slate-600">{r.recordedBy}{r.spentBy && r.spentBy !== r.recordedBy ? <span className="block">by {r.spentBy}</span> : null}{r.validatedBy ? <span className="block text-emerald-700">approved: {r.validatedBy}</span> : null}</span> },
            { key: "a", label: "Amount", align: "right", render: (r) => <Money value={r.direction === "in" ? r.amount : -r.amount} tone={r.direction} suffix={false} className={cn(r.voided && "line-through")} /> },
            {
              key: "act",
              label: "",
              align: "right",
              render: (r) => (
                <span className="inline-flex items-center gap-1">
                  {r.proofs.map((p) => <a key={p.id} href={attachmentUrl(p.id)} target="_blank" rel="noreferrer" aria-label={`Proof ${p.fileName}`} className="text-slate-500 hover:text-slate-900"><Paperclip className="h-4 w-4" /></a>)}
                  {r.needsApproval && canApprove && (isBoss || r.recordedById !== currentUserId) ? <Button size="sm" variant="outline" onClick={() => record(expenseApproveSpec(departmentId, r), { success: `${r.referenceNo} approved.` })} aria-label={`Approve ${r.referenceNo}`}><CheckCircle2 className="h-3.5 w-3.5" /> Approve</Button> : null}
                  {r.needsApproval && !(canApprove && (isBoss || r.recordedById !== currentUserId)) ? <span className="text-[11px] font-medium text-amber-700">to approve</span> : null}
                  {!r.voided && canVoid && r.categoryId !== "rental-stock" ? <VoidButton reference={r.referenceNo} onVoid={(reason) => record(voidSpec({ departmentId, row: r, type: r.type, reason }), { success: `${r.referenceNo} voided.` })} /> : null}
                  {r.voided ? <span className="text-[11px]">{r.voidReason}</span> : null}
                </span>
              ),
            },
          ]}
        />
      </Section>
      {dialog ? <MoneyDialog departmentId={departmentId} type={dialog} categories={categories} link={link} currentUserName={currentUserName} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
