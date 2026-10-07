"use client";

import { useMemo, useRef, useState } from "react";
import { Beer, Minus, Plus, Receipt, ScanBarcode, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Pill, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { VoidButton } from "@/components/kit/void-button";
import { useRecorder } from "@/lib/offline/react";
import { voidSpec } from "@/lib/offline/specs";
import { saleSpec, tabAddSpec, tabCancelSpec, tabCloseSpec, tabOpenSpec, tabRemoveSpec } from "@/lib/trade/specs";
import { cartTotals } from "@/lib/trade/stock-math";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "./barcode-scanner";

export const SALE_METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank / card"], ["OTHER", "Other"], ["CREDIT", "On credit"]];
const METHOD_NAMES = Object.fromEntries(SALE_METHODS);
const blankPay = { paymentMethod: "CASH", tendered: "", reference: "", debtorId: "", debtorName: "", debtorPhone: "", discount: "", discountReason: "" };

/** How the customer pays: cash (change), Mobile Money / bank / other (reference), or on credit (the customer). */
export function CheckoutFields({ value: f, onChange, total, debtors, canDiscount, discountLimit, idPrefix = "co" }) {
  const set = (k) => (e) => onChange({ ...f, [k]: ["tendered", "discount"].includes(k) ? wholeNumber(e.target.value) : e.target.value });
  const net = Math.max(0, total - (Number(f.discount) || 0));
  const change = f.paymentMethod === "CASH" && Number(f.tendered) > net ? Number(f.tendered) - net : 0;
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-5" role="radiogroup" aria-label="How the customer pays">
        {SALE_METHODS.map(([k, label]) => (
          <button key={k} type="button" role="radio" aria-checked={f.paymentMethod === k} onClick={() => onChange({ ...f, paymentMethod: k })} className={cn("rounded-lg border px-2 py-2 text-xs font-medium", f.paymentMethod === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white hover:bg-slate-50")}>
            {label}
          </button>
        ))}
      </div>
      {canDiscount || discountLimit > 0 ? (
        <div className="grid grid-cols-2 gap-2">
          <Field label={`Discount${!canDiscount && discountLimit ? ` (max ${formatMoney(discountLimit)})` : ""}`} htmlFor={`${idPrefix}-d`}><input id={`${idPrefix}-d`} className={inputClass} inputMode="numeric" value={f.discount} onChange={set("discount")} placeholder="0" /></Field>
          <Field label="Reason" htmlFor={`${idPrefix}-dr`} required={Number(f.discount) > 0}><input id={`${idPrefix}-dr`} className={inputClass} value={f.discountReason} onChange={set("discountReason")} placeholder="Regular customer…" /></Field>
        </div>
      ) : null}
      {f.paymentMethod === "CASH" ? (
        <div className="grid grid-cols-2 items-end gap-2">
          <Field label="Cash given" htmlFor={`${idPrefix}-t`}><input id={`${idPrefix}-t`} className={inputClass} inputMode="numeric" value={f.tendered} onChange={set("tendered")} placeholder={String(net)} /></Field>
          <div className="pb-2 text-sm">Change: <strong className="tabular-nums" data-testid="change">{formatMoney(change)}</strong></div>
        </div>
      ) : f.paymentMethod === "CREDIT" ? (
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Customer" required htmlFor={`${idPrefix}-c`} className="sm:col-span-2">
            <select id={`${idPrefix}-c`} className={selectClass} value={f.debtorId} onChange={set("debtorId")}>
              <option value="">New customer…</option>
              {debtors.map((d) => <option key={d.id} value={d.id}>{d.name}{d.phone ? ` · ${d.phone}` : ""}</option>)}
            </select>
          </Field>
          {!f.debtorId ? (
            <>
              <Field label="Name" required htmlFor={`${idPrefix}-cn`}><input id={`${idPrefix}-cn`} className={inputClass} value={f.debtorName} onChange={set("debtorName")} /></Field>
              <Field label="Phone" htmlFor={`${idPrefix}-cp`}><input id={`${idPrefix}-cp`} className={inputClass} inputMode="tel" value={f.debtorPhone} onChange={set("debtorPhone")} /></Field>
            </>
          ) : null}
        </div>
      ) : (
        <Field label="Transaction reference" required htmlFor={`${idPrefix}-r`}><input id={`${idPrefix}-r`} className={inputClass} value={f.reference} onChange={set("reference")} placeholder={f.paymentMethod === "MOMO" ? "MoMo transaction id" : "Slip / card receipt no."} /></Field>
      )}
    </div>
  );
}

export function checkoutReady(f, total) {
  const d = Number(f.discount) || 0;
  if (d > total || (d > 0 && !f.discountReason.trim())) return false;
  if (f.paymentMethod === "CREDIT") return Boolean(f.debtorId || f.debtorName.trim());
  if (["MOMO", "BANK_TRANSFER", "OTHER"].includes(f.paymentMethod)) return Boolean(f.reference.trim());
  return true;
}

export function checkoutInput(f) {
  return {
    paymentMethod: f.paymentMethod,
    discount: Number(f.discount) || 0,
    discountReason: f.discountReason.trim() || null,
    reference: f.paymentMethod === "CASH" || f.paymentMethod === "CREDIT" ? null : f.reference.trim(),
    tendered: f.paymentMethod === "CASH" ? Number(f.tendered) || 0 : 0,
    ...(f.paymentMethod === "CREDIT" ? (f.debtorId ? { debtorId: f.debtorId } : { debtor: { name: f.debtorName.trim(), phone: f.debtorPhone.trim() || null } }) : {}),
  };
}

/**
 * The till of a shop, bar or other activity: products by search, category, USB barcode scanner
 * (it types the code and Enter in the search box) or the camera; the cart (quantities, prices
 * with the right); payment by cash (change), Mobile Money, bank, other, or on credit. Bar: rounds
 * go on a table's tab, paid at the end.
 */
export function TradePOS({ departmentId, domain, dateKey, locked, products, debtors, tabs = [], sales, canPrice, canDiscount, discountLimit, canVoid, words }) {
  const record = useRecorder();
  const search = useRef(null);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [cart, setCart] = useState([]);
  const [pay, setPay] = useState(blankPay);
  const [busy, setBusy] = useState(false);
  const [tabDialog, setTabDialog] = useState(null);
  const bar = domain === "BAR";
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const categories = useMemo(() => [...new Set(products.map((p) => p.category).filter(Boolean))].sort(), [products]);
  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return products.filter((p) => (!category || p.category === category) && (!t || `${p.name} ${p.code} ${p.barcode || ""} ${p.category || ""}`.toLowerCase().includes(t))).slice(0, 120);
  }, [products, q, category]);
  const totals = cartTotals(cart, 0);
  const left = (p) => (p.kind === "SERVICE" ? Infinity : p.quantity - cart.filter((l) => l.productId === p.id).reduce((s, l) => s + Number(l.quantity || 0), 0));

  const add = (p, quantity = 1) => {
    if (left(p) < quantity) return toast.error(`Only ${p.quantity} ${p.unit} of ${p.name} in stock.`);
    setCart((c) => {
      const i = c.findIndex((l) => l.productId === p.id);
      if (i >= 0) return c.map((l, j) => (j === i ? { ...l, quantity: Number(l.quantity) + quantity } : l));
      return [...c, { productId: p.id, name: p.name, unit: p.unit, quantity, unitPrice: p.salePrice, listPrice: p.salePrice }];
    });
  };
  const byCode = (code) => {
    const c = String(code || "").trim();
    if (!c) return false;
    const p = products.find((x) => x.barcode === c || x.code.toLowerCase() === c.toLowerCase());
    if (!p) {
      toast.error(`No product with the code ${c}.`);
      return false;
    }
    add(p);
    return true;
  };
  const onSearchKey = (e) => {
    if (e.key !== "Enter") return;
    e.preventDefault();
    if (byCode(q)) setQ("");
    else if (shown.length === 1) {
      add(shown[0]);
      setQ("");
    }
  };
  const setLine = (i, patch) => setCart((c) => c.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const reset = () => {
    setCart([]);
    setPay(blankPay);
    search.current?.focus();
  };
  const lines = () => cart.map((l) => ({ productId: l.productId, quantity: Number(l.quantity), ...(Number(l.unitPrice) !== l.listPrice ? { unitPrice: Number(l.unitPrice) } : {}) }));
  const cartOk = cart.length && cart.every((l) => Number(l.quantity) > 0 && l.unitPrice !== "");

  const submit = async () => {
    setBusy(true);
    const input = { ...checkoutInput(pay), lines: lines(), ...(dateKey ? { dateKey } : {}) };
    const out = await record({ ...saleSpec(departmentId, input, cart, totals.gross - (Number(pay.discount) || 0)), dateKey: dateKey || undefined }, { success: (d) => (d?.change ? `Sale ${d.referenceNo} recorded · change ${formatMoney(d.change)}` : `Sale ${d?.referenceNo || ""} recorded.`) });
    setBusy(false);
    if (out) reset();
  };
  const toTab = async (tab, label) => {
    setBusy(true);
    const out = tab ? await record(tabAddSpec(departmentId, tab, cart), { success: `Served on ${tab.label}.` }) : await record(tabOpenSpec(departmentId, { label, lines: lines() }), { success: `Tab ${label} opened.` });
    setBusy(false);
    if (out) {
      setTabDialog(null);
      reset();
    }
  };

  return (
    <div className="space-y-6">
      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <Section bodyClassName="space-y-3">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <ScanBarcode className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input ref={search} autoFocus aria-label="Search or scan" data-testid="pos-search" className={cn(inputClass, "pl-9")} placeholder={`Search ${words.items.toLowerCase()}, or scan a barcode`} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={onSearchKey} disabled={locked} />
            </div>
            <BarcodeScanner onCode={byCode} />
          </div>
          {categories.length > 1 ? (
            <div className="flex flex-wrap gap-1.5">
              {["", ...categories].map((c) => <button key={c || "all"} type="button" onClick={() => setCategory(c)} className={cn("rounded-full border px-3 py-1 text-xs", category === c ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white")}>{c || "All"}</button>)}
            </div>
          ) : null}
          {shown.length ? (
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-4" data-testid="pos-products">
              {shown.map((p) => {
                const out = left(p) <= 0;
                return (
                  <button key={p.id} type="button" disabled={locked || out} onClick={() => add(p)} className={cn("rounded-lg border p-3 text-left transition", out ? "border-slate-100 bg-slate-50 text-slate-400" : "border-slate-200 bg-white hover:border-slate-400 hover:shadow-sm")}>
                    <div className="line-clamp-2 text-sm font-medium">{p.name}</div>
                    <div className="mt-1 flex items-baseline justify-between gap-1 text-xs">
                      <span className="font-semibold tabular-nums text-slate-900">{formatMoney(p.salePrice)}</span>
                      <span className={cn("tabular-nums", p.low ? "text-amber-700" : "text-slate-500")}>{p.kind === "SERVICE" ? "service" : out ? "out of stock" : `${p.quantity} ${p.unit}`}</span>
                    </div>
                  </button>
                );
              })}
            </div>
          ) : (
            <p className="py-8 text-center text-sm text-slate-500">{products.length ? "Nothing matches." : `No ${words.items.toLowerCase()} yet: add them on the ${words.catalog} page.`}</p>
          )}
        </Section>

        <Section title="Cart" description={cart.length ? `${cart.length} line(s)` : "Tap a product or scan it"} bodyClassName="space-y-3">
          {cart.length ? (
            <ul className="divide-y divide-slate-100" data-testid="cart">
              {cart.map((l, i) => (
                <li key={l.productId} className="py-2">
                  <div className="flex items-start justify-between gap-2">
                    <span className="text-sm font-medium">{l.name}</span>
                    <button type="button" aria-label={`Remove ${l.name}`} onClick={() => setCart(cart.filter((_, j) => j !== i))} className="text-slate-400 hover:text-rose-600"><X className="h-4 w-4" /></button>
                  </div>
                  <div className="mt-1 flex items-center gap-1.5">
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="One less" onClick={() => setLine(i, { quantity: Math.max(1, Number(l.quantity) - 1) })}><Minus className="h-3 w-3" /></Button>
                    <input aria-label={`Quantity of ${l.name}`} className={cn(inputClass, "h-7 w-16 text-center")} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: e.target.value.replace(",", ".") })} />
                    <Button type="button" size="icon" variant="outline" className="h-7 w-7" aria-label="One more" onClick={() => (left(byId[l.productId]) >= 1 ? setLine(i, { quantity: Number(l.quantity) + 1 }) : toast.error("No more in stock."))}><Plus className="h-3 w-3" /></Button>
                    <span className="text-xs text-slate-500">×</span>
                    {canPrice ? <input aria-label={`Price of ${l.name}`} className={cn(inputClass, "h-7 w-24 text-right")} inputMode="numeric" value={l.unitPrice} onChange={(e) => setLine(i, { unitPrice: wholeNumber(e.target.value) })} /> : <span className="text-xs tabular-nums">{formatMoney(l.unitPrice)}</span>}
                    <span className="ml-auto text-sm font-semibold tabular-nums">{formatMoney(Math.round(Number(l.quantity || 0) * Number(l.unitPrice || 0)))}</span>
                  </div>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex items-baseline justify-between border-t border-slate-200 pt-2">
            <span className="text-sm text-slate-600">Total</span>
            <span className="text-2xl font-bold tabular-nums" data-testid="cart-total">{formatMoney(totals.gross - (Number(pay.discount) || 0))}</span>
          </div>
          {cart.length ? <CheckoutFields value={pay} onChange={setPay} total={totals.gross} debtors={debtors} canDiscount={canDiscount} discountLimit={discountLimit} /> : null}
          <div className="flex flex-wrap gap-2">
            <SubmitButton busy={busy} disabled={locked || !cartOk || !checkoutReady(pay, totals.gross)} onClick={submit}><Receipt className="h-4 w-4" /> {pay.paymentMethod === "CREDIT" ? "Record on credit" : "Record the sale"}</SubmitButton>
            {bar ? <Button type="button" variant="outline" disabled={locked || !cartOk || busy} onClick={() => setTabDialog("add")}><Beer className="h-4 w-4" /> Put on a tab</Button> : null}
            {cart.length ? <Button type="button" variant="ghost" onClick={reset}><Trash2 className="h-4 w-4" /> Clear</Button> : null}
          </div>
        </Section>
      </div>

      {bar ? <TabsPanel departmentId={departmentId} tabs={tabs} debtors={debtors} canDiscount={canDiscount} discountLimit={discountLimit} canVoid={canVoid} locked={locked} /> : null}

      <Section title="Sales of the day" description={`${sales.filter((s) => !s.voided).length} sale(s) · ${formatMoney(sales.filter((s) => !s.voided).reduce((s, x) => s + x.net, 0))}`} bodyClassName="p-0">
        <DataTable
          dense
          rows={sales}
          empty="No sale yet."
          rowClassName={(s) => (s.voided ? "opacity-50 line-through" : "")}
          columns={[
            { key: "r", label: "Sale", render: (s) => <a href={`/d/${departmentId}/money/receipt/${s.id}`} className="font-mono text-xs underline" title="Receipt">{s.referenceNo}</a> },
            { key: "t", label: "Time", render: (s) => s.time },
            { key: "w", label: "What", render: (s) => <span className="text-xs">{s.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}{s.tab ? <Pill className="ml-1">{s.tab}</Pill> : null}</span> },
            { key: "m", label: "Paid", render: (s) => <span className="text-xs">{METHOD_NAMES[s.method] || s.method}{s.customer ? ` · ${s.customer}` : ""}</span> },
            { key: "n", label: "Amount", align: "right", render: (s) => <Money value={s.net} suffix={false} /> },
            { key: "b", label: "By", render: (s) => <span className="text-xs">{s.by}</span> },
            { key: "x", label: "", render: (s) => (!s.voided && canVoid && !locked ? <VoidButton label="Undo" what="sale" reference={s.referenceNo} onVoid={(reason) => record(voidSpec({ departmentId, row: { ...s, lines: [] }, type: "SALE", reason }), { success: `${s.referenceNo} undone: goods back in stock.` })} /> : s.voided ? <span className="text-xs">{s.voidReason}</span> : null) },
          ]}
        />
      </Section>
      {tabDialog ? <PutOnTabDialog tabs={tabs} busy={busy} onClose={() => setTabDialog(null)} onPick={toTab} /> : null}
    </div>
  );
}

function PutOnTabDialog({ tabs, busy, onClose, onPick }) {
  const [label, setLabel] = useState("");
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title="Put on a tab" description="The drinks leave the stock now; the tab is paid when the customer leaves.">
      {tabs.length ? (
        <div className="grid gap-2 sm:grid-cols-2">
          {tabs.map((t) => <Button key={t.id} variant="outline" disabled={busy} onClick={() => onPick(t)} className="justify-between"><span>{t.label}</span><span className="tabular-nums text-slate-500">{formatMoney(t.total)}</span></Button>)}
        </div>
      ) : null}
      <div className="flex items-end gap-2">
        <Field label="New tab (table, customer)" htmlFor="tab-new" className="flex-1"><input id="tab-new" className={inputClass} value={label} onChange={(e) => setLabel(e.target.value)} placeholder="Table 4" /></Field>
        <SubmitButton busy={busy} disabled={!label.trim()} onClick={() => onPick(null, label.trim())}>Open the tab</SubmitButton>
      </div>
    </FormDialog>
  );
}

/** Open tabs of a bar: rounds served, a line taken off (with a reason), paid at the end, or cancelled. */
function TabsPanel({ departmentId, tabs, debtors, canDiscount, discountLimit, canVoid, locked }) {
  const record = useRecorder();
  const [paying, setPaying] = useState(null);
  return (
    <Section title="Open tabs" description={tabs.length ? `${tabs.length} tab(s) · ${formatMoney(tabs.reduce((s, t) => s + t.total, 0))} to collect` : "No tab open."} bodyClassName={tabs.length ? "grid gap-3 md:grid-cols-2 xl:grid-cols-3" : undefined}>
      {tabs.length ? tabs.map((t) => (
        <div key={t.id} className="rounded-lg border border-slate-200 p-3" data-testid="tab-card">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">{t.label}</span>
            <span className="text-xs text-slate-500">{t.referenceNo} · since {t.openedTime}</span>
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {t.lines.map((l) => (
              <li key={l.id} className="flex items-center justify-between gap-2">
                <span>{l.quantity} × {l.name} <span className="text-xs text-slate-400">{l.time}</span></span>
                <span className="flex items-center gap-1 tabular-nums">{formatMoney(l.total)}{!locked ? <VoidButton label="" what="line" reference={`${l.quantity} × ${l.name}`} size="icon" onVoid={(reason) => record(tabRemoveSpec(departmentId, l, reason), { success: "Taken off the tab: back in stock." })} /> : null}</span>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex items-center justify-between border-t border-slate-100 pt-2">
            <strong className="tabular-nums">{formatMoney(t.total)}</strong>
            <div className="flex gap-1">
              {canVoid && !locked ? <VoidButton label="Cancel" what="tab" reference={t.label} onVoid={(reason) => record(tabCancelSpec(departmentId, t, reason), { success: `${t.label} cancelled.` })} /> : null}
              <Button size="sm" disabled={locked || !t.lines.length} onClick={() => setPaying(t)}>Pay</Button>
            </div>
          </div>
        </div>
      )) : <p className="text-sm text-slate-500">Put a round on a tab from the cart; the customer pays everything at the end.</p>}
      {paying ? <CloseTabDialog departmentId={departmentId} tab={paying} debtors={debtors} canDiscount={canDiscount} discountLimit={discountLimit} onClose={() => setPaying(null)} /> : null}
    </Section>
  );
}

function CloseTabDialog({ departmentId, tab, debtors, canDiscount, discountLimit, onClose }) {
  const record = useRecorder();
  const [pay, setPay] = useState(blankPay);
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(tabCloseSpec(departmentId, tab, checkoutInput(pay)), { success: (d) => (d?.change ? `${tab.label} paid · change ${formatMoney(d.change)}` : `${tab.label} paid.`) });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Pay ${tab.label}`} description={`${tab.lines.length} line(s) · ${formatMoney(tab.total)}`} footer={<SubmitButton busy={busy} disabled={!checkoutReady(pay, tab.total)} onClick={submit}>Record the payment</SubmitButton>}>
      <CheckoutFields value={pay} onChange={setPay} total={tab.total} debtors={debtors} canDiscount={canDiscount} discountLimit={discountLimit} idPrefix="tc" />
    </FormDialog>
  );
}
