"use client";

import { useState } from "react";
import { Archive, Pencil, Plus, RotateCcw, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ExportMenu } from "@/components/kit/export-menu";
import { useRecorder } from "@/lib/offline/react";
import { serviceArchiveSpec, serviceItemSpec, serviceSettingsSpec } from "@/lib/trade/specs";

const COMMISSIONS = [["NONE", "No commission"], ["PERCENT", "% of the price"], ["FIXED", "Fixed amount per unit"]];

function ItemDialog({ departmentId, item, variants, variantsLabel, canPrice, showCommission, workerWord = "Washer", onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(() => ({ name: item?.name || "", category: item?.category || "", basePrice: item?.basePrice ? String(item.basePrice) : "", unit: item?.unit || "", commissionType: item?.commissionType || "NONE", commissionValue: item?.commissionValue ? String(item.commissionValue) : "", minutes: item?.minutes ? String(item.minutes) : "", sortOrder: item?.sortOrder ? String(item.sortOrder) : "" }));
  const [prices, setPrices] = useState(() => Object.fromEntries(variants.map((v) => [v, item?.prices?.[v] !== undefined ? String(item.prices[v]) : ""])));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: ["basePrice", "commissionValue", "minutes", "sortOrder"].includes(k) ? wholeNumber(e.target.value) : e.target.value });
  const locked = item && !canPrice;
  const valid = f.name.trim() && (f.basePrice !== "" || Object.values(prices).some((p) => p !== ""));
  const submit = async () => {
    setBusy(true);
    const out = await record(serviceItemSpec(departmentId, { ...(item ? { id: item.id } : {}), ...f, name: f.name.trim(), basePrice: Number(f.basePrice) || 0, prices: Object.fromEntries(Object.entries(prices).filter(([, v]) => v !== "").map(([k, v]) => [k, Number(v)])), commissionValue: Number(f.commissionValue) || 0 }), { success: "Price list saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={item ? item.name : "Add a service"} description={variants.length ? `A price for each ${variantsLabel.toLowerCase()}; leave one empty to use the usual price.` : undefined} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Service" required htmlFor="si-n" className="sm:col-span-2"><input id="si-n" className={inputClass} value={f.name} onChange={set("name")} placeholder={variantsLabel === "Vehicle" ? "Full wash (inside & out)" : "Wash & iron"} /></Field>
        <Field label="Group" htmlFor="si-c"><input id="si-c" className={inputClass} value={f.category} onChange={set("category")} placeholder="Washing, Ironing, Dry cleaning…" /></Field>
        <Field label="Usual price (FCFA)" htmlFor="si-p" hint={locked ? "Only someone with the right to change prices can change it." : undefined}><input id="si-p" className={inputClass} inputMode="numeric" value={f.basePrice} onChange={set("basePrice")} disabled={locked} /></Field>
        <Field label="Charged per" htmlFor="si-u"><input id="si-u" className={inputClass} value={f.unit} onChange={set("unit")} placeholder="item, kg, vehicle" /></Field>
        <Field label="Order in the list" htmlFor="si-o"><input id="si-o" className={inputClass} inputMode="numeric" value={f.sortOrder} onChange={set("sortOrder")} /></Field>
      </div>
      {variants.length ? (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-3">
          {variants.map((v) => <Field key={v} label={v} htmlFor={`si-v-${v}`}><input id={`si-v-${v}`} className={inputClass} inputMode="numeric" value={prices[v]} placeholder={f.basePrice || "—"} disabled={locked} onChange={(e) => setPrices({ ...prices, [v]: wholeNumber(e.target.value) })} /></Field>)}
        </div>
      ) : null}
      {showCommission ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label={`${workerWord}'s commission`} htmlFor="si-ct"><select id="si-ct" className={selectClass} value={f.commissionType} onChange={set("commissionType")}>{COMMISSIONS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
          {f.commissionType !== "NONE" ? <Field label={f.commissionType === "PERCENT" ? "Percent" : "FCFA per unit"} htmlFor="si-cv"><input id="si-cv" className={inputClass} inputMode="numeric" value={f.commissionValue} onChange={set("commissionValue")} /></Field> : null}
          <Field label="Usual time (minutes)" htmlFor="si-m"><input id="si-m" className={inputClass} inputMode="numeric" value={f.minutes} onChange={set("minutes")} /></Field>
        </div>
      ) : null}
    </FormDialog>
  );
}

function SettingsDialog({ departmentId, settings, variantsLabel, carWash, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ variants: settings.variants.join("\n"), expressPct: String(settings.expressPct), loyaltyEvery: String(settings.loyaltyEvery || ""), unclaimedDays: String(settings.unclaimedDays), defaultHours: String(settings.defaultHours) });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === "variants" ? e.target.value : wholeNumber(e.target.value) });
  const submit = async () => {
    setBusy(true);
    const out = await record(serviceSettingsSpec(departmentId, { variants: f.variants.split("\n").map((v) => v.trim()).filter(Boolean), expressPct: Number(f.expressPct) || 0, loyaltyEvery: Number(f.loyaltyEvery) || 0, unclaimedDays: Number(f.unclaimedDays) || 0, defaultHours: Number(f.defaultHours) || 1 }), { success: "Options saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title="Price list options" footer={<SubmitButton busy={busy} onClick={submit}>Save</SubmitButton>}>
      <Field label={`${variantsLabel}s (one per line)`} htmlFor="ss-v" hint="Each service can have its own price for each of them."><textarea id="ss-v" rows={6} className={textareaClass} value={f.variants} onChange={set("variants")} /></Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Express surcharge (%)" htmlFor="ss-e"><input id="ss-e" className={inputClass} inputMode="numeric" value={f.expressPct} onChange={set("expressPct")} /></Field>
        <Field label="Usually ready after (hours)" htmlFor="ss-h"><input id="ss-h" className={inputClass} inputMode="numeric" value={f.defaultHours} onChange={set("defaultHours")} /></Field>
        <Field label={`Loyalty: every Nth ${carWash ? "wash" : "ticket"} free`} htmlFor="ss-l" hint="Empty or 0: no loyalty"><input id="ss-l" className={inputClass} inputMode="numeric" value={f.loyaltyEvery} onChange={set("loyaltyEvery")} placeholder="e.g. 10" /></Field>
        {!carWash ? <Field label="Unclaimed after (days ready)" htmlFor="ss-u"><input id="ss-u" className={inputClass} inputMode="numeric" value={f.unclaimedDays} onChange={set("unclaimedDays")} /></Field> : null}
      </div>
    </FormDialog>
  );
}

/** The price list: services × variants (garments, vehicle types), commissions, and the options. */
export function PriceList({ departmentId, domain, items, settings, variantsLabel, perms, fileName }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const variants = settings.variants;
  const carWash = domain === "CAR_WASH";
  const shownVariants = variants.slice(0, 8);
  return (
    <Section
      bodyClassName="p-0"
      title={`${items.filter((i) => i.isActive).length} service(s)`}
      description={`Express +${settings.expressPct} % · ready after ${settings.defaultHours} h${settings.loyaltyEvery > 1 ? ` · every ${settings.loyaltyEvery}th free` : ""}${carWash ? "" : ` · unclaimed after ${settings.unclaimedDays} days`}`}
      actions={
        <>
          {perms.export ? <ExportMenu fileName={fileName} sheets={{ name: "Price list", columns: [{ label: "Service", value: (i) => i.name }, { label: "Group", value: (i) => i.category || "" }, { label: "Usual price", value: (i) => i.basePrice }, ...variants.map((v) => ({ label: v, value: (i) => i.prices[v] ?? i.basePrice }))], rows: items }} /> : null}
          {perms.servicesManage ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "settings" })}><Settings2 className="h-4 w-4" /> Options</Button> : null}
          {perms.servicesManage ? <Button size="sm" onClick={() => setDialog({ kind: "item", item: null })}><Plus className="h-4 w-4" /> Add a service</Button> : null}
        </>
      }
    >
      <DataTable
        rows={items}
        rowClassName={(i) => (!i.isActive ? "opacity-50" : "")}
        empty="The price list is empty: add each service and its price."
        columns={[
          { key: "n", label: "Service", render: (i) => <span className="font-medium">{i.name}{i.category ? <span className="block text-xs font-normal text-slate-500">{i.category}</span> : null}</span> },
          { key: "b", label: "Usual", align: "right", render: (i) => (i.basePrice ? <Money value={i.basePrice} suffix={false} /> : "—") },
          ...shownVariants.map((v) => ({ key: `v-${v}`, label: v, align: "right", render: (i) => (i.prices[v] !== undefined ? <Money value={i.prices[v]} suffix={false} /> : <span className="text-slate-400">{i.basePrice || "—"}</span>) })),
          ...(carWash || domain === "SALON" ? [{ key: "c", label: "Commission", align: "right", render: (i) => (i.commissionType === "PERCENT" ? `${i.commissionValue} %` : i.commissionType === "FIXED" ? <Money value={i.commissionValue} suffix={false} /> : "—") }] : []),
          { key: "x", label: "", render: (i) => <div className="flex justify-end gap-1">{perms.servicesManage ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "item", item: i })} aria-label={`Edit ${i.name}`}><Pencil className="h-4 w-4" /></Button> : null}{perms.archive ? (i.isActive ? <Button size="sm" variant="ghost" aria-label={`Archive ${i.name}`} onClick={() => record(serviceArchiveSpec(departmentId, i), { success: `${i.name} archived.` })}><Archive className="h-4 w-4" /></Button> : <Button size="sm" variant="ghost" aria-label={`Restore ${i.name}`} onClick={() => record(serviceArchiveSpec(departmentId, i, true), { success: `${i.name} restored.` })}><RotateCcw className="h-4 w-4" /></Button>) : null}</div> },
        ]}
      />
      {dialog?.kind === "item" ? <ItemDialog departmentId={departmentId} item={dialog.item} variants={variants} variantsLabel={variantsLabel} canPrice={perms.prices} showCommission={carWash || domain === "SALON"} workerWord={domain === "SALON" ? "Staff" : "Washer"} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "settings" ? <SettingsDialog departmentId={departmentId} settings={settings} variantsLabel={variantsLabel} carWash={carWash} onClose={() => setDialog(null)} /> : null}
    </Section>
  );
}
