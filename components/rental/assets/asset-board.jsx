"use client";

import { useState } from "react";
import { Ban, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ExportMenu } from "@/components/kit/export-menu";
import { useRecorder } from "@/lib/offline/react";
import { assetDisposeSpec, assetSaveSpec } from "@/lib/rental/specs";
import { METHOD_LABELS, schedule } from "@/lib/assets/depreciation";
import { CONDITION_LABELS } from "@/lib/rental/stock-math";
import { exportFileName } from "@/lib/export/table-export";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const CATEGORIES = ["Lighting", "Sound", "Structures & stands", "Tables & chairs", "Vehicles", "Machines", "Storage equipment", "Furniture", "Other"];

function AssetDialog({ departmentId, asset, items, todayKey, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(() => ({
    name: asset?.name || "",
    code: asset?.code || "",
    category: asset?.category || "",
    quantity: String(asset?.quantity || 1),
    purchaseDateKey: asset?.purchaseDateKey || todayKey,
    cost: asset ? String(asset.cost) : "",
    salvageValue: asset ? String(asset.salvageValue) : "",
    usefulLifeMonths: asset ? String(asset.usefulLifeMonths) : "60",
    method: asset?.method || "STRAIGHT_LINE",
    supplier: asset?.supplier || "",
    condition: asset?.condition || "GOOD",
    location: asset?.location || "",
    responsibleName: asset?.responsibleName || "",
    rentalItemId: asset?.rentalItem?.id || "",
    notes: asset?.notes || "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const num = (k) => (e) => setF({ ...f, [k]: wholeNumber(e.target.value) });
  const cost = Number(f.cost) || 0;
  const life = Number(f.usefulLifeMonths) || 0;
  const preview = cost && life ? schedule({ cost, salvageValue: Number(f.salvageValue) || 0, usefulLifeMonths: life, method: f.method }) : [];
  const submit = async () => {
    setBusy(true);
    const out = await record(assetSaveSpec(departmentId, { ...(asset ? { id: asset.id } : {}), ...f, name: f.name.trim() }), { success: (r) => `${r.code} saved.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={asset ? `${asset.code} · ${asset.name}` : "New asset"} description="Its value is computed from the purchase: monthly depreciation, accumulated, book value, remaining life." footer={<SubmitButton busy={busy} disabled={!f.name.trim() || !cost || !life || !f.purchaseDateKey} onClick={submit}>{asset ? "Save" : "Add to the register"}</SubmitButton>}>
      <datalist id="asset-categories">{CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Asset" required htmlFor="as-name" className="sm:col-span-2"><input id="as-name" className={inputClass} value={f.name} onChange={set("name")} placeholder="e.g. LED wash lights (12)" /></Field>
        <Field label="Code" htmlFor="as-code" hint="Empty: AS-0001…"><input id="as-code" className={inputClass} value={f.code} onChange={set("code")} /></Field>
        <Field label="Category" htmlFor="as-cat"><input id="as-cat" list="asset-categories" className={inputClass} value={f.category} onChange={set("category")} /></Field>
        <Field label="Quantity" htmlFor="as-q"><input id="as-q" className={inputClass} inputMode="numeric" value={f.quantity} onChange={num("quantity")} /></Field>
        <Field label="Stock item" htmlFor="as-item" hint="When these units are rented out."><select id="as-item" className={selectClass} value={f.rentalItemId} onChange={set("rentalItemId")}><option value="">—</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name} ({i.code})</option>)}</select></Field>
        <Field label="Purchase date" required htmlFor="as-date"><input id="as-date" type="date" className={inputClass} value={f.purchaseDateKey} onChange={set("purchaseDateKey")} /></Field>
        <Field label="Purchase price (FCFA)" required htmlFor="as-cost"><input id="as-cost" className={inputClass} inputMode="numeric" value={f.cost} onChange={num("cost")} /></Field>
        <Field label="Supplier" htmlFor="as-sup"><input id="as-sup" className={inputClass} value={f.supplier} onChange={set("supplier")} /></Field>
        <Field label="Useful life (months)" required htmlFor="as-life" hint="60 = 5 years"><input id="as-life" className={inputClass} inputMode="numeric" value={f.usefulLifeMonths} onChange={num("usefulLifeMonths")} /></Field>
        <Field label="Depreciation method" htmlFor="as-method"><select id="as-method" className={selectClass} value={f.method} onChange={set("method")}>{Object.entries(METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Value at the end of its life" htmlFor="as-salv" hint="Usually 0"><input id="as-salv" className={inputClass} inputMode="numeric" value={f.salvageValue} onChange={num("salvageValue")} /></Field>
        <Field label="Condition" htmlFor="as-cond"><select id="as-cond" className={selectClass} value={f.condition} onChange={set("condition")}>{Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Location" htmlFor="as-loc"><input id="as-loc" className={inputClass} value={f.location} onChange={set("location")} /></Field>
        <Field label="Person responsible" htmlFor="as-resp"><input id="as-resp" className={inputClass} value={f.responsibleName} onChange={set("responsibleName")} /></Field>
      </div>
      <Field label="Notes" htmlFor="as-notes"><textarea id="as-notes" className={textareaClass} rows={2} value={f.notes} onChange={set("notes")} /></Field>
      {preview.length ? <p className="text-xs text-slate-600">Depreciation: {formatMoney(preview[0])} the first month{f.method === "DECLINING_BALANCE" ? `, ${formatMoney(preview[Math.min(11, preview.length - 1)])} in month ${Math.min(12, preview.length)}` : " each month"}; {formatMoney(preview.reduce((a, b) => a + b, 0))} over {life} months.</p> : null}
    </FormDialog>
  );
}

function DisposeDialog({ departmentId, asset, todayKey, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ dateKey: todayKey, reason: "", disposalValue: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(assetDisposeSpec(departmentId, asset, f), { success: `${asset.code} disposed of.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Dispose of ${asset.code}?`} description={`Book value today: ${formatMoney(asset.value.bookValue)}. What is not recovered is a loss.`} footer={<SubmitButton variant="destructive" busy={busy} disabled={!f.reason.trim() || !f.dateKey} onClick={submit}>Dispose of it</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Date" required htmlFor="ad-date"><input id="ad-date" type="date" className={inputClass} value={f.dateKey} onChange={(e) => setF({ ...f, dateKey: e.target.value })} /></Field>
        <Field label="Money received (sold)" htmlFor="ad-val"><input id="ad-val" className={inputClass} inputMode="numeric" value={f.disposalValue} onChange={(e) => setF({ ...f, disposalValue: wholeNumber(e.target.value) })} /></Field>
        <Field label="Why" required htmlFor="ad-why" className="sm:col-span-2"><input id="ad-why" className={inputClass} value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} placeholder="Sold, scrapped, lost…" /></Field>
      </div>
    </FormDialog>
  );
}

const EXPORT = [
  { label: "Code", value: "code" },
  { label: "Asset", value: "name" },
  { label: "Category", value: "category" },
  { label: "Quantity", value: "quantity" },
  { label: "Purchase date", value: "purchaseDateKey" },
  { label: "Purchase price (FCFA)", value: "cost" },
  { label: "Supplier", value: "supplier" },
  { label: "Useful life (months)", value: "usefulLifeMonths" },
  { label: "Method", value: (a) => METHOD_LABELS[a.method] },
  { label: "Depreciation per month (FCFA)", value: (a) => a.value.monthly },
  { label: "Accumulated depreciation (FCFA)", value: (a) => a.value.accumulated },
  { label: "Book value (FCFA)", value: (a) => a.value.bookValue },
  { label: "Remaining life (months)", value: (a) => a.value.remainingMonths },
  { label: "Condition", value: (a) => CONDITION_LABELS[a.condition] },
  { label: "Location", value: "location" },
  { label: "Responsible", value: "responsibleName" },
  { label: "Disposed of", value: (a) => (a.disposedOnKey ? `${a.disposedOnKey}: ${a.disposalReason}` : "") },
];

/** The asset register: each asset with its computed value; add, change, dispose of. */
export function AssetBoard({ departmentId, assets, items, canManage, canDispose, canExport, todayKey, asOfKey }) {
  const [dialog, setDialog] = useState(null);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2 print:hidden">
        {canManage ? <Button onClick={() => setDialog({ edit: null })}><Plus className="h-4 w-4" /> Add an asset</Button> : <span />}
        {canExport ? <ExportMenu fileName={exportFileName("asset-register", asOfKey)} sheets={{ name: "Asset register", columns: EXPORT, rows: assets }} /> : null}
      </div>
      <Section bodyClassName="p-0">
        <DataTable
          rows={assets}
          empty="No asset in the register."
          rowClassName={(a) => (a.disposedOn ? "opacity-60" : "")}
          columns={[
            { key: "n", label: "Asset", render: (a) => <div><div className="font-medium">{a.name}</div><div className="text-xs text-slate-500">{a.code} · {a.category}{a.quantity > 1 ? ` · ${a.quantity} units` : ""}{a.location ? ` · ${a.location}` : ""}</div></div> },
            { key: "d", label: "Bought", render: (a) => <span className="whitespace-nowrap text-xs">{formatDateKey(a.purchaseDateKey, { weekday: false })}<span className="block text-slate-500">{a.supplier}</span></span> },
            { key: "c", label: "Cost", align: "right", render: (a) => <Money value={a.cost} suffix={false} /> },
            { key: "l", label: "Life", render: (a) => <span className="text-xs">{a.usefulLifeMonths} months<span className="block text-slate-500">{METHOD_LABELS[a.method]}</span></span> },
            { key: "m", label: "Per month", align: "right", render: (a) => <Money value={a.value.monthly} suffix={false} /> },
            { key: "acc", label: "Accumulated", align: "right", render: (a) => <Money value={a.value.accumulated} suffix={false} /> },
            { key: "bv", label: "Book value", align: "right", render: (a) => <span className="font-semibold"><Money value={a.value.bookValue} suffix={false} /></span> },
            { key: "r", label: "Left", align: "right", render: (a) => (a.disposedOn ? <span className="text-xs">disposed {formatDateKey(a.disposedOnKey, { weekday: false })}</span> : <span className={cn("text-xs", a.value.fullyDepreciated && "text-slate-400")}>{a.value.remainingMonths} months</span>) },
            {
              key: "x",
              label: "",
              align: "right",
              render: (a) => (a.disposedOn ? null : (
                <span className="inline-flex gap-1">
                  {canManage ? <Button size="sm" variant="ghost" onClick={() => setDialog({ edit: a })} aria-label={`Change ${a.code}`}><Pencil className="h-3.5 w-3.5" /></Button> : null}
                  {canDispose ? <Button size="sm" variant="ghost" onClick={() => setDialog({ dispose: a })} aria-label={`Dispose of ${a.code}`}><Ban className="h-3.5 w-3.5" /></Button> : null}
                </span>
              )),
            },
          ]}
        />
      </Section>
      {dialog && "edit" in dialog ? <AssetDialog departmentId={departmentId} asset={dialog.edit} items={items} todayKey={todayKey} onClose={() => setDialog(null)} /> : null}
      {dialog?.dispose ? <DisposeDialog departmentId={departmentId} asset={dialog.dispose} todayKey={todayKey} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
