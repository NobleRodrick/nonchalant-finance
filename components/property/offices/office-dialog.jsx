"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useRecorder } from "@/lib/offline/react";
import { buildingSpec, unitSaveSpec } from "@/lib/property/specs";
import { BILLING_METHOD_LABELS, CONDITION_LABELS, UTILITY_KINDS } from "@/lib/property/unit-math";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";
import { OFFICE_CATEGORIES } from "@/lib/domains/property";

const blankCharge = { kind: "ELECTRICITY", method: "METER", rate: "", label: "", meterNumber: "", lastReading: "" };

/** Adds an office or changes one: building, name, floor, category, size, rent, deposit, charges, photos. */
export function OfficeDialog({ departmentId, buildings, unit = null, thisMonth, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(() => ({
    buildingId: unit?.building?.id || unit?.buildingId || buildings[0]?.id || "",
    name: unit?.name || "",
    floor: unit?.floor || "",
    category: unit?.category || "",
    size: unit?.size ? String(unit.size) : "",
    listRent: unit ? String(unit.listRentNow ?? unit.listRent) : "",
    rentFromMonth: thisMonth,
    rentNote: "",
    depositRequired: unit ? String(unit.depositRequired || "") : "",
    condition: unit?.condition || "GOOD",
    description: unit?.description || "",
    notes: unit?.notes || "",
  }));
  const [charges, setCharges] = useState(() => (unit?.chargeSettings || unit?.charges || []).map((c) => ({ ...blankCharge, ...c, rate: String(c.rate ?? ""), lastReading: c.lastReading ?? "" })));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const rentChanged = unit && Number(f.listRent) !== (unit.listRentNow ?? unit.listRent);
  const setCharge = (i, k, v) => setCharges(charges.map((c, j) => (j === i ? { ...c, [k]: v } : c)));
  const valid = f.buildingId && f.name.trim() && Number(f.listRent) > 0;
  const submit = async () => {
    setBusy(true);
    const input = { ...(unit ? { id: unit.id } : {}), ...f, name: f.name.trim(), listRent: Number(f.listRent), depositRequired: Number(f.depositRequired) || 0, charges: charges.map((c) => ({ ...c, rate: c.method === "INCLUDED" ? 0 : c.rate })) };
    if (!rentChanged) delete input.rentFromMonth;
    const out = await record(unitSaveSpec(departmentId, input, files), { success: unit ? "Office saved." : `Office ${f.name.trim()} added.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={unit ? `Office ${unit.name}` : "Add an office"} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>{unit ? "Save" : "Add the office"}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Building" required htmlFor="of-b"><select id="of-b" className={selectClass} value={f.buildingId} onChange={set("buildingId")}>{buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}</select></Field>
        <Field label="Office name / number" required htmlFor="of-n"><input id="of-n" className={inputClass} value={f.name} onChange={set("name")} placeholder="A12" /></Field>
        <Field label="Floor" htmlFor="of-fl"><input id="of-fl" className={inputClass} value={f.floor} onChange={set("floor")} placeholder="Ground, 1st …" /></Field>
        <Field label="Category / type" htmlFor="of-c"><input id="of-c" className={inputClass} list="of-cats" value={f.category} onChange={set("category")} /><datalist id="of-cats">{OFFICE_CATEGORIES.map((c) => <option key={c} value={c} />)}</datalist></Field>
        <Field label="Size (m²)" htmlFor="of-s"><input id="of-s" className={inputClass} inputMode="decimal" value={f.size} onChange={set("size")} /></Field>
        <Field label="Condition" htmlFor="of-co"><select id="of-co" className={selectClass} value={f.condition} onChange={set("condition")}>{Object.entries(CONDITION_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
        <Field label="Monthly rent (FCFA)" required htmlFor="of-r"><input id="of-r" className={inputClass} inputMode="numeric" value={f.listRent} onChange={(e) => setF({ ...f, listRent: wholeNumber(e.target.value) })} /></Field>
        <Field label="Deposit / caution required (FCFA)" htmlFor="of-d"><input id="of-d" className={inputClass} inputMode="numeric" value={f.depositRequired} onChange={(e) => setF({ ...f, depositRequired: wholeNumber(e.target.value) })} /></Field>
        {rentChanged ? <Field label="New rent from" htmlFor="of-rf" hint="Earlier months keep the old price."><input id="of-rf" type="month" className={inputClass} value={f.rentFromMonth} onChange={set("rentFromMonth")} /></Field> : null}
      </div>
      {rentChanged ? <Field label="Why the price changes" htmlFor="of-rn"><input id="of-rn" className={inputClass} value={f.rentNote} onChange={set("rentNote")} placeholder="e.g. yearly increase" /></Field> : null}

      <div className="rounded-lg border border-slate-200 p-3">
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-slate-900">Electricity, water and other charges</h3>
          <Button size="sm" variant="outline" onClick={() => setCharges([...charges, { ...blankCharge, kind: UTILITY_KINDS.find((k) => !charges.some((c) => c.kind === k)) || "OTHER", method: "FIXED" }])}><Plus className="h-3.5 w-3.5" /> Add a charge</Button>
        </div>
        {charges.length ? (
          <div className="space-y-2">
            {charges.map((c, i) => (
              <div key={i} className="grid items-end gap-2 sm:grid-cols-[9rem_12rem_7rem_1fr_auto]" data-testid={`charge-row-${i}`}>
                <Field label="Charge" htmlFor={`ch-k-${i}`}><select id={`ch-k-${i}`} className={selectClass} value={c.kind} onChange={(e) => setCharge(i, "kind", e.target.value)}>{UTILITY_KINDS.map((k) => <option key={k} value={k}>{CHARGE_KIND_LABELS[k]}</option>)}</select></Field>
                <Field label="Billed as" htmlFor={`ch-m-${i}`}><select id={`ch-m-${i}`} className={selectClass} value={c.method} onChange={(e) => setCharge(i, "method", e.target.value)}>{Object.entries(BILLING_METHOD_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
                {c.method === "INCLUDED" ? <div /> : <Field label={c.method === "METER" ? "Rate / unit" : c.method === "SHARE" ? "Share (%)" : "FCFA a month"} htmlFor={`ch-r-${i}`}><input id={`ch-r-${i}`} className={inputClass} inputMode="decimal" value={c.rate} onChange={(e) => setCharge(i, "rate", e.target.value)} /></Field>}
                {c.method === "METER" ? (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Meter no." htmlFor={`ch-mn-${i}`}><input id={`ch-mn-${i}`} className={inputClass} value={c.meterNumber || ""} onChange={(e) => setCharge(i, "meterNumber", e.target.value)} /></Field>
                    <Field label="Last reading" htmlFor={`ch-lr-${i}`}><input id={`ch-lr-${i}`} className={inputClass} inputMode="decimal" value={c.lastReading ?? ""} onChange={(e) => setCharge(i, "lastReading", e.target.value)} /></Field>
                  </div>
                ) : c.kind === "OTHER" ? <Field label="Name" htmlFor={`ch-l-${i}`}><input id={`ch-l-${i}`} className={inputClass} value={c.label || ""} onChange={(e) => setCharge(i, "label", e.target.value)} placeholder="Parking" /></Field> : <div />}
                <Button size="icon" variant="ghost" aria-label="Remove the charge" onClick={() => setCharges(charges.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
              </div>
            ))}
          </div>
        ) : <p className="text-sm text-slate-500">No charge: rent only. Add electricity, water, internet, cleaning, security … as agreed for this office.</p>}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Description" htmlFor="of-de"><textarea id="of-de" rows={2} className={textareaClass} value={f.description} onChange={set("description")} /></Field>
        <Field label="Notes" htmlFor="of-no"><textarea id="of-no" rows={2} className={textareaClass} value={f.notes} onChange={set("notes")} /></Field>
      </div>
      <ProofUpload value={files} onChange={setFiles} label="Add photos of the office" />
    </FormDialog>
  );
}

/** Adds a building or renames one. */
export function BuildingDialog({ departmentId, building = null, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ name: building?.name || "", address: building?.address || "", notes: building?.notes || "", sortOrder: building?.sortOrder ?? "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(buildingSpec(departmentId, { ...(building ? { id: building.id } : {}), ...f, name: f.name.trim() }), { success: "Building saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={building ? building.name : "Add a building"} footer={<SubmitButton busy={busy} disabled={f.name.trim().length < 2} onClick={submit}>Save</SubmitButton>}>
      <Field label="Name" required htmlFor="bd-n"><input id="bd-n" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
      <Field label="Address" htmlFor="bd-a"><input id="bd-a" className={inputClass} value={f.address} onChange={(e) => setF({ ...f, address: e.target.value })} /></Field>
      <Field label="Notes" htmlFor="bd-no"><textarea id="bd-no" rows={2} className={textareaClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </FormDialog>
  );
}
