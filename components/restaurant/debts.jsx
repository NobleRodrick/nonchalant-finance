"use client";

import { useMemo, useState } from "react";
import { BookUser, CloudOff, HandCoins, History, Loader2, Plus, Printer, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Field, Money, StatCard, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { useLiveRefresh, wholeNumber } from "@/components/kit/client";
import { VoidButton } from "@/components/kit/void-button";
import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";
import { usePendingEffects, useRecorder } from "@/lib/offline/react";
import { overlayDebts, overlayDishes } from "@/lib/offline/overlay";
import { cancelDebtSpec, debtSpec, repaySpec } from "@/lib/offline/specs";
import { cn } from "@/lib/utils";

const SOURCE = { CREDIT_SALE: "Sale on credit", MANUAL: "Recorded debt", OPENING_BALANCE: "Old debt" };

function CustomerPicker({ customers, value, onChange }) {
  return (
    <div className="space-y-2">
      <Field label="Customer" required htmlFor="debt-customer">
        <select id="debt-customer" className={selectClass} value={value.debtorKey} onChange={(e) => onChange({ ...value, debtorKey: e.target.value })}>
          <option value="">New customer…</option>
          {customers.map((c) => (
            <option key={c.key} value={c.key}>{c.name}{c.balance ? ` · owes ${formatMoney(c.balance)}` : ""}</option>
          ))}
        </select>
      </Field>
      {!value.debtorKey ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <input aria-label="Customer name" className={inputClass} placeholder="Customer name" value={value.name} onChange={(e) => onChange({ ...value, name: e.target.value })} />
          <input aria-label="Customer phone" className={inputClass} placeholder="Phone (optional)" value={value.phone} onChange={(e) => onChange({ ...value, phone: e.target.value })} />
        </div>
      ) : null}
    </div>
  );
}

/** The customer as sent: a known customer by id, otherwise by name (the server finds or creates it). */
const debtorPayload = (c, customers) => {
  const found = customers.find((x) => x.key === c.debtorKey);
  if (found && /^[0-9a-f-]{36}$/i.test(String(found.key))) return { debtorId: found.key, customer: found.name, phone: found.phone };
  if (found) return { debtor: { name: found.name, phone: found.phone }, customer: found.name, phone: found.phone };
  return { debtor: { name: c.name.trim(), phone: c.phone }, customer: c.name.trim(), phone: c.phone };
};

function RecordDebtDialog({ open, onClose, departmentId, customers, dishes, mode }) {
  const record = useRecorder();
  const [f, setF] = useState({ customer: { debtorKey: "", name: "", phone: "" }, kind: mode === "old" ? "amount" : "dishes", lines: [{ dishId: "", quantity: "" }], amount: "", description: "", dueDate: "", dateKey: "" });
  const [busy, setBusy] = useState(false);
  const byId = Object.fromEntries(dishes.map((d) => [d.id, d]));
  const lines = f.lines.filter((l) => l.dishId && Number(l.quantity) > 0);
  const linesTotal = lines.reduce((s, l) => s + Number(l.quantity) * (byId[l.dishId]?.price || 0), 0);
  const total = f.kind === "dishes" ? linesTotal : Number(f.amount) || 0;
  const customerOk = f.customer.debtorKey || f.customer.name.trim().length >= 2;
  const overStock = lines.some((l) => Number(l.quantity) > (byId[l.dishId]?.available || 0));
  const valid = customerOk && total > 0 && !overStock && (f.kind === "dishes" || f.description.trim() || mode === "old");
  const submit = async () => {
    setBusy(true);
    const who = debtorPayload(f.customer, customers);
    const spec = debtSpec({
      departmentId,
      old: mode === "old",
      dateKey: mode === "old" ? f.dateKey || null : null,
      ...who,
      dueDate: f.dueDate || null,
      lines: mode !== "old" && f.kind === "dishes" ? lines.map((l) => ({ dishId: l.dishId, name: byId[l.dishId]?.name, price: byId[l.dishId]?.price || 0, quantity: Number(l.quantity) })) : [],
      amount: f.amount,
      description: f.description,
    });
    const ok = await record(spec, { success: (d) => `Debt ${d.referenceNo} recorded: ${formatMoney(total)}.` });
    setBusy(false);
    if (ok) onClose();
  };
  const setLine = (i, patch) => setF({ ...f, lines: f.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{mode === "old" ? "Add an old debt" : "Record a debt"}</DialogTitle>
          <DialogDescription>
            {mode === "old"
              ? "A debt from before you used the app. It is not a sale of today and does not change the cash."
              : "A customer took food on credit without going through the till. It counts in today's sales and the customer owes it."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <CustomerPicker customers={customers} value={f.customer} onChange={(customer) => setF({ ...f, customer })} />
          {mode !== "old" ? (
            <div className="flex gap-2" role="radiogroup" aria-label="What was taken">
              {[{ id: "dishes", label: "Dishes from the menu" }, { id: "amount", label: "An amount" }].map((k) => (
                <button key={k.id} type="button" role="radio" aria-checked={f.kind === k.id} onClick={() => setF({ ...f, kind: k.id })} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm", f.kind === k.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200")}>
                  {k.label}
                </button>
              ))}
            </div>
          ) : null}
          {mode !== "old" && f.kind === "dishes" ? (
            <div className="space-y-2">
              {f.lines.map((l, i) => {
                const d = byId[l.dishId];
                return (
                  <div key={i} className="grid grid-cols-[1fr_90px_36px] gap-2">
                    <select aria-label="Dish" className={selectClass} value={l.dishId} onChange={(e) => setLine(i, { dishId: e.target.value })}>
                      <option value="">Choose a dish…</option>
                      {dishes.map((x) => (
                        <option key={x.id} value={x.id} disabled={x.available <= 0}>{x.name} · {formatMoney(x.price)} · {x.available} left</option>
                      ))}
                    </select>
                    <input aria-label="Plates" inputMode="numeric" className={cn(inputClass, d && Number(l.quantity) > d.available && "border-rose-400")} placeholder="Plates" value={l.quantity} onChange={(e) => setLine(i, { quantity: wholeNumber(e.target.value) })} />
                    <Button type="button" variant="ghost" size="icon" aria-label="Remove" disabled={f.lines.length === 1} onClick={() => setF({ ...f, lines: f.lines.filter((_, j) => j !== i) })}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
              <Button type="button" variant="ghost" size="sm" onClick={() => setF({ ...f, lines: [...f.lines, { dishId: "", quantity: "" }] })}><Plus className="h-4 w-4" /> Another dish</Button>
              {overStock ? <p className="text-xs text-rose-600">Not enough plates in stock.</p> : null}
            </div>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Amount owed (FCFA)" required htmlFor="debt-amount">
                <input id="debt-amount" inputMode="numeric" className={inputClass} value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
              </Field>
              <Field label="What was taken" required={mode !== "old"} htmlFor="debt-description">
                <input id="debt-description" className={inputClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Describe it" />
              </Field>
            </div>
          )}
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="To be paid by" htmlFor="debt-due" hint="Optional">
              <input id="debt-due" type="date" className={inputClass} value={f.dueDate} onChange={(e) => setF({ ...f, dueDate: e.target.value })} />
            </Field>
            {mode === "old" ? (
              <Field label="Date of the debt" htmlFor="debt-date" hint="Optional (default: today)">
                <input id="debt-date" type="date" className={inputClass} value={f.dateKey} onChange={(e) => setF({ ...f, dateKey: e.target.value })} />
              </Field>
            ) : null}
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !valid} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record {total ? formatMoney(total) : ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RepaymentDialog({ debt, onClose, departmentId }) {
  const record = useRecorder();
  const [f, setF] = useState({ amount: debt ? String(debt.balance) : "", paymentMethod: "CASH", reference: "" });
  const [busy, setBusy] = useState(false);
  if (!debt) return null;
  const amount = Number(f.amount) || 0;
  const submit = async () => {
    setBusy(true);
    const ok = await record(repaySpec({ departmentId, debt, amount: f.amount, paymentMethod: f.paymentMethod, reference: f.reference }), { success: (d) => `Repayment ${d.referenceNo} recorded.` });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <Dialog open={Boolean(debt)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Repayment by {debt.debtor}</DialogTitle>
          <DialogDescription>{debt.pending && debt.referenceNo === "Not sent yet" ? "Debt not sent yet" : `Debt ${debt.referenceNo}`}: owes {formatMoney(debt.balance)} of {formatMoney(debt.owed)}.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount paid (FCFA)" required htmlFor="repay-amount" error={amount > debt.balance ? `At most ${formatMoney(debt.balance)}` : null}>
            <input id="repay-amount" inputMode="numeric" className={inputClass} value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
          </Field>
          <Field label="Paid by" htmlFor="repay-method">
            <select id="repay-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
              <option value="CASH">Cash (into the drawer)</option>
              <option value="MOMO">Mobile Money</option>
              <option value="BANK_TRANSFER">Bank</option>
            </select>
          </Field>
          <Field label="Reference" htmlFor="repay-ref" className="sm:col-span-2">
            <input id="repay-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="MoMo or receipt reference (optional)" />
          </Field>
        </div>
        {amount > 0 && amount <= debt.balance ? <p className="rounded-md bg-emerald-50 px-3 py-2 text-sm text-emerald-900">Still owed after this payment: <strong>{formatMoney(debt.balance - amount)}</strong></p> : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !(amount > 0) || amount > debt.balance} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Record {amount ? formatMoney(amount) : ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function CustomerStatement({ customer, debts, onClose, departmentName }) {
  if (!customer) return null;
  const list = debts.filter((d) => (d.debtorId || d.debtor) === customer.key && d.status !== "CANCELLED");
  return (
    <Dialog open={Boolean(customer)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Statement — {customer.name}</DialogTitle>
          <DialogDescription>{departmentName}{customer.phone ? ` · ${customer.phone}` : ""}</DialogDescription>
        </DialogHeader>
        <div id="statement-print" className="space-y-3">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Ref</th>
                <th className="py-2 font-medium">What</th>
                <th className="py-2 text-right font-medium">Owed</th>
                <th className="py-2 text-right font-medium">Paid</th>
              </tr>
            </thead>
            <tbody>
              {list.flatMap((d) => [
                <tr key={d.id} className="border-b border-slate-100">
                  <td className="py-2">{d.dateLabel}</td>
                  <td className="py-2">{d.referenceNo}</td>
                  <td className="py-2">{d.description}</td>
                  <td className="py-2 text-right"><Money value={d.owed} suffix={false} /></td>
                  <td className="py-2" />
                </tr>,
                ...d.payments.map((p) => (
                  <tr key={p.id} className="border-b border-slate-100 text-slate-600">
                    <td className="py-2">{p.dateLabel}</td>
                    <td className="py-2">{p.referenceNo}</td>
                    <td className="py-2">Repayment of {d.referenceNo}</td>
                    <td className="py-2" />
                    <td className="py-2 text-right"><Money value={p.amount} suffix={false} /></td>
                  </tr>
                )),
              ])}
            </tbody>
            <tfoot>
              <tr className="font-semibold">
                <td className="pt-3" colSpan={3}>Balance owed</td>
                <td className="pt-3 text-right" colSpan={2}><Money value={customer.balance} /></td>
              </tr>
            </tfoot>
          </table>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function DebtsBoard({ departmentId, departmentName, todayKey, renderedAt, perms, stats: serverStats, debts: serverDebts, dishes: serverDishes, allowNew = true }) {
  useLiveRefresh(120);
  const record = useRecorder();
  // The server's debts + debts, repayments and cancellations recorded on this computer and not sent yet.
  const effects = usePendingEffects(departmentId, renderedAt);
  const { debts, customers, stats } = useMemo(
    () => overlayDebts(serverDebts, effects, { todayKey, repaidToday: serverStats.repaidToday, formatDate: formatDateKey }),
    [serverDebts, effects, todayKey, serverStats.repaidToday]
  );
  const dishes = useMemo(() => overlayDishes(serverDishes, effects), [serverDishes, effects]);
  const [tab, setTab] = useState("open");
  const [q, setQ] = useState("");
  const [dialog, setDialog] = useState(null);
  const [repay, setRepay] = useState(null);
  const [statement, setStatement] = useState(null);
  const filtered = useMemo(() => {
    const byTab = { open: (d) => ["UNPAID", "PARTIALLY_PAID"].includes(d.status), paid: (d) => d.status === "PAID", all: () => true };
    return debts.filter(byTab[tab] || byTab.all).filter((d) => !q || `${d.debtor} ${d.referenceNo} ${d.description}`.toLowerCase().includes(q.toLowerCase()));
  }, [debts, tab, q]);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Owed by customers" value={<Money value={stats.outstanding} />} tone="warn" />
        <StatCard label="Given today" value={<Money value={stats.givenToday} />} />
        <StatCard label="Repaid today" value={<Money value={stats.repaidToday} />} tone="in" />
        <StatCard label="Customers owing" value={stats.customersOwing} />
      </div>
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-wrap gap-2">
          {perms.manage ? (
            <>
              {allowNew ? <Button onClick={() => setDialog("new")}><Plus className="h-4 w-4" /> Record a debt</Button> : null}
              <Button variant="outline" onClick={() => setDialog("old")}><History className="h-4 w-4" /> Add an old debt</Button>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist">
            {[{ id: "open", label: "Open" }, { id: "customers", label: "Customers" }, { id: "paid", label: "Paid" }, { id: "all", label: "All" }].map((t) => (
              <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => setTab(t.id)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input aria-label="Search debts" className={cn(inputClass, "w-48 pl-9")} placeholder="Search…" value={q} onChange={(e) => setQ(e.target.value)} />
          </div>
        </div>
      </div>

      {tab === "customers" ? (
        customers.length === 0 ? (
          <EmptyState icon={BookUser} title="No customers yet" description="Customers appear here when they take food on credit." />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {customers.filter((c) => !q || c.name.toLowerCase().includes(q.toLowerCase())).map((c) => (
              <button key={c.key} type="button" onClick={() => setStatement(c)} className="rounded-xl border border-slate-200 bg-white p-4 text-left shadow-xs transition hover:shadow-md">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{c.name}</span>
                  <Money value={c.balance} className={c.balance ? "font-semibold text-rose-700" : "text-emerald-700"} />
                </div>
                <div className="mt-1 text-xs text-slate-500">{c.phone || "No phone"} · {c.debts} debt(s) · paid {formatMoney(c.paid)}</div>
              </button>
            ))}
          </div>
        )
      ) : filtered.length === 0 ? (
        <EmptyState icon={BookUser} title={tab === "open" ? "No one owes money" : "No debts"} description="Debts appear here when a customer takes food on credit." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Customer</th>
                <th className="px-3 py-2 font-medium">What</th>
                <th className="px-3 py-2 text-right font-medium">Owed</th>
                <th className="px-3 py-2 text-right font-medium">Paid</th>
                <th className="px-3 py-2 text-right font-medium">Balance</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((d) => (
                <tr key={d.id} className="border-b border-slate-100 last:border-0" data-pending={d.pending ? "1" : undefined}>
                  <td className="px-4 py-2 font-medium">
                    {d.referenceNo === "Not sent yet" ? <span className="inline-flex items-center gap-1 text-amber-700"><CloudOff className="h-3.5 w-3.5" /> Not sent yet</span> : d.referenceNo}
                    {d.pending && d.referenceNo !== "Not sent yet" ? <div className="text-[11px] font-normal text-amber-700">changes not sent yet</div> : null}
                  </td>
                  <td className="whitespace-nowrap px-3 py-2">{d.dateLabel}</td>
                  <td className="px-3 py-2">
                    <button type="button" className="font-medium underline-offset-2 hover:underline" onClick={() => setStatement(customers.find((c) => c.key === (d.debtorId || d.debtor)))}>{d.debtor}</button>
                    {d.phone ? <div className="text-xs text-slate-500">{d.phone}</div> : null}
                  </td>
                  <td className="px-3 py-2">
                    <div>{d.description}</div>
                    <div className="text-xs text-slate-500">{SOURCE[d.source]}{d.saleReference ? ` · ${d.saleReference}` : ""}{d.dueDate ? ` · due ${d.dueDate}` : ""}</div>
                  </td>
                  <td className="px-3 py-2 text-right"><Money value={d.owed} suffix={false} /></td>
                  <td className="px-3 py-2 text-right"><Money value={d.paid} suffix={false} /></td>
                  <td className="px-3 py-2 text-right font-semibold"><Money value={d.balance} suffix={false} /></td>
                  <td className="px-3 py-2"><StatusBadge status={d.status} /></td>
                  <td className="whitespace-nowrap px-3 py-1 text-right">
                    {perms.repay && d.balance > 0 ? (
                      <Button size="sm" variant="outline" onClick={() => setRepay(d)}><HandCoins className="h-3.5 w-3.5" /> Repayment</Button>
                    ) : null}
                    {perms.manage && d.source === "OPENING_BALANCE" && d.status === "UNPAID" ? (
                      <VoidButton label="Cancel" what="debt" reference={d.referenceNo} onVoid={(reason) => record(cancelDebtSpec({ departmentId, debt: d, reason }), { success: `${d.referenceNo} cancelled.` })} />
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {dialog ? <RecordDebtDialog key={dialog} open mode={dialog} onClose={() => setDialog(null)} departmentId={departmentId} customers={customers} dishes={dishes} /> : null}
      {repay ? <RepaymentDialog key={repay.id} debt={repay} onClose={() => setRepay(null)} departmentId={departmentId} /> : null}
      <CustomerStatement customer={statement} debts={debts} onClose={() => setStatement(null)} departmentName={departmentName} />
    </div>
  );
}
