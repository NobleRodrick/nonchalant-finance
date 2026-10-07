"use client";

import Link from "next/link";
import { useState } from "react";
import { Archive, ClipboardCheck, PackageMinus, PackagePlus, Pencil, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Pill, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ExportMenu } from "@/components/kit/export-menu";
import { useRecorder } from "@/lib/offline/react";
import { productArchiveSpec, productSpec, stockAdjustSpec } from "@/lib/trade/specs";
import { PRODUCT_CATEGORIES, PRODUCT_UNITS } from "@/lib/domains/trade";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { BarcodeScanner } from "./barcode-scanner";

/** What a product can be, by department type: sold from stock, a service, a raw material / input used. */
const KINDS = {
  SHOP: [["GOODS", "Goods (kept in stock)"], ["SERVICE", "Service (no stock)"]],
  OTHER: [["GOODS", "Goods (kept in stock)"], ["SERVICE", "Service (no stock)"], ["RAW", "Material used (not sold)"]],
  PRODUCTION: [["GOODS", "Product I make or sell"], ["RAW", "Raw material (used in recipes)"], ["SERVICE", "Service (no stock)"]],
  FARM: [["GOODS", "Produce to sell (eggs, harvest …)"], ["RAW", "Input (feed, vaccines, seeds …)"]],
};

const decimal = (v) => String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, "");

/** Adds a product (with its opening count and cost) or changes one: name, barcode, prices, unit, low level, crate. */
export function ProductDialog({ departmentId, domain, product = null, categories = [], packagings = [], canPrice, words, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(() => ({
    name: product?.name || "",
    kind: product?.kind || "GOODS",
    barcode: product?.barcode || "",
    category: product?.category || "",
    unit: product?.unit || (domain === "BAR" ? "bottle" : "piece"),
    salePrice: product ? String(product.salePrice) : "",
    costPrice: "",
    openingQuantity: "",
    lowStock: product?.lowStock ? String(product.lowStock) : "",
    unitsPerPack: product?.unitsPerPack > 1 ? String(product.unitsPerPack) : "",
    supplierName: product?.supplierName || "",
    packagingId: product?.packagingId || "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: ["salePrice", "costPrice"].includes(k) ? wholeNumber(e.target.value) : ["openingQuantity", "lowStock"].includes(k) ? decimal(e.target.value) : e.target.value });
  const service = f.kind === "SERVICE";
  const raw = f.kind === "RAW";
  const valid = f.name.trim() && (raw || f.salePrice !== "") && (!product || canPrice || Number(f.salePrice || 0) === product.salePrice);
  const submit = async () => {
    setBusy(true);
    const input = { ...(product ? { id: product.id } : {}), ...f, name: f.name.trim(), salePrice: Number(f.salePrice), lowStock: f.lowStock || 0, unitsPerPack: f.unitsPerPack || 1, packagingId: f.packagingId || null };
    if (product) {
      delete input.costPrice;
      delete input.openingQuantity;
    }
    const out = await record(productSpec(departmentId, input), { success: product ? `${f.name.trim()} saved.` : `${f.name.trim()} added.` });
    setBusy(false);
    if (out) onClose();
  };
  const cats = [...new Set([...(PRODUCT_CATEGORIES[domain] || []), ...categories])];
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={product ? `${product.name} · ${product.code}` : `Add a ${words.item.toLowerCase()}`} description={product ? "The stock changes with purchases, sales and counts (Stock page), not here." : "The quantity you have now and what one unit cost you start its stock."} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>{product ? "Save" : "Add"}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Name" required htmlFor="pr-n" className="sm:col-span-2"><input id="pr-n" className={inputClass} value={f.name} onChange={set("name")} placeholder={domain === "BAR" ? "33 Export 65 cl" : "Rice 5 kg"} /></Field>
        {KINDS[domain] ? (
          <Field label="Kind" htmlFor="pr-k"><select id="pr-k" className={selectClass} value={f.kind} onChange={set("kind")} disabled={product && product.quantity > 0}>{KINDS[domain].map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
        ) : <div />}
        <Field label="Barcode" htmlFor="pr-b" hint="Scan it with the USB scanner, or the camera">
          <div className="flex gap-2"><input id="pr-b" className={inputClass} value={f.barcode} onChange={set("barcode")} onKeyDown={(e) => e.key === "Enter" && e.preventDefault()} /><BarcodeScanner label="" onCode={(barcode) => setF((x) => ({ ...x, barcode }))} /></div>
        </Field>
        <Field label="Category" htmlFor="pr-c"><input id="pr-c" className={inputClass} list="pr-cats" value={f.category} onChange={set("category")} /><datalist id="pr-cats">{cats.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Sold by" htmlFor="pr-u"><input id="pr-u" className={inputClass} list="pr-units" value={f.unit} onChange={set("unit")} /><datalist id="pr-units">{PRODUCT_UNITS.map((u) => <option key={u} value={u} />)}</datalist></Field>
        <Field label={raw ? "Sale price (FCFA, if ever sold)" : "Sale price (FCFA)"} required={!raw} htmlFor="pr-p" hint={product && !canPrice ? "Only someone with the right to change prices can change it." : undefined}><input id="pr-p" className={inputClass} inputMode="numeric" value={f.salePrice} onChange={set("salePrice")} disabled={product && !canPrice} /></Field>
        {!product && !service ? (
          <>
            <Field label="Cost of one unit (FCFA)" htmlFor="pr-cp" hint="What you paid for it"><input id="pr-cp" className={inputClass} inputMode="numeric" value={f.costPrice} onChange={set("costPrice")} /></Field>
            <Field label={`Quantity in stock now`} htmlFor="pr-o" hint="Count it before you start"><input id="pr-o" className={inputClass} inputMode="decimal" value={f.openingQuantity} onChange={set("openingQuantity")} /></Field>
          </>
        ) : null}
        {!service ? (
          <>
            <Field label="Warn me at (low stock)" htmlFor="pr-l"><input id="pr-l" className={inputClass} inputMode="decimal" value={f.lowStock} onChange={set("lowStock")} placeholder="e.g. 5" /></Field>
            <Field label="Units in a pack / crate" htmlFor="pr-pk"><input id="pr-pk" className={inputClass} inputMode="numeric" value={f.unitsPerPack} onChange={(e) => setF({ ...f, unitsPerPack: wholeNumber(e.target.value) })} placeholder="12" /></Field>
            <Field label="Usual supplier" htmlFor="pr-s"><input id="pr-s" className={inputClass} value={f.supplierName} onChange={set("supplierName")} /></Field>
          </>
        ) : null}
        {packagings.length && !service ? (
          <Field label="Returnable crate" htmlFor="pr-cr" hint="Its deposit is counted with purchases"><select id="pr-cr" className={selectClass} value={f.packagingId} onChange={set("packagingId")}><option value="">None (no deposit)</option>{packagings.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.deposit)}</option>)}</select></Field>
        ) : null}
      </div>
    </FormDialog>
  );
}

/** A count (the stock becomes what was counted) or goods lost (broken, expired, stolen), with a reason. */
export function AdjustDialog({ departmentId, product, kind: initial = "COUNT", onClose }) {
  const record = useRecorder();
  const [kind, setKind] = useState(initial);
  const [value, setValue] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const n = Number(value);
  const valid = value !== "" && reason.trim() && (kind === "COUNT" ? n !== product.quantity : n > 0 && n <= product.quantity);
  const submit = async () => {
    setBusy(true);
    const out = await record(stockAdjustSpec(departmentId, product, kind === "LOSS" ? { kind, quantity: n, reason: reason.trim() } : { kind, counted: n, reason: reason.trim() }), { success: kind === "LOSS" ? "Loss recorded." : "Count recorded." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={product.name} description={`In stock: ${product.quantity} ${product.unit} · cost ${formatMoney(product.costPrice)} each`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record</SubmitButton>}>
      <div className="flex gap-2" role="radiogroup" aria-label="What happened">
        {[["COUNT", "I counted the stock"], ["LOSS", "Goods lost / broken"]].map(([k, l]) => <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)} className={cn("flex-1 rounded-lg border px-3 py-2 text-sm", kind === k ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200")}>{l}</button>)}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label={kind === "COUNT" ? `Counted (${product.unit})` : `Lost (${product.unit})`} required htmlFor="adj-q"><input id="adj-q" autoFocus className={inputClass} inputMode="decimal" value={value} onChange={(e) => setValue(decimal(e.target.value))} /></Field>
        <Field label="Why" required htmlFor="adj-r"><input id="adj-r" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder={kind === "COUNT" ? "Monthly count" : "Expired, broken…"} /></Field>
      </div>
      {kind === "COUNT" && value !== "" && n !== product.quantity ? <p className="text-sm text-slate-600">Difference: <strong>{(n - product.quantity > 0 ? "+" : "") + Math.round((n - product.quantity) * 1000) / 1000}</strong> {product.unit} ({formatMoney(Math.round((n - product.quantity) * product.costPrice))} at cost).</p> : null}
    </FormDialog>
  );
}

/**
 * Products (catalogue: prices, barcodes, categories) or the stock sheet (quantities, value at
 * cost, low stock, counts and losses), by `mode`.
 */
export function ProductBoard({ departmentId, domain, mode = "products", products, categories, packagings = [], perms, words, fileName }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const base = `/d/${departmentId}`;
  const stock = mode === "stock";
  const columns = [
    { key: "n", label: words.item, render: (p) => <span><Link href={`${base}/products/${p.id}`} className="font-medium hover:underline">{p.name}</Link>{p.kind === "RAW" ? <Pill tone="amber" className="ml-1">{domain === "FARM" ? "input" : "material"}</Pill> : null}</span> },
    { key: "c", label: "Code", render: (p) => <span className="font-mono text-xs">{p.code}{p.barcode ? <span className="block text-slate-500">{p.barcode}</span> : null}</span> },
    { key: "cat", label: "Category", render: (p) => p.category || "—" },
    ...(stock
      ? [
          { key: "q", label: "In stock", align: "right", render: (p) => (p.kind === "SERVICE" ? <span className="text-slate-400">service</span> : <span className={cn("tabular-nums font-medium", p.empty ? "text-rose-700" : p.low ? "text-amber-700" : "")}>{p.quantity} {p.unit}{p.empty ? " · out" : p.low ? " · low" : ""}</span>) },
          { key: "cp", label: "Cost (avg.)", align: "right", render: (p) => <Money value={p.costPrice} suffix={false} /> },
          { key: "v", label: "Value at cost", align: "right", render: (p) => <Money value={p.value} suffix={false} /> },
        ]
      : [
          { key: "p", label: "Price", align: "right", render: (p) => <Money value={p.salePrice} suffix={false} /> },
          { key: "cp", label: "Cost (avg.)", align: "right", render: (p) => (p.kind === "SERVICE" ? "—" : <Money value={p.costPrice} suffix={false} />) },
          { key: "m", label: "Margin", align: "right", render: (p) => (p.marginPct === null || p.kind === "SERVICE" ? "—" : <span className={p.marginPct < 0 ? "text-rose-700" : ""}>{p.marginPct} %</span>) },
          { key: "q", label: "Stock", align: "right", render: (p) => (p.kind === "SERVICE" ? <Pill>service</Pill> : `${p.quantity} ${p.unit}`) },
        ]),
    {
      key: "a",
      label: "",
      render: (p) => (
        <div className="flex justify-end gap-1">
          {stock && perms.manageStock && p.kind !== "SERVICE" && p.isActive ? (
            <>
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "adjust", product: p, adjust: "COUNT" })} title="Count"><ClipboardCheck className="h-4 w-4" /><span className="sr-only">Count {p.name}</span></Button>
              <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "adjust", product: p, adjust: "LOSS" })} title="Loss" disabled={p.quantity <= 0}><PackageMinus className="h-4 w-4" /><span className="sr-only">Loss of {p.name}</span></Button>
            </>
          ) : null}
          {!stock && perms.manageStock ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "edit", product: p })} title="Edit"><Pencil className="h-4 w-4" /><span className="sr-only">Edit {p.name}</span></Button> : null}
          {!stock && perms.archive ? (p.isActive ? <Button size="sm" variant="ghost" title="Archive" disabled={p.quantity > 0} onClick={() => record(productArchiveSpec(departmentId, p), { success: `${p.name} archived.` })}><Archive className="h-4 w-4" /><span className="sr-only">Archive {p.name}</span></Button> : <Button size="sm" variant="ghost" title="Back on sale" onClick={() => record(productArchiveSpec(departmentId, p, true), { success: `${p.name} is back on sale.` })}><RotateCcw className="h-4 w-4" /></Button>) : null}
        </div>
      ),
    },
  ];
  return (
    <Section
      bodyClassName="p-0"
      title={`${products.length} ${words.items.toLowerCase()}`}
      actions={
        <>
          {perms.export ? <ExportMenu fileName={fileName} sheets={{ name: stock ? "Stock" : words.items, columns: [{ label: "Code", value: (p) => p.code }, { label: "Barcode", value: (p) => p.barcode || "" }, { label: "Name", value: (p) => p.name }, { label: "Category", value: (p) => p.category || "" }, { label: "Unit", value: (p) => p.unit }, { label: "Sale price", value: (p) => p.salePrice }, { label: "Average cost", value: (p) => p.costPrice }, { label: "In stock", value: (p) => p.quantity }, { label: "Value at cost", value: (p) => p.value }, { label: "Low-stock level", value: (p) => p.lowStock }], rows: products }} /> : null}
          {perms.manageStock && !stock ? <Button size="sm" onClick={() => setDialog({ kind: "edit", product: null })}><PackagePlus className="h-4 w-4" /> Add a {words.item.toLowerCase()}</Button> : null}
        </>
      }
    >
      <DataTable rows={products} rowClassName={(p) => (!p.isActive ? "opacity-60" : "")} empty={stock ? "No product in stock yet." : `No ${words.item.toLowerCase()} yet. Add the first one: its name, price, and how many you have now.`} columns={columns} />
      {dialog?.kind === "edit" ? <ProductDialog departmentId={departmentId} domain={domain} product={dialog.product} categories={categories} packagings={packagings} canPrice={perms.prices} words={words} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "adjust" ? <AdjustDialog departmentId={departmentId} product={dialog.product} kind={dialog.adjust} onClose={() => setDialog(null)} /> : null}
    </Section>
  );
}

