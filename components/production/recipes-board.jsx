"use client";

import { useState } from "react";
import { BookOpen, Pencil, Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, EmptyState, Field, Money, Pill, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { recipeSpec } from "@/lib/production/specs";
import { recipeCost } from "@/lib/production/production-math";
import { formatMoney } from "@/lib/format";

const decimal = (v) => String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, "");

/** A recipe: the product, how many units one round makes, and the materials it uses. */
function RecipeDialog({ departmentId, recipe, products, materials, onClose }) {
  const record = useRecorder();
  const [productId, setProductId] = useState(recipe?.productId || products[0]?.id || "");
  const [yieldQuantity, setYield] = useState(recipe ? String(recipe.yieldQuantity) : "");
  const [lines, setLines] = useState(recipe ? recipe.lines.map((l) => ({ materialId: l.materialId, quantity: String(l.quantity) })) : [{ materialId: "", quantity: "" }]);
  const [note, setNote] = useState(recipe?.note || "");
  const [busy, setBusy] = useState(false);
  const byId = Object.fromEntries(materials.map((m) => [m.id, m]));
  const product = products.find((p) => p.id === productId);
  const preview = recipeCost({ yieldQuantity: Number(yieldQuantity), lines: lines.filter((l) => l.materialId).map((l) => ({ materialId: l.materialId, quantity: Number(l.quantity) || 0 })) }, (id) => byId[id]?.costPrice || 0, product?.salePrice || 0);
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const valid = productId && Number(yieldQuantity) > 0 && lines.some((l) => l.materialId && Number(l.quantity) > 0);
  const submit = async () => {
    setBusy(true);
    const out = await record(recipeSpec(departmentId, { productId, yieldQuantity: Number(yieldQuantity), note: note.trim() || null, lines: lines.filter((l) => l.materialId && Number(l.quantity) > 0).map((l) => ({ materialId: l.materialId, quantity: Number(l.quantity) })) }, product?.name), { success: "Recipe saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={recipe ? `Recipe of ${recipe.product}` : "Add a recipe"} description="What one round uses. A batch of any size scales it; its real cost comes from the materials' average cost." footer={<><span className="mr-auto text-sm">Cost of one unit: <strong className="tabular-nums">{formatMoney(preview.unitCost)}</strong>{preview.margin !== null ? <> · margin <strong className={preview.margin < 0 ? "text-rose-700" : ""}>{formatMoney(preview.margin)}</strong></> : null}</span><SubmitButton busy={busy} disabled={!valid} onClick={submit}>Save the recipe</SubmitButton></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Product made" required htmlFor="rc-p"><select id="rc-p" className={selectClass} value={productId} onChange={(e) => setProductId(e.target.value)} disabled={Boolean(recipe)}>{products.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></Field>
        <Field label={`Units one round makes${product ? ` (${product.unit})` : ""}`} required htmlFor="rc-y"><input id="rc-y" className={inputClass} inputMode="decimal" value={yieldQuantity} onChange={(e) => setYield(decimal(e.target.value))} placeholder="120" /></Field>
      </div>
      <div className="space-y-2">
        <div className="grid grid-cols-[1fr_110px_100px_32px] gap-2 text-xs font-medium text-slate-500"><span>Material</span><span>Quantity</span><span className="text-right">Cost</span><span /></div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-[1fr_110px_100px_32px] items-center gap-2">
            <select aria-label="Material" className={selectClass} value={l.materialId} onChange={(e) => setLine(i, { materialId: e.target.value })}><option value="">Choose…</option>{materials.filter((m) => m.id !== productId).map((m) => <option key={m.id} value={m.id}>{m.name} ({m.unit})</option>)}</select>
            <input aria-label="Quantity" className={inputClass} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: decimal(e.target.value) })} />
            <span className="text-right text-sm tabular-nums">{formatMoney(Math.round((Number(l.quantity) || 0) * (byId[l.materialId]?.costPrice || 0)))}</span>
            <Button type="button" variant="ghost" size="icon" aria-label="Remove the material" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { materialId: "", quantity: "" }])}><Plus className="h-4 w-4" /> Another material</Button>
      </div>
      <Field label="Notes (method, oven time …)" htmlFor="rc-n"><textarea id="rc-n" rows={2} className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
    </FormDialog>
  );
}

/** Recipes with their cost per unit, margin, and how many rounds the stock allows now. */
export function RecipesBoard({ departmentId, recipes, products, materials, canManage }) {
  const [dialog, setDialog] = useState(null);
  const without = products.filter((p) => !recipes.some((r) => r.productId === p.id));
  return (
    <div className="space-y-4">
      <div className="flex justify-end">{canManage && without.length ? <Button onClick={() => setDialog({ recipe: null })}><Plus className="h-4 w-4" /> Add a recipe</Button> : null}</div>
      {recipes.length ? (
        <div className="grid gap-4 xl:grid-cols-2" data-testid="recipes">
          {recipes.map((r) => (
            <Section key={r.id} title={r.product} description={`One round makes ${r.yieldQuantity} ${r.unit || ""} · ${r.rounds} round(s) possible with the stock now`} actions={canManage ? <Button size="sm" variant="ghost" onClick={() => setDialog({ recipe: r })} aria-label={`Edit the recipe of ${r.product}`}><Pencil className="h-4 w-4" /></Button> : null} bodyClassName="p-0">
              <DataTable dense rows={r.lines} rowKey={(l) => l.materialId} columns={[{ key: "m", label: "Material", render: (l) => l.name }, { key: "q", label: "Per round", align: "right", render: (l) => `${l.quantity} ${l.unit || ""}` }, { key: "s", label: "In stock", align: "right", render: (l) => <span className={l.inStock < l.quantity ? "font-medium text-rose-700" : ""}>{l.inStock}</span> }, { key: "c", label: "Cost", align: "right", render: (l) => <Money value={l.cost} suffix={false} /> }]} />
              <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 px-4 py-2 text-sm">
                <span>Round <strong className="tabular-nums">{formatMoney(r.cost)}</strong></span>
                <span>· unit <strong className="tabular-nums">{formatMoney(r.unitCost)}</strong></span>
                <span>· sold <strong className="tabular-nums">{formatMoney(r.salePrice)}</strong></span>
                {r.margin !== null ? <Pill tone={r.margin < 0 ? "rose" : "emerald"}>margin {formatMoney(r.margin)} ({r.marginPct} %)</Pill> : null}
              </div>
            </Section>
          ))}
        </div>
      ) : (
        <EmptyState icon={BookOpen} title="No recipe yet" description="Add your raw materials and your products first (Products & materials), then the recipe of each product: what one round uses and how many units it makes." />
      )}
      {dialog ? <RecipeDialog departmentId={departmentId} recipe={dialog.recipe} products={dialog.recipe ? products : without} materials={materials} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
