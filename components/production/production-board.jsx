"use client";

import { useMemo, useState } from "react";
import { Factory, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Pill, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { VoidButton } from "@/components/kit/void-button";
import { useRecorder } from "@/lib/offline/react";
import { batchSpec, batchVoidSpec } from "@/lib/production/specs";
import { batchFigures, scaleRecipe } from "@/lib/production/production-math";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const decimal = (v) => String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, "");

/**
 * A production batch: the product, how many were planned (the recipe gives the materials) and how
 * many good units were made; or the materials really used, typed by hand.
 */
function BatchDialog({ departmentId, products, materials, recipes, onClose }) {
  const record = useRecorder();
  const [productId, setProductId] = useState(recipes[0]?.productId || products[0]?.id || "");
  const recipe = recipes.find((r) => r.productId === productId) || null;
  const [planned, setPlanned] = useState(recipe ? String(recipe.yieldQuantity) : "");
  const [produced, setProduced] = useState("");
  const [byHand, setByHand] = useState(!recipe);
  const [lines, setLines] = useState([{ productId: "", quantity: "" }]);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => Object.fromEntries(materials.map((m) => [m.id, m])), [materials]);
  const pick = (id) => {
    setProductId(id);
    const r = recipes.find((x) => x.productId === id);
    setByHand(!r);
    setPlanned(r ? String(r.yieldQuantity) : "");
  };
  const used = byHand ? lines.filter((l) => l.productId && Number(l.quantity) > 0).map((l) => ({ productId: l.productId, quantity: Number(l.quantity) })) : recipe ? scaleRecipe(recipe, Number(planned) || 0).map((l) => ({ productId: l.materialId, quantity: l.quantity })) : [];
  const short = used.filter((u) => (byId[u.productId]?.quantity || 0) < u.quantity);
  const f = batchFigures({ materials: used.map((u) => ({ quantity: u.quantity, unitCost: byId[u.productId]?.costPrice || 0 })), planned: Number(planned) || Number(produced) || 0, produced: Number(produced) || 0 });
  const product = products.find((p) => p.id === productId);
  const valid = productId && Number(produced) > 0 && used.length && !short.length;
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const submit = async () => {
    setBusy(true);
    const input = { productId, producedQuantity: Number(produced), plannedQuantity: Number(planned) || Number(produced), note: note.trim() || null, ...(byHand ? { materials: used } : {}) };
    const out = await record(batchSpec(departmentId, input, product?.name), { success: (d) => `${d?.referenceNo || "Batch"} recorded · ${formatMoney(d?.unitCost)} a unit.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="Record a production batch" description="The materials leave the stock at their average cost; the good units made enter it at the batch's real cost." footer={<><span className="mr-auto text-sm">Cost <strong className="tabular-nums">{formatMoney(f.totalCost)}</strong> · unit <strong className="tabular-nums">{formatMoney(f.unitCost)}</strong>{f.waste ? <> · waste <strong>{f.waste}</strong> ({f.wastePct} %)</> : null}</span><SubmitButton busy={busy} disabled={!valid} onClick={submit}><Factory className="h-4 w-4" /> Record the batch</SubmitButton></>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Product" required htmlFor="pb-p"><select id="pb-p" className={selectClass} value={productId} onChange={(e) => pick(e.target.value)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}{recipes.some((r) => r.productId === p.id) ? "" : " (no recipe)"}</option>)}</select></Field>
        <Field label={`Planned${recipe ? ` (one round = ${recipe.yieldQuantity})` : ""}`} htmlFor="pb-pl" hint="What the materials should make"><input id="pb-pl" className={inputClass} inputMode="decimal" value={planned} onChange={(e) => setPlanned(decimal(e.target.value))} /></Field>
        <Field label={`Good units made${product ? ` (${product.unit})` : ""}`} required htmlFor="pb-pr"><input id="pb-pr" className={inputClass} inputMode="decimal" value={produced} onChange={(e) => setProduced(decimal(e.target.value))} /></Field>
      </div>
      {recipe ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={byHand} onChange={(e) => setByHand(e.target.checked)} /> The materials used differed from the recipe: type them</label> : null}
      {byHand ? (
        <div className="space-y-2">
          {lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_120px_32px] items-center gap-2">
              <select aria-label="Material used" className={selectClass} value={l.productId} onChange={(e) => setLine(i, { productId: e.target.value })}><option value="">Choose…</option>{materials.filter((m) => m.id !== productId).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.quantity} {m.unit})</option>)}</select>
              <input aria-label="Quantity used" className={inputClass} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: decimal(e.target.value) })} />
              <Button type="button" variant="ghost" size="icon" aria-label="Remove" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
            </div>
          ))}
          <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { productId: "", quantity: "" }])}><Plus className="h-4 w-4" /> Another material</Button>
        </div>
      ) : null}
      {used.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 text-sm" data-testid="batch-materials">
          {used.map((u) => {
            const m = byId[u.productId];
            const low = (m?.quantity || 0) < u.quantity;
            return <li key={u.productId} className={cn("flex justify-between gap-2 px-3 py-1.5", low && "bg-rose-50 text-rose-800")}><span>{m?.name}: {u.quantity} {m?.unit}</span><span className="tabular-nums">{low ? `only ${m?.quantity} in stock` : formatMoney(Math.round(u.quantity * (m?.costPrice || 0)))}</span></li>;
          })}
        </ul>
      ) : null}
      <Field label="Note" htmlFor="pb-n"><input id="pb-n" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="Oven 2, morning shift…" /></Field>
    </FormDialog>
  );
}

/** Production batches of the period, with their cost per unit and waste. */
export function ProductionBoard({ departmentId, batches, products, materials, recipes, canRecord, canVoid }) {
  const record = useRecorder();
  const [open, setOpen] = useState(false);
  return (
    <Section title={`${batches.filter((b) => !b.voided).length} batch(es)`} bodyClassName="p-0" actions={canRecord ? <Button size="sm" onClick={() => setOpen(true)} disabled={!products.length}><Factory className="h-4 w-4" /> Record a batch</Button> : null}>
      <DataTable
        rows={batches}
        rowClassName={(b) => (b.voided ? "opacity-50" : "")}
        empty="No production in this period."
        columns={[
          { key: "r", label: "Batch", render: (b) => <span className="font-mono text-xs">{b.referenceNo}</span> },
          { key: "d", label: "Date", render: (b) => `${formatDateKey(b.dateKey, { weekday: false })} ${b.time}` },
          { key: "p", label: "Product", render: (b) => <span className="font-medium">{b.product}<span className="block text-xs font-normal text-slate-500">{b.materials.map((m) => `${m.quantity} ${m.unit || ""} ${m.name}`).join(", ")}</span></span> },
          { key: "q", label: "Made", align: "right", render: (b) => <span>{b.produced} {b.unit}{b.waste ? <span className="block text-xs text-amber-700">waste {b.waste}</span> : null}</span> },
          { key: "c", label: "Cost", align: "right", render: (b) => <Money value={b.totalCost} suffix={false} /> },
          { key: "u", label: "Unit cost", align: "right", render: (b) => <Money value={b.unitCost} suffix={false} /> },
          { key: "b", label: "By", render: (b) => <span className="text-xs">{b.by}</span> },
          { key: "x", label: "", render: (b) => (b.voided ? <Pill>voided · {b.voidReason}</Pill> : canVoid ? <VoidButton what="batch" reference={b.referenceNo} onVoid={(reason) => record(batchVoidSpec(departmentId, b, reason), { success: `${b.referenceNo} voided.` })} /> : null) },
        ]}
      />
      {open ? <BatchDialog departmentId={departmentId} products={products} materials={materials} recipes={recipes} onClose={() => setOpen(false)} /> : null}
    </Section>
  );
}
