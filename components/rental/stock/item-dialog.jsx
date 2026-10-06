"use client";

import { useState } from "react";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useRecorder } from "@/lib/offline/react";
import { itemSaveSpec } from "@/lib/rental/specs";
import { CONDITION_LABELS } from "@/lib/rental/stock-math";
import { RENTAL_ITEM_CATEGORIES } from "@/lib/domains/rental";

const blank = { name: "", code: "", category: "", unit: "piece", description: "", rentalPrice: "", purchasePrice: "", replacementValue: "", purchasedOn: "", supplier: "", condition: "GOOD", location: "", lowStockLevel: "", openingQuantity: "" };

/** A stock line: details, prices, place, photo; for a new line, how many units there are now. */
export function ItemDialog({ departmentId, item, categories = [], onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(() => (item ? { ...blank, ...Object.fromEntries(Object.keys(blank).map((k) => [k, item[k] ?? ""])), purchasedOn: item.purchasedOn ? String(item.purchasedOn).slice(0, 10) : "" } : blank));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (k) => (e) => setF({ ...f, [k]: wholeNumber(e.target.value) });
  const suggestions = [...new Set([...RENTAL_ITEM_CATEGORIES, ...categories])];
  const submit = async () => {
    setBusy(true);
    const input = { ...(item ? { id: item.id } : {}), ...f, name: f.name.trim() };
    if (item) delete input.openingQuantity;
    const out = await record(itemSaveSpec(departmentId, input, files), { success: item ? `${input.name} saved.` : `${input.name} added to the stock.` });
    setBusy(false);
    if (out) onClose(out);
  };
  return (
    <FormDialog
      wide
      open
      onOpenChange={(v) => !v && onClose()}
      title={item ? `${item.name} (${item.code})` : "New stock item"}
      description={item ? "Quantities change only through bookings, returns, purchases and corrections." : "Add one line per kind of item. Its code is made from the name unless you type one."}
      footer={<SubmitButton busy={busy} disabled={!f.name.trim()} onClick={submit}>{item ? "Save" : "Add to the stock"}</SubmitButton>}
    >
      <datalist id="rental-categories">{suggestions.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Item name" required htmlFor="it-name" className="sm:col-span-2"><input id="it-name" className={inputClass} value={f.name} onChange={set("name")} placeholder="e.g. Chiavari chairs (gold)" /></Field>
        <Field label="Code" htmlFor="it-code" hint="Leave empty: made from the name."><input id="it-code" className={inputClass} value={f.code} onChange={set("code")} placeholder="CHR-001" /></Field>
        <Field label="Category" htmlFor="it-cat"><input id="it-cat" list="rental-categories" className={inputClass} value={f.category} onChange={set("category")} placeholder="e.g. Chairs" /></Field>
        <Field label="Unit" htmlFor="it-unit"><input id="it-unit" className={inputClass} value={f.unit} onChange={set("unit")} placeholder="piece, set, metre" /></Field>
        <Field label="Condition" htmlFor="it-cond">
          <select id="it-cond" className={selectClass} value={f.condition} onChange={set("condition")}>
            {Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Rental price per event (FCFA)" htmlFor="it-rent"><input id="it-rent" className={inputClass} inputMode="numeric" value={f.rentalPrice} onChange={num("rentalPrice")} /></Field>
        <Field label="Purchase price of one (FCFA)" htmlFor="it-buy"><input id="it-buy" className={inputClass} inputMode="numeric" value={f.purchasePrice} onChange={num("purchasePrice")} /></Field>
        <Field label="Replacement value of one" htmlFor="it-repl" hint="Charged for a lost unit. Empty: the purchase price."><input id="it-repl" className={inputClass} inputMode="numeric" value={f.replacementValue} onChange={num("replacementValue")} /></Field>
        <Field label="Date purchased" htmlFor="it-date"><input id="it-date" type="date" className={inputClass} value={f.purchasedOn} onChange={set("purchasedOn")} /></Field>
        <Field label="Supplier" htmlFor="it-sup"><input id="it-sup" className={inputClass} value={f.supplier} onChange={set("supplier")} /></Field>
        <Field label="Storage place" htmlFor="it-loc"><input id="it-loc" className={inputClass} value={f.location} onChange={set("location")} placeholder="e.g. Store A, shelf 3" /></Field>
        <Field label="Warn when the store has only" htmlFor="it-low" hint="Low-stock warning (0: none)."><input id="it-low" className={inputClass} inputMode="numeric" value={f.lowStockLevel} onChange={num("lowStockLevel")} /></Field>
        {!item ? <Field label="Units you have now" htmlFor="it-open" hint="The opening count (all in good condition)."><input id="it-open" className={inputClass} inputMode="numeric" value={f.openingQuantity} onChange={num("openingQuantity")} /></Field> : null}
      </div>
      <Field label="Description" htmlFor="it-desc"><textarea id="it-desc" className={textareaClass} value={f.description} onChange={set("description")} placeholder="Colour, size, material…" /></Field>
      <ProofUpload value={files} onChange={setFiles} label={item?.photoUrl ? "Replace the photo" : "Add a photo"} />
    </FormDialog>
  );
}
