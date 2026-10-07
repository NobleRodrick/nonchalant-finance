"use client";

import { useMemo, useState } from "react";
import { HandCoins, Plus, Trash2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Pill, Section, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { VoidButton } from "@/components/kit/void-button";
import { ExportMenu } from "@/components/kit/export-menu";
import { PaymentFields, METHOD_NAMES, paymentReady } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { billPaySpec, purchaseSpec, purchaseVoidSpec } from "@/lib/trade/specs";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank transfer"], ["OTHER", "Other"], ["CREDIT", "On credit (pay later)"]];
const decimal = (v) => String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, "");
const blankLine = { productId: "", quantity: "", unitCost: "" };

/** Goods bought: paid now or on credit (a supplier bill), with VAT on the invoice (VAT companies) and crates (bar). */
function PurchaseDialog({ departmentId, products, packagings, suppliers, vat, bar, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ supplierName: "", supplierRef: "", paymentMethod: "CASH", reference: "", dueKey: "", taxAmount: "" });
  const [lines, setLines] = useState([{ ...blankLine }]);
  const [crates, setCrates] = useState({});
  const [empties, setEmpties] = useState({});
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => Object.fromEntries(products.map((p) => [p.id, p])), [products]);
  const set = (k) => (e) => setF({ ...f, [k]: k === "taxAmount" ? wholeNumber(e.target.value) : e.target.value });
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const pick = (i, productId) => setLine(i, { productId, unitCost: lines[i].unitCost || String(byId[productId]?.costPrice || "") });
  const total = lines.reduce((s, l) => s + Math.round(Number(l.quantity || 0) * Number(l.unitCost || 0)), 0);
  const credit = f.paymentMethod === "CREDIT";
  // Bar: crates that come with the bottles (suggested from the products' crates).
  const suggested = {};
  for (const l of lines) {
    const p = byId[l.productId];
    if (p?.packagingId && p.unitsPerPack > 0) suggested[p.packagingId] = (suggested[p.packagingId] || 0) + Math.ceil(Number(l.quantity || 0) / p.unitsPerPack);
  }
  const crateQty = (id) => (crates[id] !== undefined ? crates[id] : suggested[id] || "");
  const deposits = credit ? 0 : packagings.reduce((s, p) => s + (Number(crateQty(p.id)) || 0) * p.deposit - (Number(empties[p.id]) || 0) * p.deposit, 0);
  const valid = f.supplierName.trim() && lines.some((l) => l.productId && Number(l.quantity) > 0) && lines.every((l) => !l.productId || (Number(l.quantity) > 0 && l.unitCost !== "")) && (credit || f.paymentMethod === "CASH" || f.reference.trim()) && (!f.taxAmount || Number(f.taxAmount) < total);
  const submit = async () => {
    setBusy(true);
    const input = {
      ...f,
      supplierName: f.supplierName.trim(),
      taxAmount: Number(f.taxAmount) || 0,
      dueKey: credit && f.dueKey ? f.dueKey : null,
      lines: lines.filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity), unitCost: Number(l.unitCost) })),
      ...(bar ? { crates: packagings.map((p) => ({ packagingId: p.id, quantity: Number(crateQty(p.id)) || 0 })).filter((c) => c.quantity), emptiesReturned: packagings.map((p) => ({ packagingId: p.id, quantity: Number(empties[p.id]) || 0 })).filter((c) => c.quantity) } : {}),
    };
    const out = await record(purchaseSpec(departmentId, input, total), { success: (d) => `Purchase ${d?.referenceNo || ""} recorded: the stock went up.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="Record a purchase" description="The goods enter the stock at what they cost; the average cost of each product follows." footer={<><span className="mr-auto text-sm">Goods <strong className="tabular-nums">{formatMoney(total)}</strong>{deposits ? <> · crates deposit <strong className="tabular-nums">{formatMoney(deposits)}</strong></> : null}</span><SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record the purchase</SubmitButton></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Supplier" required htmlFor="pu-s"><input id="pu-s" className={inputClass} list="pu-suppliers" value={f.supplierName} onChange={set("supplierName")} /><datalist id="pu-suppliers">{suppliers.map((s) => <option key={s} value={s} />)}</datalist></Field>
        <Field label="Supplier's invoice no." htmlFor="pu-r"><input id="pu-r" className={inputClass} value={f.supplierRef} onChange={set("supplierRef")} /></Field>
        <Field label="Paid by" htmlFor="pu-m"><select id="pu-m" className={selectClass} value={f.paymentMethod} onChange={set("paymentMethod")}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        {credit ? <Field label="To pay by" htmlFor="pu-d" hint="The bill appears in Supplier bills"><input id="pu-d" type="date" className={inputClass} value={f.dueKey} onChange={set("dueKey")} /></Field> : f.paymentMethod !== "CASH" ? <Field label="Transaction reference" required htmlFor="pu-ref"><input id="pu-ref" className={inputClass} value={f.reference} onChange={set("reference")} /></Field> : null}
        {vat ? <Field label="VAT on the invoice (FCFA)" htmlFor="pu-v" hint="Deductible VAT, included in the totals"><input id="pu-v" className={inputClass} inputMode="numeric" value={f.taxAmount} onChange={set("taxAmount")} /></Field> : null}
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_90px_110px_100px_32px] gap-2 text-xs font-medium text-slate-500"><span>Product</span><span>Quantity</span><span>Unit cost</span><span className="text-right">Total</span><span /></div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_90px_110px_100px_32px] items-center gap-2">
            <select aria-label="Product" className={selectClass} value={l.productId} onChange={(e) => pick(i, e.target.value)}><option value="">Choose…</option>{products.map((p) => <option key={p.id} value={p.id}>{p.name} ({p.quantity} {p.unit})</option>)}</select>
            <input aria-label="Quantity" className={inputClass} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: decimal(e.target.value) })} />
            <input aria-label="Unit cost" className={inputClass} inputMode="numeric" value={l.unitCost} onChange={(e) => setLine(i, { unitCost: wholeNumber(e.target.value) })} />
            <span className="text-right text-sm tabular-nums">{formatMoney(Math.round(Number(l.quantity || 0) * Number(l.unitCost || 0)))}</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove the line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { ...blankLine }])}><Plus className="h-4 w-4" /> Another product</Button>
      </div>
      {bar && packagings.length ? (
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <div className="text-sm font-medium">Crates {credit ? <span className="font-normal text-slate-500">(on credit: owed back in kind, no deposit now)</span> : null}</div>
          {packagings.map((p) => (
            <div key={p.id} className="grid grid-cols-[1fr_110px_110px] items-center gap-2 text-sm">
              <span>{p.name} <span className="text-xs text-slate-500">· {formatMoney(p.deposit)} deposit · {p.owedToSuppliers} owed back</span></span>
              <input aria-label={`Full crates of ${p.name} received`} className={inputClass} inputMode="numeric" placeholder="received" value={crateQty(p.id)} onChange={(e) => setCrates({ ...crates, [p.id]: wholeNumber(e.target.value) })} />
              <input aria-label={`Empties of ${p.name} given back`} className={inputClass} inputMode="numeric" placeholder="empties back" value={empties[p.id] || ""} onChange={(e) => setEmpties({ ...empties, [p.id]: wholeNumber(e.target.value) })} />
            </div>
          ))}
        </div>
      ) : null}
    </FormDialog>
  );
}

function PayBillDialog({ departmentId, bill, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ amount: String(bill.balance), paymentMethod: "CASH", reference: "", receivedByName: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(billPaySpec(departmentId, bill, { amount: Number(f.amount), paymentMethod: f.paymentMethod, reference: f.reference }), { success: `${bill.supplier} paid.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Pay ${bill.supplier}`} description={`${bill.referenceNo}${bill.supplierRef ? ` · invoice ${bill.supplierRef}` : ""} · ${formatMoney(bill.balance)} left to pay`} footer={<SubmitButton busy={busy} disabled={!paymentReady(f) || Number(f.amount) > bill.balance} onClick={submit}>Record the payment</SubmitButton>}>
      <PaymentFields value={f} onChange={setF} idPrefix="bp" amountLabel="Amount paid (FCFA)" showBy={false} />
    </FormDialog>
  );
}

/** Purchases of the period (paid or on credit) and the supplier bills still to pay. */
export function TradePurchasesBoard({ departmentId, purchases, bills, products, packagings = [], suppliers, perms, vat, bar, fileName, initialTab = "purchases" }) {
  const record = useRecorder();
  const [tab, setTab] = useState(initialTab);
  const [dialog, setDialog] = useState(null);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="inline-flex rounded-lg border border-slate-200 bg-white p-0.5" role="tablist">
          {[["purchases", `Purchases (${purchases.length})`], ["bills", `Supplier bills to pay (${bills.length})`]].map(([k, l]) => <button key={k} role="tab" aria-selected={tab === k} type="button" onClick={() => setTab(k)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === k ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>{l}</button>)}
        </div>
        <div className="flex gap-2">
          {perms.export ? <ExportMenu fileName={fileName} sheets={[{ name: "Purchases", columns: [{ label: "Reference", value: (p) => p.referenceNo }, { label: "Date", value: (p) => p.dateKey }, { label: "Supplier", value: (p) => p.supplier }, { label: "Invoice", value: (p) => p.supplierRef || "" }, { label: "Paid by", value: (p) => METHOD_NAMES[p.method] || p.method }, { label: "Goods", value: (p) => p.total }, { label: "Crates deposit", value: (p) => p.deposits }, { label: "Status", value: (p) => (p.voided ? "Voided" : "Recorded") }], rows: purchases }, { name: "Bills", columns: [{ label: "Bill", value: (b) => b.referenceNo }, { label: "Supplier", value: (b) => b.supplier }, { label: "Due", value: (b) => b.dueKey || "" }, { label: "Total", value: (b) => b.total }, { label: "Paid", value: (b) => b.paid }, { label: "Left", value: (b) => b.balance }], rows: bills }]} /> : null}
          {perms.purchases ? <Button onClick={() => setDialog({ kind: "purchase" })}><Truck className="h-4 w-4" /> Record a purchase</Button> : null}
        </div>
      </div>
      {tab === "purchases" ? (
        <Section bodyClassName="p-0">
          <DataTable
            rows={purchases}
            rowClassName={(p) => (p.voided ? "opacity-50" : "")}
            empty="No purchase in this period."
            columns={[
              { key: "r", label: "Purchase", render: (p) => <span className="font-mono text-xs">{p.referenceNo}</span> },
              { key: "d", label: "Date", render: (p) => formatDateKey(p.dateKey, { weekday: false }) },
              { key: "s", label: "Supplier", render: (p) => <span>{p.supplier}{p.supplierRef ? <span className="block text-xs text-slate-500">invoice {p.supplierRef}</span> : null}</span> },
              { key: "w", label: "Goods", render: (p) => <span className="text-xs">{p.lines.map((l) => `${l.quantity} ${l.unit} ${l.name} @ ${formatMoney(l.unitCost)}`).join(", ")}</span> },
              { key: "m", label: "Paid", render: (p) => (p.bill ? <span className="text-xs">On credit · {p.bill.referenceNo}<span className="block"><StatusBadge status={p.bill.status === "PARTIAL" ? "PARTIALLY_PAID" : p.bill.status === "OPEN" ? "UNPAID" : p.bill.status} /></span></span> : <span className="text-xs">{METHOD_NAMES[p.method] || p.method}</span>) },
              { key: "t", label: "Total", align: "right", render: (p) => <span><Money value={p.total} suffix={false} />{p.deposits ? <span className="block text-xs text-slate-500">+ crates {formatMoney(p.deposits)}</span> : null}</span> },
              { key: "b", label: "By", render: (p) => <span className="text-xs">{p.by}</span> },
              { key: "x", label: "", render: (p) => (p.voided ? <Pill>voided · {p.voidReason}</Pill> : perms.void ? <VoidButton what="purchase" reference={p.referenceNo} onVoid={(reason) => record(purchaseVoidSpec(departmentId, p, reason), { success: `${p.referenceNo} voided: the goods left the stock.` })} /> : null) },
            ]}
          />
        </Section>
      ) : (
        <Section bodyClassName="p-0" description="Purchases on credit: pay all or part; the bill closes when fully paid.">
          <DataTable
            rows={bills}
            empty="No supplier bill to pay."
            columns={[
              { key: "r", label: "Bill", render: (b) => <span className="font-mono text-xs">{b.referenceNo}</span> },
              { key: "s", label: "Supplier", render: (b) => <span>{b.supplier}{b.supplierRef ? <span className="block text-xs text-slate-500">invoice {b.supplierRef}</span> : null}</span> },
              { key: "d", label: "Bought", render: (b) => formatDateKey(b.dateKey, { weekday: false }) },
              { key: "due", label: "Due", render: (b) => (b.dueKey ? formatDateKey(b.dueKey, { weekday: false }) : "—") },
              { key: "t", label: "Total", align: "right", render: (b) => <Money value={b.total} suffix={false} /> },
              { key: "p", label: "Paid", align: "right", render: (b) => <Money value={b.paid} suffix={false} /> },
              { key: "l", label: "Left", align: "right", render: (b) => <strong><Money value={b.balance} suffix={false} /></strong> },
              { key: "x", label: "", render: (b) => (perms.purchases ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "pay", bill: b })}><HandCoins className="h-4 w-4" /> Pay</Button> : null) },
            ]}
          />
        </Section>
      )}
      {dialog?.kind === "purchase" ? <PurchaseDialog departmentId={departmentId} products={products} packagings={packagings} suppliers={suppliers} vat={vat} bar={bar} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "pay" ? <PayBillDialog departmentId={departmentId} bill={dialog.bill} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
