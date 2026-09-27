"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowDownLeft, ArrowUpRight, Loader2, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field, Money, StatCard, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast, useIdempotencyKey, useLiveRefresh, wholeNumber } from "@/components/kit/client";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { MONEY_CATEGORIES } from "@/data/categories";
import { formatMoney } from "@/lib/format";
import { recordMoney, recordPurchase, voidRecord } from "@/actions/money";
import { cn } from "@/lib/utils";

const TYPES = {
  RENT_INCOME: { title: "Record rent income", counterparty: "Tenant", perm: "moneyIn" },
  OTHER_INCOME: { title: "Record other income", counterparty: "Received from", perm: "moneyIn" },
  DISCOUNT: { title: "Record a discount paid out", counterparty: "Customer", perm: "discounts", hint: "A refund or goodwill paid from the drawer. Discounts on a sale are given at the till." },
  EXPENSE: { title: "Record an expense", counterparty: "Paid to", perm: "expenses" },
  OTHER_EXPENSE: { title: "Record another expense", counterparty: "Paid to", perm: "expenses" },
};

function MoneyEntryDialog({ type, onClose, departmentId, dateKey }) {
  const router = useRouter();
  const [key, renew] = useIdempotencyKey();
  const cfg = TYPES[type];
  const cats = MONEY_CATEGORIES[type] || [];
  const [f, setF] = useState({ amount: "", category: cats[0]?.id || "", paymentMethod: "CASH", counterparty: "", reference: "", description: "", attachmentIds: [] });
  const [busy, setBusy] = useState(false);
  if (!cfg) return null;
  const incoming = type === "RENT_INCOME" || type === "OTHER_INCOME";
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(recordMoney({ departmentId, dateKey, type, ...f, idempotencyKey: key }), { success: (d) => `${d.referenceNo} recorded: ${formatMoney(f.amount)}.` });
    setBusy(false);
    if (ok) {
      renew();
      onClose();
      router.refresh();
    }
  };
  return (
    <Dialog open={Boolean(type)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{cfg.title}</DialogTitle>
          {cfg.hint ? <DialogDescription>{cfg.hint}</DialogDescription> : null}
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Amount (FCFA)" required htmlFor="money-amount">
              <input id="money-amount" inputMode="numeric" className={inputClass} value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
            </Field>
            <Field label="Category" required htmlFor="money-category">
              <select id="money-category" className={selectClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {cats.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label={incoming ? "Received by" : "Paid by"} htmlFor="money-method">
              <select id="money-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
                <option value="CASH">Cash {incoming ? "(into the drawer)" : "(from the drawer)"}</option>
                <option value="MOMO">Mobile Money</option>
                <option value="BANK_TRANSFER">Bank</option>
              </select>
            </Field>
            <Field label={cfg.counterparty} htmlFor="money-counterparty">
              <input id="money-counterparty" className={inputClass} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} placeholder="Optional" />
            </Field>
          </div>
          <Field label="Description" htmlFor="money-description">
            <input id="money-description" className={inputClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Optional" />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Receipt / MoMo reference" htmlFor="money-ref">
              <input id="money-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Optional" />
            </Field>
            <div className="flex items-end">
              <ProofUpload departmentId={departmentId} value={f.attachmentIds} onChange={(ids) => setF({ ...f, attachmentIds: ids })} label="Attach proof" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !(Number(f.amount) > 0) || !f.category} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record {f.amount ? formatMoney(f.amount) : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PurchaseDialog({ open, onClose, departmentId, dateKey, dishes, canAddPlates }) {
  const router = useRouter();
  const [key, renew] = useIdempotencyKey();
  const blank = { supplier: "", category: "purchase-food", paymentMethod: "CASH", reference: "", notes: "", lines: [{ description: "", quantity: "1", totalCost: "" }], stockAdds: [], attachmentIds: [] };
  const [f, setF] = useState(blank);
  const [busy, setBusy] = useState(false);
  const total = f.lines.reduce((s, l) => s + (Number(l.totalCost) || 0), 0);
  const validLines = f.lines.filter((l) => l.description.trim() && Number(l.totalCost) > 0);
  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const setAdd = (i, patch) => setF({ ...f, stockAdds: f.stockAdds.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(
      recordPurchase({
        departmentId, dateKey, idempotencyKey: key, supplier: f.supplier, category: f.category, paymentMethod: f.paymentMethod, reference: f.reference, notes: f.notes,
        lines: validLines.map((l) => ({ description: l.description, quantity: Number(l.quantity) || 1, totalCost: Number(l.totalCost) })),
        stockAdds: f.stockAdds.filter((s) => s.dishId && Number(s.plates) > 0),
        attachmentIds: f.attachmentIds,
      }),
      { success: (d) => `Purchase ${d.referenceNo} recorded: ${formatMoney(total)}.` }
    );
    setBusy(false);
    if (ok) {
      renew();
      onClose();
      router.refresh();
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Record a purchase</DialogTitle>
          <DialogDescription>What was bought and what it cost. If the purchase gave ready plates, add them to the stock below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Supplier" htmlFor="p-supplier" className="sm:col-span-1">
              <input id="p-supplier" className={inputClass} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} placeholder="Optional" />
            </Field>
            <Field label="Kind" htmlFor="p-category">
              <select id="p-category" className={selectClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
                {MONEY_CATEGORIES.PURCHASE.map((c) => (
                  <option key={c.id} value={c.id}>{c.label}</option>
                ))}
              </select>
            </Field>
            <Field label="Paid by" htmlFor="p-method">
              <select id="p-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
                <option value="CASH">Cash (from the drawer)</option>
                <option value="MOMO">Mobile Money</option>
                <option value="BANK_TRANSFER">Bank</option>
                <option value="CREDIT">Supplier credit</option>
              </select>
            </Field>
          </div>
          <div>
            <div className="mb-2 text-sm font-medium text-slate-700">Items bought</div>
            <div className="space-y-2">
              {f.lines.map((l, i) => (
                <div key={i} className="grid grid-cols-[1fr_80px_130px_36px] gap-2">
                  <input aria-label="Item" className={inputClass} placeholder="Item, e.g. fish 5 kg" value={l.description} onChange={(e) => setLine(i, { description: e.target.value })} />
                  <input aria-label="Quantity" inputMode="decimal" className={inputClass} placeholder="Qty" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value })} />
                  <input aria-label="Cost (FCFA)" inputMode="numeric" className={inputClass} placeholder="Cost FCFA" value={l.totalCost} onChange={(e) => setLine(i, { totalCost: wholeNumber(e.target.value) })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove item" disabled={f.lines.length === 1} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
            </div>
            <Button type="button" variant="ghost" size="sm" className="mt-2" onClick={() => setF({ ...f, lines: [...f.lines, { description: "", quantity: "1", totalCost: "" }] })}>
              <Plus className="h-4 w-4" /> Add an item
            </Button>
            <div className="mt-2 flex justify-between border-t border-slate-100 pt-2 text-sm font-semibold"><span>Total paid</span><Money value={total} /></div>
          </div>
          {canAddPlates ? (
            <div className="rounded-lg border border-slate-200 p-3">
              <div className="mb-2 text-sm font-medium text-slate-700">Plates added to the stock (optional)</div>
              {f.stockAdds.map((s, i) => (
                <div key={i} className="mb-2 grid grid-cols-[1fr_100px_36px] gap-2">
                  <select aria-label="Dish" className={selectClass} value={s.dishId} onChange={(e) => setAdd(i, { dishId: e.target.value })}>
                    <option value="">Choose a dish…</option>
                    {dishes.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                  <input aria-label="Plates" inputMode="numeric" className={inputClass} placeholder="Plates" value={s.plates} onChange={(e) => setAdd(i, { plates: wholeNumber(e.target.value) })} />
                  <Button type="button" variant="ghost" size="icon" aria-label="Remove" onClick={() => setF({ ...f, stockAdds: f.stockAdds.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setF({ ...f, stockAdds: [...f.stockAdds, { dishId: "", plates: "" }] })}>
                <Plus className="h-4 w-4" /> Add plates of a dish
              </Button>
            </div>
          ) : null}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Receipt reference" htmlFor="p-ref">
              <input id="p-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Optional" />
            </Field>
            <div className="flex items-end">
              <ProofUpload departmentId={departmentId} value={f.attachmentIds} onChange={(ids) => setF({ ...f, attachmentIds: ids })} label="Attach the receipt" />
            </div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !validLines.length || validLines.length !== f.lines.filter((l) => l.description || l.totalCost).length} onClick={submit}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record purchase {total ? `· ${formatMoney(total)}` : ""}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Column({ title, tone, total, rows }) {
  const Icon = tone === "in" ? ArrowDownLeft : ArrowUpRight;
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className={cn("flex items-center justify-between rounded-t-xl border-b px-4 py-3", tone === "in" ? "border-emerald-100 bg-emerald-50/60" : "border-rose-100 bg-rose-50/50")}>
        <span className="flex items-center gap-2 text-sm font-semibold">
          <Icon className={cn("h-4 w-4", tone === "in" ? "text-emerald-600" : "text-rose-600")} /> {title}
        </span>
        <Money value={total} className="text-base font-semibold" />
      </div>
      <ul className="divide-y divide-slate-100">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center justify-between gap-3 px-4 py-3">
            <div className="min-w-0">
              <div className="text-sm font-medium text-slate-900">{r.label}</div>
              {r.hint ? <div className="text-xs text-slate-500">{r.hint}</div> : null}
            </div>
            <div className="flex items-center gap-3">
              <Money value={r.value} className="font-medium" />
              {r.action}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MoneyBoard({ departmentId, dateKey, locked, perms, summary, records, dishes }) {
  useLiveRefresh(30);
  const [entry, setEntry] = useState(null);
  const [purchase, setPurchase] = useState(false);
  const can = (p) => perms[p] && !locked;
  const add = (type) =>
    can(TYPES[type].perm) ? (
      <Button size="sm" variant="outline" onClick={() => setEntry(type)} aria-label={`Record ${type}`}>
        <Plus className="h-3.5 w-3.5" /> Record
      </Button>
    ) : null;
  return (
    <div className="space-y-6">
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Money in" value={<Money value={summary.moneyIn} />} tone="in" hint="Sales + rent + other income" />
        <StatCard label="Money out" value={<Money value={summary.moneyOut} />} tone="out" hint="Discounts + purchases + expenses + other" />
        <StatCard label="Result of the day" value={<Money value={summary.result} />} tone="dark" hint="Money in − money out" />
      </div>
      <div className="grid gap-6 lg:grid-cols-2">
        <Column
          title="Money in"
          tone="in"
          total={summary.moneyIn}
          rows={[
            { label: "Sales", hint: "From the till (all payment methods, before discounts)", value: summary.salesGross, action: <Link href={`/d/${departmentId}/sell`} className="text-xs font-medium text-slate-600 underline">Sell</Link> },
            { label: "Rent income", value: summary.rentIncome, action: add("RENT_INCOME") },
            { label: "Other income", value: summary.otherIncome, action: add("OTHER_INCOME") },
          ]}
        />
        <Column
          title="Money out"
          tone="out"
          total={summary.moneyOut}
          rows={[
            { label: "Discounts", hint: `On sales ${formatMoney(summary.saleDiscounts)} · paid out ${formatMoney(summary.standaloneDiscounts)}`, value: summary.discounts, action: add("DISCOUNT") },
            { label: "Purchases", value: summary.purchases, action: can("purchases") ? <Button size="sm" variant="outline" onClick={() => setPurchase(true)} aria-label="Record PURCHASE"><Plus className="h-3.5 w-3.5" /> Record</Button> : null },
            { label: "Expenses", value: summary.expenses, action: add("EXPENSE") },
            { label: "Other expenses", value: summary.otherExpenses, action: add("OTHER_EXPENSE") },
          ]}
        />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Records of the day (except sales)</div>
        {records.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">Nothing recorded yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Ref</th>
                  <th className="px-3 py-2 font-medium">Time</th>
                  <th className="px-3 py-2 font-medium">Type</th>
                  <th className="px-3 py-2 font-medium">What</th>
                  <th className="px-3 py-2 font-medium">Paid by</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">By</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {records.map((r) => (
                  <tr key={r.id} className={cn("border-b border-slate-100 last:border-0", r.voided && "text-slate-400")}>
                    <td className="px-4 py-2 font-medium">{r.referenceNo}</td>
                    <td className="px-3 py-2">{r.time}</td>
                    <td className="px-3 py-2">
                      <span className={cn("inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium", r.direction === "in" ? "bg-emerald-50 text-emerald-800" : "bg-rose-50 text-rose-800")}>
                        {r.typeLabel}
                      </span>
                    </td>
                    <td className="px-3 py-2">
                      <div className={cn(r.voided && "line-through")}>{r.description}</div>
                      <div className="text-xs text-slate-500">
                        {r.category}
                        {r.counterparty ? ` · ${r.counterparty}` : ""}
                        {r.platesAdded.length ? ` · plates added: ${r.platesAdded.join(", ")}` : ""}
                      </div>
                      {r.voided ? <div className="text-xs">Void: {r.voidReason}</div> : null}
                    </td>
                    <td className="px-3 py-2">{r.method}</td>
                    <td className={cn("px-3 py-2 text-right font-medium", r.voided && "line-through")}><Money value={r.amount} tone={r.voided ? "none" : r.direction} /></td>
                    <td className="px-3 py-2 text-xs">{r.by}</td>
                    <td className="px-3 py-1 text-right">
                      {r.voided ? <StatusBadge status="VOIDED" /> : perms.void && !locked ? <VoidButton reference={r.referenceNo} action={(reason) => voidRecord({ transactionId: r.id, reason })} /> : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {entry ? <MoneyEntryDialog key={entry} type={entry} onClose={() => setEntry(null)} departmentId={departmentId} dateKey={dateKey} /> : null}
      {purchase ? <PurchaseDialog open onClose={() => setPurchase(false)} departmentId={departmentId} dateKey={dateKey} dishes={dishes} canAddPlates={perms.manageStock} /> : null}
    </div>
  );
}
