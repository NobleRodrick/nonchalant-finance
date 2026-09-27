"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Banknote, CreditCard, Landmark, Loader2, Minus, Plus, Printer, Search, Smartphone, Trash2, UserRound } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Field, Money, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast, useIdempotencyKey, useLiveRefresh, wholeNumber } from "@/components/kit/client";
import { VoidButton } from "@/components/kit/void-button";
import { countOf, formatMoney } from "@/lib/format";
import { recordSale } from "@/actions/sales";
import { voidRecord } from "@/actions/money";
import { cn } from "@/lib/utils";

const METHODS = [
  { id: "CASH", label: "Cash", icon: Banknote },
  { id: "MOMO", label: "Mobile Money", icon: Smartphone },
  { id: "BANK_TRANSFER", label: "Bank", icon: Landmark },
  { id: "CREDIT", label: "On credit (debt)", icon: CreditCard },
];
const METHOD_LABEL = Object.fromEntries(METHODS.map((m) => [m.id, m.label]));

function Receipt({ sale, departmentName, onClose }) {
  if (!sale) return null;
  return (
    <Dialog open={Boolean(sale)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Sale {sale.referenceNo} recorded</DialogTitle>
        </DialogHeader>
        <div id="receipt" className="receipt rounded-lg border border-dashed border-slate-300 p-4 font-mono text-xs">
          <div className="text-center font-bold">{departmentName}</div>
          <div className="mb-2 text-center">Receipt {sale.referenceNo} · {new Date().toLocaleString("en-GB", { timeZone: "Africa/Douala" })}</div>
          {sale.lines.map((l) => (
            <div key={l.name} className="flex justify-between">
              <span>{l.quantity} × {l.name}</span>
              <span>{formatMoney(l.quantity * l.price)}</span>
            </div>
          ))}
          {sale.discount ? (
            <div className="flex justify-between"><span>Discount</span><span>−{formatMoney(sale.discount)}</span></div>
          ) : null}
          <div className="mt-2 flex justify-between border-t border-dashed border-slate-300 pt-2 text-sm font-bold">
            <span>TOTAL</span>
            <span>{formatMoney(sale.total)}</span>
          </div>
          <div className="mt-1">Paid: {METHOD_LABEL[sale.method]}</div>
          {sale.debtReference ? <div>Debt {sale.debtReference} opened for {sale.customer}</div> : null}
          <div className="mt-2 text-center">Thank you</div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { document.body.classList.add("print-receipt"); window.print(); document.body.classList.remove("print-receipt"); }}>
            <Printer className="h-4 w-4" /> Print receipt
          </Button>
          <Button onClick={onClose}>New sale</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PointOfSale({ departmentId, departmentName, dateKey, locked, canDiscount, discountLimit, canVoid, dishes, debtors, sales }) {
  useLiveRefresh(20);
  const router = useRouter();
  const [key, renew] = useIdempotencyKey();
  const [cart, setCart] = useState({});
  const [q, setQ] = useState("");
  const [method, setMethod] = useState("CASH");
  const [discount, setDiscount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [debtorId, setDebtorId] = useState("");
  const [newDebtor, setNewDebtor] = useState({ name: "", phone: "" });
  const [busy, setBusy] = useState(false);
  const [receipt, setReceipt] = useState(null);

  const byId = useMemo(() => Object.fromEntries(dishes.map((d) => [d.id, d])), [dishes]);
  const lines = Object.entries(cart).filter(([, n]) => n > 0).map(([id, n]) => ({ ...byId[id], quantity: n })).filter((l) => l.id);
  const gross = lines.reduce((s, l) => s + l.quantity * l.price, 0);
  const disc = Math.min(Number(discount) || 0, gross);
  const total = gross - disc;
  const discountAllowed = canDiscount || (discountLimit ?? 0) > 0;
  const shown = dishes.filter((d) => !q || d.name.toLowerCase().includes(q.toLowerCase()));

  const add = (d, delta) => {
    const next = Math.max(0, Math.min(d.available, (cart[d.id] || 0) + delta));
    setCart({ ...cart, [d.id]: next });
  };
  const reset = () => {
    setCart({});
    setDiscount("");
    setDiscountReason("");
    setMethod("CASH");
    setDebtorId("");
    setNewDebtor({ name: "", phone: "" });
  };

  const creditOk = method !== "CREDIT" || debtorId || newDebtor.name.trim().length >= 2;
  const discountOk = !disc || discountReason.trim();
  const overLimit = !canDiscount && disc > (discountLimit || 0);
  const canRecord = lines.length > 0 && creditOk && discountOk && !overLimit && !locked;

  const submit = async () => {
    setBusy(true);
    const payload = {
      departmentId,
      dateKey,
      lines: lines.map((l) => ({ dishId: l.id, quantity: l.quantity })),
      paymentMethod: method,
      discountAmount: disc,
      discountReason,
      debtorId: method === "CREDIT" && debtorId && debtorId !== "__new" ? debtorId : null,
      debtor: method === "CREDIT" && (!debtorId || debtorId === "__new") ? newDebtor : null,
      idempotencyKey: key,
    };
    const res = await runWithToast(recordSale(payload), { success: (d) => `Sale ${d.referenceNo} recorded: ${formatMoney(d.totals?.netAmount ?? total)}.` });
    setBusy(false);
    if (res) {
      setReceipt({
        referenceNo: res.referenceNo,
        lines: lines.map((l) => ({ name: l.name, quantity: l.quantity, price: l.price })),
        discount: disc,
        total,
        method,
        customer: method === "CREDIT" ? (debtors.find((d) => d.id === debtorId)?.name || newDebtor.name) : null,
        debtReference: res.debtReference,
      });
      renew();
      reset();
      router.refresh();
    }
  };

  return (
    <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
      <div className="space-y-4">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input aria-label="Search dishes" className={cn(inputClass, "pl-9")} placeholder="Search dishes…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {dishes.length === 0 ? (
          <EmptyState title="No dishes on the menu" description="The department head adds dishes and plates on the Menu & Stock page." />
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
            {shown.map((d) => {
              const inCart = cart[d.id] || 0;
              const left = d.available - inCart;
              const out = d.available <= 0;
              return (
                <button
                  key={d.id}
                  type="button"
                  disabled={out || left <= 0 || locked}
                  onClick={() => add(d, 1)}
                  className={cn(
                    "relative flex min-h-[104px] flex-col justify-between rounded-xl border bg-white p-3 text-left shadow-xs transition",
                    inCart ? "border-emerald-500 ring-2 ring-emerald-200" : "border-slate-200 hover:border-slate-400 hover:shadow-md",
                    (out || left <= 0) && "cursor-not-allowed opacity-50 hover:border-slate-200 hover:shadow-xs"
                  )}
                  aria-label={`Add ${d.name}`}
                >
                  <span className="text-sm font-semibold text-slate-900">{d.name}</span>
                  <span className="mt-2 flex items-end justify-between">
                    <span className="text-sm font-medium text-slate-700">{formatMoney(d.price)}</span>
                    <span className={cn("text-xs", out ? "font-semibold text-rose-600" : d.available <= 3 ? "text-amber-700" : "text-slate-500")}>
                      {out ? "Out of stock" : `${left} left`}
                    </span>
                  </span>
                  {inCart ? <span className="absolute -right-2 -top-2 flex h-6 min-w-6 items-center justify-center rounded-full bg-emerald-600 px-1.5 text-xs font-bold text-white">{inCart}</span> : null}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="space-y-4">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs xl:sticky xl:top-20">
          <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Current sale</div>
          <div className="space-y-4 p-4">
            {lines.length === 0 ? (
              <p className="py-6 text-center text-sm text-slate-500">Tap a dish to add it.</p>
            ) : (
              <ul className="space-y-2" data-testid="cart">
                {lines.map((l) => (
                  <li key={l.id} className="flex items-center gap-2 text-sm">
                    <span className="min-w-0 flex-1 truncate">{l.name}</span>
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => add(l, -1)} aria-label={`One less ${l.name}`}><Minus className="h-3.5 w-3.5" /></Button>
                    <span className="w-6 text-center tabular-nums">{l.quantity}</span>
                    <Button type="button" variant="outline" size="icon-sm" onClick={() => add(l, 1)} disabled={l.quantity >= l.available} aria-label={`One more ${l.name}`}><Plus className="h-3.5 w-3.5" /></Button>
                    <span className="w-24 text-right tabular-nums">{formatMoney(l.quantity * l.price)}</span>
                    <Button type="button" variant="ghost" size="icon-sm" onClick={() => setCart({ ...cart, [l.id]: 0 })} aria-label={`Remove ${l.name}`}><Trash2 className="h-3.5 w-3.5" /></Button>
                  </li>
                ))}
              </ul>
            )}
            <div className="space-y-1 border-t border-slate-100 pt-3 text-sm">
              <div className="flex justify-between text-slate-600"><span>Subtotal</span><Money value={gross} /></div>
              {discountAllowed ? (
                <div className="grid grid-cols-2 gap-2 pt-1">
                  <input aria-label="Discount" inputMode="numeric" className={cn(inputClass, "h-9")} placeholder={canDiscount ? "Discount" : `Discount (max ${discountLimit})`} value={discount} onChange={(e) => setDiscount(String(wholeNumber(e.target.value)))} />
                  <input aria-label="Discount reason" className={cn(inputClass, "h-9")} placeholder="Reason" value={discountReason} onChange={(e) => setDiscountReason(e.target.value)} disabled={!disc} />
                </div>
              ) : null}
              {overLimit ? <p className="text-xs text-rose-600">You can give at most {formatMoney(discountLimit)} of discount.</p> : null}
              {disc ? <div className="flex justify-between text-rose-700"><span>Discount</span><span>−{formatMoney(disc)}</span></div> : null}
              <div className="flex justify-between pt-1 text-lg font-bold text-slate-900"><span>Total</span><Money value={total} /></div>
            </div>
            <div>
              <div className="mb-2 text-sm font-medium text-slate-700">Paid by</div>
              <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="Paid by">
                {METHODS.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    role="radio"
                    aria-checked={method === m.id}
                    onClick={() => setMethod(m.id)}
                    className={cn("flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition", method === m.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50")}
                  >
                    <m.icon className="h-4 w-4" /> {m.label}
                  </button>
                ))}
              </div>
            </div>
            {method === "CREDIT" ? (
              <div className="space-y-2 rounded-lg border border-amber-200 bg-amber-50/60 p-3">
                <Field label="Customer who owes" htmlFor="pos-debtor">
                  <select id="pos-debtor" className={selectClass} value={debtorId} onChange={(e) => setDebtorId(e.target.value)}>
                    <option value="">New customer…</option>
                    {debtors.map((d) => (
                      <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ""}</option>
                    ))}
                  </select>
                </Field>
                {!debtorId ? (
                  <div className="grid grid-cols-2 gap-2">
                    <input aria-label="Customer name" className={inputClass} placeholder="Customer name" value={newDebtor.name} onChange={(e) => setNewDebtor({ ...newDebtor, name: e.target.value })} />
                    <input aria-label="Customer phone" className={inputClass} placeholder="Phone (optional)" value={newDebtor.phone} onChange={(e) => setNewDebtor({ ...newDebtor, phone: e.target.value })} />
                  </div>
                ) : null}
                <p className="flex items-center gap-1 text-xs text-amber-900"><UserRound className="h-3.5 w-3.5" /> The total is added to this customer's debts.</p>
              </div>
            ) : null}
            <Button className="h-12 w-full text-base" disabled={!canRecord || busy} onClick={submit}>
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : null}
              Record sale {lines.length ? `· ${formatMoney(total)}` : ""}
            </Button>
          </div>
        </div>
      </div>

      <div className="xl:col-span-2">
        <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
          <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
            <span className="text-sm font-semibold">Sales of the day</span>
            <span className="text-sm text-slate-500">
              {countOf(sales.filter((s) => !s.voided).length, "sale")} · <Money value={sales.filter((s) => !s.voided).reduce((a, s) => a + s.net, 0)} />
            </span>
          </div>
          {sales.length === 0 ? (
            <p className="px-4 py-8 text-center text-sm text-slate-500">No sales yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                    <th className="px-4 py-2 font-medium">Ref</th>
                    <th className="px-3 py-2 font-medium">Time</th>
                    <th className="px-3 py-2 font-medium">Dishes</th>
                    <th className="px-3 py-2 font-medium">Paid by</th>
                    <th className="px-3 py-2 text-right font-medium">Discount</th>
                    <th className="px-3 py-2 text-right font-medium">Total</th>
                    <th className="px-3 py-2 font-medium">By</th>
                    <th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {sales.map((s) => (
                    <tr key={s.id} className={cn("border-b border-slate-100 last:border-0", s.voided && "text-slate-400 line-through decoration-slate-300")}>
                      <td className="px-4 py-2 font-medium no-underline">{s.referenceNo}</td>
                      <td className="px-3 py-2">{s.time}</td>
                      <td className="px-3 py-2">{s.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ") || "Unlisted items"}</td>
                      <td className="px-3 py-2">
                        {METHOD_LABEL[s.method] || s.method}
                        {s.method === "CREDIT" ? <span className="text-xs text-slate-500"> · {s.customer} ({s.debtRef})</span> : null}
                      </td>
                      <td className="px-3 py-2 text-right">{s.discount ? formatMoney(s.discount) : ""}</td>
                      <td className="px-3 py-2 text-right font-medium"><Money value={s.net} /></td>
                      <td className="px-3 py-2 text-xs">{s.by}</td>
                      <td className="px-3 py-1 text-right">
                        {s.voided ? <StatusBadge status="VOIDED" /> : canVoid && !locked ? (
                          <VoidButton what="sale" reference={s.referenceNo} action={(reason) => voidRecord({ transactionId: s.id, reason })} />
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
      <Receipt sale={receipt} departmentName={departmentName} onClose={() => setReceipt(null)} />
    </div>
  );
}
