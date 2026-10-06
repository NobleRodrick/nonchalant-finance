"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Money, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useRecorder } from "@/lib/offline/react";
import { purchaseSpec } from "@/lib/rental/specs";
import { CONDITION_LABELS } from "@/lib/rental/stock-math";
import { METHOD_LABELS } from "@/lib/assets/depreciation";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { METHODS } from "@/components/rental/bookings/payments";

let seq = 0;
const blankLine = () => ({ key: `p${++seq}`, itemId: "", newName: "", newCategory: "", newPrice: "", quantity: "", unitCost: "", condition: "NEW", asAsset: false, life: "60", method: "STRAIGHT_LINE" });

/**
 * A purchase of items: supplier, how it was paid, receipt; lines of an existing item or a new one,
 * with quantity and unit cost. The stock grows at once; a line can also enter the asset register.
 */
export function PurchaseDialog({ departmentId, items, currentUserName, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ supplier: "", paymentMethod: "CASH", reference: "", boughtByName: currentUserName || "", notes: "" });
  const [lines, setLines] = useState([blankLine()]);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const setLine = (key, patch) => setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));
  const total = lines.reduce((s, l) => s + (Number(l.quantity) || 0) * (Number(l.unitCost) || 0), 0);
  const valid = f.supplier.trim() && lines.length && lines.every((l) => (l.itemId || l.newName.trim()) && Number(l.quantity) > 0 && l.unitCost !== "") && total > 0;
  const submit = async () => {
    setBusy(true);
    const input = {
      ...f,
      supplier: f.supplier.trim(),
      lines: lines.map((l) => ({
        ...(l.itemId ? { itemId: l.itemId } : { newItem: { name: l.newName.trim(), category: l.newCategory.trim(), rentalPrice: l.newPrice } }),
        quantity: Number(l.quantity),
        unitCost: Number(l.unitCost),
        condition: l.condition,
        ...(l.asAsset ? { asset: { usefulLifeMonths: Number(l.life), method: l.method } } : {}),
      })),
    };
    const out = await record(purchaseSpec(departmentId, input, files, `${f.supplier.trim()} · ${formatMoney(total)}`), { success: (r) => `Purchase ${r.referenceNo} recorded: the stock is updated.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="Record a purchase" description="The units are added to the stock at once; the item's purchase price becomes this cost." footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record {total ? formatMoney(total) : ""}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-4">
        <Field label="Supplier" required htmlFor="pu-sup" className="sm:col-span-2"><input id="pu-sup" className={inputClass} value={f.supplier} onChange={(e) => setF({ ...f, supplier: e.target.value })} /></Field>
        <Field label="Paid by" htmlFor="pu-m"><select id="pu-m" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Reference" htmlFor="pu-ref"><input id="pu-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} placeholder="Invoice no." /></Field>
        <Field label="Bought by" htmlFor="pu-by"><input id="pu-by" className={inputClass} value={f.boughtByName} onChange={(e) => setF({ ...f, boughtByName: e.target.value })} /></Field>
        <Field label="Notes" htmlFor="pu-notes" className="sm:col-span-3"><input id="pu-notes" className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      </div>
      <div className="space-y-3">
        {lines.map((l, i) => (
          <div key={l.key} className="rounded-lg border border-slate-200 p-3">
            <div className="grid gap-2 sm:grid-cols-12 sm:items-end">
              <Field label={`Item ${i + 1}`} htmlFor={`pl-it-${l.key}`} className="sm:col-span-4">
                <select id={`pl-it-${l.key}`} className={selectClass} value={l.itemId} onChange={(e) => setLine(l.key, { itemId: e.target.value })}>
                  <option value="">New item…</option>
                  {items.map((it) => <option key={it.id} value={it.id}>{it.name} ({it.code})</option>)}
                </select>
              </Field>
              <Field label="Quantity" htmlFor={`pl-q-${l.key}`} className="sm:col-span-2"><input id={`pl-q-${l.key}`} className={inputClass} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: wholeNumber(e.target.value) })} /></Field>
              <Field label="Unit cost (FCFA)" htmlFor={`pl-c-${l.key}`} className="sm:col-span-2"><input id={`pl-c-${l.key}`} className={inputClass} inputMode="numeric" value={l.unitCost} onChange={(e) => setLine(l.key, { unitCost: wholeNumber(e.target.value) })} /></Field>
              <Field label="Condition" htmlFor={`pl-cd-${l.key}`} className="sm:col-span-2"><select id={`pl-cd-${l.key}`} className={selectClass} value={l.condition} onChange={(e) => setLine(l.key, { condition: e.target.value })}>{Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              <div className="flex items-center justify-between gap-2 sm:col-span-2">
                <Money value={(Number(l.quantity) || 0) * (Number(l.unitCost) || 0)} className="text-sm font-semibold" />
                {lines.length > 1 ? <Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove line ${i + 1}`} onClick={() => setLines(lines.filter((x) => x.key !== l.key))}><Trash2 className="h-4 w-4" /></Button> : null}
              </div>
            </div>
            {!l.itemId ? (
              <div className="mt-2 grid gap-2 sm:grid-cols-3">
                <Field label="New item name" required htmlFor={`pl-n-${l.key}`}><input id={`pl-n-${l.key}`} className={inputClass} value={l.newName} onChange={(e) => setLine(l.key, { newName: e.target.value })} /></Field>
                <Field label="Category" htmlFor={`pl-nc-${l.key}`}><input id={`pl-nc-${l.key}`} list="rental-categories" className={inputClass} value={l.newCategory} onChange={(e) => setLine(l.key, { newCategory: e.target.value })} /></Field>
                <Field label="Rental price per event" htmlFor={`pl-np-${l.key}`}><input id={`pl-np-${l.key}`} className={inputClass} inputMode="numeric" value={l.newPrice} onChange={(e) => setLine(l.key, { newPrice: wholeNumber(e.target.value) })} /></Field>
              </div>
            ) : null}
            <label className="mt-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={l.asAsset} onChange={(e) => setLine(l.key, { asAsset: e.target.checked })} /> Long-term asset: add to the asset register (depreciated)</label>
            {l.asAsset ? (
              <div className={cn("mt-2 grid gap-2 sm:grid-cols-3")}>
                <Field label="Useful life (months)" htmlFor={`pl-l-${l.key}`}><input id={`pl-l-${l.key}`} className={inputClass} inputMode="numeric" value={l.life} onChange={(e) => setLine(l.key, { life: wholeNumber(e.target.value) })} /></Field>
                <Field label="Method" htmlFor={`pl-dm-${l.key}`}><select id={`pl-dm-${l.key}`} className={selectClass} value={l.method} onChange={(e) => setLine(l.key, { method: e.target.value })}>{Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
              </div>
            ) : null}
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, blankLine()])}><Plus className="h-4 w-4" /> Add a line</Button>
      </div>
      <div className="flex justify-end text-base font-semibold">Total <Money value={total} className="ml-3" /></div>
      <ProofUpload value={files} onChange={setFiles} label="Attach the receipt or invoice" />
    </FormDialog>
  );
}
