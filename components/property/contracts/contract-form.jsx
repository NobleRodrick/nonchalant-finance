"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass, Section, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useRecorder } from "@/lib/offline/react";
import { leaseCreateSpec } from "@/lib/property/specs";
import { BILLING_METHOD_LABELS, UNIT_STATUS } from "@/lib/property/unit-math";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";
import { formatMoney } from "@/lib/format";

const utilitiesText = (charges) =>
  charges.length
    ? charges.map((c) => `${c.kind === "OTHER" ? c.label || "Other" : CHARGE_KIND_LABELS[c.kind]}: ${c.method === "INCLUDED" ? "included in the rent" : `paid by the tenant (${BILLING_METHOD_LABELS[c.method].toLowerCase()}${c.method === "METER" ? `, ${c.rate} FCFA per unit` : c.method === "FIXED" ? `, ${formatMoney(c.rate)} a month` : `, ${c.rate}%`})`}`).join("; ")
    : "";

/**
 * A new rental contract: the office, the tenant (existing or new, with identification), the
 * dates, rent and terms, the deposit asked, and whether the tenant moves in now or the office is
 * reserved. Documents (signed contract, ID) can be attached.
 */
export function ContractForm({ departmentId, units, tenants, unitId: initialUnit, todayKey, canChangePrices }) {
  const router = useRouter();
  const record = useRecorder();
  const free = units.filter((u) => !["OCCUPIED", "RESERVED", "UNAVAILABLE"].includes(u.status));
  const [unitId, setUnitId] = useState(free.some((u) => u.id === initialUnit) ? initialUnit : free[0]?.id || "");
  const unit = useMemo(() => units.find((u) => u.id === unitId), [units, unitId]);
  const [who, setWho] = useState(tenants.length ? "existing" : "new");
  const [clientId, setClientId] = useState(tenants[0]?.id || "");
  const [t, setT] = useState({ name: "", company: "", phone: "", email: "", address: "", identification: "" });
  const [f, setF] = useState(() => ({ startKey: todayKey, endKey: "", rent: unit ? String(unit.listRent) : "", dueDay: "5", monthsPerBill: "1", depositRequired: unit ? String(unit.depositRequired || "") : "", noticeDays: "30", utilities: utilitiesText(unit?.charges || []), conditions: "", notes: "", status: "ACTIVE", moveInKey: todayKey }));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const pickUnit = (id) => {
    const u = units.find((x) => x.id === id);
    setUnitId(id);
    setF({ ...f, rent: u ? String(u.listRent) : "", depositRequired: u ? String(u.depositRequired || "") : "", utilities: utilitiesText(u?.charges || []) });
  };
  const priceDiffers = unit && Number(f.rent) !== unit.listRent;
  const ready = unit && (unit.status === "AVAILABLE");
  const valid = unitId && f.startKey && Number(f.rent) > 0 && (who === "existing" ? clientId : t.name.trim().length > 1) && (!priceDiffers || canChangePrices) && (f.status === "RESERVED" || ready);
  const submit = async () => {
    setBusy(true);
    const input = {
      unitId,
      ...(who === "existing" ? { clientId } : { tenant: { ...t, name: t.name.trim() } }),
      ...f,
      rent: Number(f.rent),
      dueDay: Number(f.dueDay),
      monthsPerBill: Number(f.monthsPerBill),
      depositRequired: Number(f.depositRequired) || 0,
      noticeDays: Number(f.noticeDays) || 0,
      ...(f.status === "ACTIVE" ? {} : { moveInKey: undefined }),
    };
    const tenantName = who === "existing" ? tenants.find((x) => x.id === clientId)?.name : t.name.trim();
    const out = await record(leaseCreateSpec(departmentId, input, files, `${unit.name}: ${tenantName}`), { success: (r) => `Contract ${r.referenceNo} saved: ${r.unit} ${r.status === "ACTIVE" ? "let to" : "reserved for"} ${r.tenant}.` });
    setBusy(false);
    if (out?.status === "applied") router.push(`/d/${departmentId}/contracts/${out.result.leaseId}`);
    else if (out) router.push(`/d/${departmentId}/contracts`);
  };
  return (
    <div className="space-y-5">
      <Section title="Office">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Office" required htmlFor="ct-u" error={!free.length ? "No office is free." : null}><select id="ct-u" className={selectClass} value={unitId} onChange={(e) => pickUnit(e.target.value)}>{free.map((u) => <option key={u.id} value={u.id}>{u.name} · {u.building.name} · {UNIT_STATUS[u.status].label}</option>)}</select></Field>
          {unit ? <div className="text-sm text-slate-600 sm:col-span-2 sm:pt-6">List rent {formatMoney(unit.listRent)} · deposit {formatMoney(unit.depositRequired)}{unit.status !== "AVAILABLE" ? ` · ${UNIT_STATUS[unit.status].label}: it can only be reserved for now` : ""}</div> : null}
        </div>
      </Section>

      <Section title="Tenant">
        <div className="mb-3 flex gap-2" role="group" aria-label="Tenant">
          {tenants.length ? <Button size="sm" variant={who === "existing" ? "secondary" : "ghost"} aria-pressed={who === "existing"} onClick={() => setWho("existing")}>Existing tenant</Button> : null}
          <Button size="sm" variant={who === "new" ? "secondary" : "ghost"} aria-pressed={who === "new"} onClick={() => setWho("new")}>New tenant</Button>
        </div>
        {who === "existing" ? (
          <Field label="Tenant" htmlFor="ct-c"><select id="ct-c" className={selectClass} value={clientId} onChange={(e) => setClientId(e.target.value)}>{tenants.map((c) => <option key={c.id} value={c.id}>{c.name}{c.phone ? ` · ${c.phone}` : ""}</option>)}</select></Field>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Full name / company name" required htmlFor="ct-n"><input id="ct-n" className={inputClass} value={t.name} onChange={(e) => setT({ ...t, name: e.target.value })} /></Field>
            <Field label="Contact person / company" htmlFor="ct-co"><input id="ct-co" className={inputClass} value={t.company} onChange={(e) => setT({ ...t, company: e.target.value })} /></Field>
            <Field label="Phone" htmlFor="ct-p"><input id="ct-p" className={inputClass} value={t.phone} onChange={(e) => setT({ ...t, phone: e.target.value })} /></Field>
            <Field label="E-mail" htmlFor="ct-e"><input id="ct-e" type="email" className={inputClass} value={t.email} onChange={(e) => setT({ ...t, email: e.target.value })} /></Field>
            <Field label="Address" htmlFor="ct-a"><input id="ct-a" className={inputClass} value={t.address} onChange={(e) => setT({ ...t, address: e.target.value })} /></Field>
            <Field label="Identification" htmlFor="ct-i" hint="ID card, passport or company registration (RCCM)."><input id="ct-i" className={inputClass} value={t.identification} onChange={(e) => setT({ ...t, identification: e.target.value })} /></Field>
          </div>
        )}
      </Section>

      <Section title="Terms">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Contract starts (rent from)" required htmlFor="ct-s"><input id="ct-s" type="date" className={inputClass} value={f.startKey} onChange={set("startKey")} /></Field>
          <Field label="Contract ends" htmlFor="ct-en" hint="Empty: open-ended."><input id="ct-en" type="date" className={inputClass} value={f.endKey} onChange={set("endKey")} /></Field>
          <Field label="Monthly rent (FCFA)" required htmlFor="ct-r" error={priceDiffers && !canChangePrices ? "You may not change the office's price." : null} hint={priceDiffers && canChangePrices ? `List price ${formatMoney(unit.listRent)}` : undefined}><input id="ct-r" className={inputClass} inputMode="numeric" value={f.rent} onChange={(e) => setF({ ...f, rent: wholeNumber(e.target.value) })} /></Field>
          <Field label="Deposit / caution (FCFA)" htmlFor="ct-d"><input id="ct-d" className={inputClass} inputMode="numeric" value={f.depositRequired} onChange={(e) => setF({ ...f, depositRequired: wholeNumber(e.target.value) })} /></Field>
          <Field label="Rent due on day" htmlFor="ct-dd" hint="Of each month (1–28)."><input id="ct-dd" type="number" min="1" max="28" className={inputClass} value={f.dueDay} onChange={set("dueDay")} /></Field>
          <Field label="Billed every" htmlFor="ct-mb"><select id="ct-mb" className={selectClass} value={f.monthsPerBill} onChange={set("monthsPerBill")}><option value="1">Month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">Year</option></select></Field>
          <Field label="Notice period (days)" htmlFor="ct-np"><input id="ct-np" type="number" min="0" className={inputClass} value={f.noticeDays} onChange={set("noticeDays")} /></Field>
          <Field label="The tenant" htmlFor="ct-st"><select id="ct-st" className={selectClass} value={f.status} onChange={set("status")}><option value="ACTIVE" disabled={!ready}>Moves in now</option><option value="RESERVED">Reserves it (moves in later)</option></select></Field>
          {f.status === "ACTIVE" ? <Field label="Move-in date" htmlFor="ct-mi"><input id="ct-mi" type="date" className={inputClass} value={f.moveInKey} onChange={set("moveInKey")} /></Field> : null}
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Utilities and charges (as agreed)" htmlFor="ct-ut"><textarea id="ct-ut" rows={3} className={textareaClass} value={f.utilities} onChange={set("utilities")} /></Field>
          <Field label="Other conditions" htmlFor="ct-co2"><textarea id="ct-co2" rows={3} className={textareaClass} value={f.conditions} onChange={set("conditions")} /></Field>
        </div>
        <Field label="Notes" htmlFor="ct-no"><input id="ct-no" className={inputClass} value={f.notes} onChange={set("notes")} /></Field>
        <div className="mt-3"><ProofUpload value={files} onChange={setFiles} label="Attach the signed contract, ID …" /></div>
      </Section>

      <div className="flex justify-end gap-2">
        <Button variant="ghost" onClick={() => router.back()}>Back</Button>
        <SubmitButton busy={busy} disabled={!valid} onClick={submit}>{f.status === "ACTIVE" ? "Save: the tenant moves in" : "Save the reservation"}</SubmitButton>
      </div>
    </div>
  );
}
