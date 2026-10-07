"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { DataTable, Field, Money, Pill, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { PaymentFields, paymentReady } from "@/components/kit/payment-fields";
import { VoidButton } from "@/components/kit/void-button";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";
import { createBillAction, payBillAction, voidBillAction } from "@/actions/accounting";

const STATUS = { OPEN: ["Unpaid", "amber"], PARTIAL: ["Part paid", "sky"], PAID: ["Paid", "emerald"], VOIDED: ["Voided", "slate"] };

function NewBill({ companyId, vat, todayKey, suppliers, departments, categories, onClose }) {
  const router = useRouter();
  const [f, setF] = useState({ supplierName: "", departmentId: departments[0]?.id || "", dateKey: todayKey, dueKey: "", supplierRef: "", note: "", lines: [{ category: "", description: "", amount: "", taxAmount: "" }] });
  const [busy, setBusy] = useState(false);
  const cats = categories[f.departmentId] || [];
  const setLine = (i, p) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...p } : l)) });
  const total = f.lines.reduce((s, l) => s + (Number(l.amount) || 0), 0);
  const submit = async () => {
    setBusy(true);
    const known = suppliers.find((s) => s.name.toLowerCase() === f.supplierName.trim().toLowerCase());
    const ok = await runWithToast(createBillAction({ companyId, ...f, supplierId: known?.id, lines: f.lines.map((l) => ({ ...l, amount: Number(l.amount) || 0, taxAmount: Number(l.taxAmount) || 0 })) }), { success: (b) => `Bill ${b.referenceNo} recorded: ${formatMoney(b.total)} owed.` });
    setBusy(false);
    if (ok) {
      onClose();
      router.refresh();
    }
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} wide title="Record a supplier's bill" description="The expense counts on the bill's date in the department; the money leaves when the bill is paid." footer={<SubmitButton busy={busy} disabled={!total} onClick={submit}>Record {total ? formatMoney(total) : "the bill"}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier" required htmlFor="bl-sup">
          <input id="bl-sup" list="bl-suppliers" className={inputClass} value={f.supplierName} onChange={(e) => setF({ ...f, supplierName: e.target.value })} placeholder="Name (a new one is added)" />
          <datalist id="bl-suppliers">{suppliers.map((s) => <option key={s.id} value={s.name} />)}</datalist>
        </Field>
        <Field label="Department" required htmlFor="bl-dept">
          <select id="bl-dept" className={selectClass} value={f.departmentId} onChange={(e) => setF({ ...f, departmentId: e.target.value, lines: f.lines.map((l) => ({ ...l, category: "" })) })}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Supplier's invoice no." htmlFor="bl-ref"><input id="bl-ref" className={inputClass} value={f.supplierRef} onChange={(e) => setF({ ...f, supplierRef: e.target.value })} /></Field>
        <Field label="Bill date" required htmlFor="bl-date"><input id="bl-date" type="date" className={inputClass} value={f.dateKey} max={todayKey} onChange={(e) => setF({ ...f, dateKey: e.target.value })} /></Field>
        <Field label="Due date" htmlFor="bl-due"><input id="bl-due" type="date" className={inputClass} value={f.dueKey} onChange={(e) => setF({ ...f, dueKey: e.target.value })} /></Field>
      </div>
      <div className="mt-4 space-y-2">
        {f.lines.map((l, i) => (
          <div key={i} className="grid items-end gap-2 sm:grid-cols-12">
            <Field label={i ? "" : "Category"} htmlFor={`bl-c-${i}`} className="sm:col-span-3">
              <select id={`bl-c-${i}`} aria-label={`Category of line ${i + 1}`} className={selectClass} value={l.category} onChange={(e) => setLine(i, { category: e.target.value })}>
                <option value="">Choose…</option>
                {cats.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
              </select>
            </Field>
            <Field label={i ? "" : "Description"} htmlFor={`bl-d-${i}`} className={vat ? "sm:col-span-4" : "sm:col-span-6"}><input id={`bl-d-${i}`} aria-label={`Description of line ${i + 1}`} className={inputClass} value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} /></Field>
            <Field label={i ? "" : "Amount (VAT included)"} htmlFor={`bl-a-${i}`} className="sm:col-span-2"><input id={`bl-a-${i}`} aria-label={`Amount of line ${i + 1}`} inputMode="numeric" className={inputClass} value={l.amount} onChange={(e) => setLine(i, { amount: wholeNumber(e.target.value) })} /></Field>
            {vat ? <Field label={i ? "" : "of which VAT"} htmlFor={`bl-t-${i}`} className="sm:col-span-2"><input id={`bl-t-${i}`} aria-label={`VAT of line ${i + 1}`} inputMode="numeric" className={inputClass} value={l.taxAmount} onChange={(e) => setLine(i, { taxAmount: wholeNumber(e.target.value) })} /></Field> : null}
            <div className="sm:col-span-1">{f.lines.length > 1 ? <Button variant="ghost" size="sm" aria-label={`Remove line ${i + 1}`} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button> : null}</div>
          </div>
        ))}
        <Button variant="outline" size="sm" onClick={() => setF({ ...f, lines: [...f.lines, { category: "", description: "", amount: "", taxAmount: "" }] })}><Plus className="h-4 w-4" /> Add a line</Button>
      </div>
    </FormDialog>
  );
}

function PayBill({ companyId, bill, todayKey, onClose }) {
  const router = useRouter();
  const [f, setF] = useState({ amount: bill.left, dateKey: todayKey, paymentMethod: "BANK_TRANSFER", reference: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(payBillAction({ companyId, billId: bill.id, ...f, amount: Number(f.amount) || 0 }), { success: (r) => (r.left ? `Paid. Still owed: ${formatMoney(r.left)}.` : `${bill.referenceNo} is paid.`) });
    setBusy(false);
    if (ok) {
      onClose();
      router.refresh();
    }
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Pay ${bill.referenceNo} · ${bill.supplier}`} description={`Left to pay: ${formatMoney(bill.left)}. The money leaves the department's cash, MoMo or bank.`} footer={<SubmitButton busy={busy} disabled={!Number(f.amount) || !paymentReady(f)} onClick={submit}>Pay {formatMoney(Number(f.amount) || 0)}</SubmitButton>}>
      <PaymentFields value={f} onChange={(p) => setF({ ...f, ...p })} idPrefix="pb" amountLabel="Amount paid (FCFA)" showBy={false} />
      <Field label="Date" htmlFor="pb-date" className="mt-3 max-w-xs"><input id="pb-date" type="date" max={todayKey} className={inputClass} value={f.dateKey} onChange={(e) => setF({ ...f, dateKey: e.target.value })} /></Field>
    </FormDialog>
  );
}

export function BillsClient({ companyId, vat, todayKey, showAll, suppliers, departments, categories, bills }) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [paying, setPaying] = useState(null);
  const names = new Map(departments.map((d) => [d.id, d.name]));
  const owed = bills.filter((b) => ["OPEN", "PARTIAL"].includes(b.status)).reduce((s, b) => s + b.left, 0);
  const overdue = bills.filter((b) => ["OPEN", "PARTIAL"].includes(b.status) && b.dueKey && b.dueKey < todayKey).reduce((s, b) => s + b.left, 0);
  const voidIt = async (b, reason) => {
    if (await runWithToast(voidBillAction({ companyId, billId: b.id, reason }), { success: `${b.referenceNo} voided.` })) router.refresh();
  };
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-4 text-sm">
          <span>Owed to suppliers: <Money value={owed} className="font-semibold" /></span>
          {overdue ? <span className="text-rose-700">Overdue: <Money value={overdue} className="font-semibold" /></span> : null}
          <Link className="underline" href={showAll ? "?" : "?status=all"}>{showAll ? "Unpaid only" : "All bills"}</Link>
        </div>
        <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Record a bill</Button>
      </div>
      <Section title={showAll ? "All bills" : "Bills to pay"} bodyClassName="p-0">
        <DataTable
          rows={bills}
          empty="No bills."
          columns={[
            { key: "ref", label: "Bill", render: (b) => <span><span className="font-mono text-xs">{b.referenceNo}</span>{b.supplierRef ? <span className="block text-xs text-slate-500">{b.supplierRef}</span> : null}</span> },
            { key: "supplier", label: "Supplier", render: (b) => <span>{b.supplier}<span className="block text-xs text-slate-500">{names.get(b.departmentId)}</span></span> },
            { key: "date", label: "Date", render: (b) => formatDateKey(b.dateKey, { weekday: false }) },
            { key: "due", label: "Due", render: (b) => (b.dueKey ? <span className={b.dueKey < todayKey && b.left ? "text-rose-700" : ""}>{formatDateKey(b.dueKey, { weekday: false })}</span> : "—") },
            { key: "total", label: "Total", align: "right", render: (b) => <Money value={b.total} suffix={false} /> },
            { key: "left", label: "Left", align: "right", render: (b) => <Money value={b.left} suffix={false} /> },
            { key: "status", label: "", render: (b) => <Pill tone={STATUS[b.status][1]}>{STATUS[b.status][0]}</Pill> },
            { key: "act", label: "", align: "right", render: (b) => (
              <span className="flex justify-end gap-1">
                {["OPEN", "PARTIAL"].includes(b.status) ? <Button size="sm" onClick={() => setPaying(b)}>Pay</Button> : null}
                {b.status === "OPEN" ? <VoidButton reference={b.referenceNo} onVoid={(reason) => voidIt(b, reason)} /> : null}
              </span>
            ) },
          ]}
        />
      </Section>
      {adding ? <NewBill companyId={companyId} vat={vat} todayKey={todayKey} suppliers={suppliers} departments={departments} categories={categories} onClose={() => setAdding(false)} /> : null}
      {paying ? <PayBill companyId={companyId} bill={paying} todayKey={todayKey} onClose={() => setPaying(null)} /> : null}
    </div>
  );
}
