"use client";

import { useState } from "react";
import { BadgePercent, CircleX, DoorOpen, FileSignature, HandCoins, LogOut, MessageCircle, PiggyBank, Receipt, TrendingUp, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { PaymentFields, paymentReady } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { chargeAddSpec, depositApplySpec, depositReceiveSpec, depositRefundSpec, leaseCancelSpec, leaseEndSpec, leaseRefundSpec, leaseRentSpec, leaseStartSpec, leaseUpdateSpec, waiveSpec } from "@/lib/property/specs";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";
import { formatMoney } from "@/lib/format";
import { LeasePaymentDialog } from "./payment-dialog";
import { InspectionFindings, blankFindings } from "../work/inspection";
import { whatsappLink, reminderText } from "@/lib/property/reminder-text";

const BILLABLE = ["ELECTRICITY", "WATER", "INTERNET", "CLEANING", "SECURITY", "WASTE", "MAINTENANCE", "DAMAGE", "LATE_FEE", "OTHER"];

function Dialog({ title, description, busy, disabled, onSubmit, submitLabel, onClose, children, wide, variant }) {
  return <FormDialog wide={wide} open onOpenChange={(v) => !v && onClose()} title={title} description={description} footer={<SubmitButton busy={busy} disabled={disabled} variant={variant} onClick={onSubmit}>{submitLabel}</SubmitButton>}>{children}</FormDialog>;
}

function useSubmit(onClose) {
  const record = useRecorder();
  const [busy, setBusy] = useState(false);
  return [busy, async (spec, success) => {
    setBusy(true);
    const out = await record(spec, { success });
    setBusy(false);
    if (out) onClose();
  }];
}

/** Bills a utility (meter reading or amount) or another charge. */
function ChargeDialog({ departmentId, lease, onClose }) {
  const [busy, submit] = useSubmit(onClose);
  const settings = lease.chargeSettings || [];
  const [f, setF] = useState({ kind: settings.find((s) => s.method !== "INCLUDED")?.kind || "ELECTRICITY", monthKey: lease.thisMonth, currentReading: "", previousReading: "", rate: "", amount: "", label: "", dueKey: "", note: "" });
  const setting = settings.find((s) => s.kind === f.kind);
  const meter = setting?.method === "METER";
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const units = meter && f.currentReading !== "" ? Number(f.currentReading) - Number(f.previousReading || setting.lastReading || 0) : 0;
  const preview = meter ? Math.round(units * Number(f.rate || setting.rate || 0)) : Number(f.amount) || 0;
  return (
    <Dialog title="Bill a charge" description={`${lease.tenant} · ${lease.office}`} busy={busy} disabled={!(preview > 0)} submitLabel={`Bill ${preview ? formatMoney(preview) : ""}`} onClose={onClose} onSubmit={() => submit(chargeAddSpec(departmentId, lease, meter ? { kind: f.kind, monthKey: f.monthKey, currentReading: f.currentReading, previousReading: f.previousReading || undefined, rate: f.rate || undefined, dueKey: f.dueKey || undefined, note: f.note } : { kind: f.kind, monthKey: f.monthKey, amount: Number(f.amount), label: f.label || undefined, dueKey: f.dueKey || undefined, note: f.note }), (r) => `${r.referenceNo}: ${r.label} ${formatMoney(r.amount)} billed.`)}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="What" htmlFor="cg-k"><select id="cg-k" className={selectClass} value={f.kind} onChange={set("kind")}>{BILLABLE.map((k) => <option key={k} value={k}>{CHARGE_KIND_LABELS[k]}</option>)}</select></Field>
        <Field label="Month" htmlFor="cg-m"><input id="cg-m" type="month" className={inputClass} value={f.monthKey} onChange={set("monthKey")} /></Field>
        <Field label="Due on" htmlFor="cg-d" hint="Default: due day next month (one-off charges: today)."><input id="cg-d" type="date" className={inputClass} value={f.dueKey} onChange={set("dueKey")} /></Field>
      </div>
      {meter ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Previous reading" htmlFor="cg-p" hint={setting.lastReading !== null && setting.lastReading !== undefined ? `Last billed: ${setting.lastReading}` : "First reading"}><input id="cg-p" className={inputClass} inputMode="decimal" value={f.previousReading} onChange={set("previousReading")} placeholder={setting.lastReading ?? ""} /></Field>
          <Field label="Current reading" required htmlFor="cg-c"><input id="cg-c" className={inputClass} inputMode="decimal" value={f.currentReading} onChange={set("currentReading")} /></Field>
          <Field label="Rate per unit" htmlFor="cg-r" hint={`Default ${setting.rate}`}><input id="cg-r" className={inputClass} inputMode="decimal" value={f.rate} onChange={set("rate")} placeholder={String(setting.rate)} /></Field>
          <p className="text-sm text-slate-600 sm:col-span-3">{units > 0 ? `${units} units consumed → ${formatMoney(preview)}` : "Enter the current reading."}</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Amount (FCFA)" required htmlFor="cg-a"><input id="cg-a" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} placeholder={setting?.method === "FIXED" ? String(setting.rate) : ""} /></Field>
          <Field label="Label" htmlFor="cg-l"><input id="cg-l" className={inputClass} value={f.label} onChange={set("label")} placeholder={`${CHARGE_KIND_LABELS[f.kind]} …`} /></Field>
        </div>
      )}
      <Field label="Note" htmlFor="cg-n"><input id="cg-n" className={inputClass} value={f.note} onChange={set("note")} /></Field>
    </Dialog>
  );
}

/** Deposit: received, refunded, or applied to rent, charges or damages. */
function DepositDialog({ departmentId, lease, currentUserName, onClose }) {
  const [busy, submit] = useSubmit(onClose);
  const d = lease.deposit;
  const due = Math.max(0, d.required - d.received);
  const [mode, setMode] = useState(due ? "receive" : d.held ? "apply" : "receive");
  const [pay, setPay] = useState({ amount: String(due || ""), paymentMethod: "CASH", reference: "", receivedByName: currentUserName || "" });
  const [use, setUse] = useState({ use: "rent", amount: "", label: "", notes: "" });
  const [files, setFiles] = useState([]);
  const amount = mode === "apply" ? Number(use.amount) || 0 : Number(pay.amount) || 0;
  const max = mode === "receive" ? due : d.held;
  const run = () => {
    if (mode === "receive") return submit(depositReceiveSpec(departmentId, lease, { ...pay, amount }, files), (r) => `Deposit ${r.referenceNo} recorded: ${formatMoney(r.held)} held.`);
    if (mode === "refund") return submit(depositRefundSpec(departmentId, lease, { ...pay, amount, notes: use.notes }), (r) => `Deposit refund ${r.referenceNo} recorded.`);
    return submit(depositApplySpec(departmentId, lease, { use: use.use, amount, label: use.label, notes: use.notes }), (r) => `${formatMoney(r.amount)} of the deposit applied. ${formatMoney(r.held)} still held.`);
  };
  return (
    <Dialog wide title="Deposit / caution" description={`Required ${formatMoney(d.required)} · received ${formatMoney(d.received)} · held ${formatMoney(d.held)}. A deposit is never income: it is held for the tenant.`} busy={busy} disabled={!(amount > 0) || amount > max || (mode !== "apply" && !paymentReady({ ...pay, amount }))} submitLabel={mode === "receive" ? "Record the deposit" : mode === "refund" ? "Give it back" : "Apply it"} onClose={onClose} onSubmit={run}>
      <div className="flex flex-wrap gap-2" role="group" aria-label="Deposit">
        {[["receive", "Received"], ["refund", "Refund"], ["apply", "Use for a debt"]].map(([k, l]) => <Button key={k} size="sm" variant={mode === k ? "secondary" : "ghost"} aria-pressed={mode === k} disabled={(k !== "receive" && !d.held) || (k === "receive" && !due)} onClick={() => setMode(k)}>{l}</Button>)}
      </div>
      {mode === "apply" ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Pays" htmlFor="dp-u"><select id="dp-u" className={selectClass} value={use.use} onChange={(e) => setUse({ ...use, use: e.target.value })}><option value="rent">Unpaid rent</option><option value="charges">Unpaid utilities and charges</option><option value="damage">Damages (billed now)</option></select></Field>
          <Field label="Amount (FCFA)" required htmlFor="dp-a" error={amount > max ? `At most ${formatMoney(max)} is held.` : null}><input id="dp-a" className={inputClass} inputMode="numeric" value={use.amount} onChange={(e) => setUse({ ...use, amount: wholeNumber(e.target.value) })} /></Field>
          {use.use === "damage" ? <Field label="Damages" htmlFor="dp-l"><input id="dp-l" className={inputClass} value={use.label} onChange={(e) => setUse({ ...use, label: e.target.value })} placeholder="Broken door lock" /></Field> : null}
        </div>
      ) : (
        <PaymentFields value={pay} onChange={setPay} idPrefix="dp" amountLabel={mode === "refund" ? "Amount given back (FCFA)" : "Amount received (FCFA)"} byLabel={mode === "refund" ? "Given by" : "Received by"} amountError={amount > max ? `At most ${formatMoney(max)}.` : null} />
      )}
      <Field label="Note" htmlFor="dp-n"><input id="dp-n" className={inputClass} value={use.notes} onChange={(e) => setUse({ ...use, notes: e.target.value })} /></Field>
      {mode === "receive" ? <ProofUpload value={files} onChange={setFiles} label="Attach proof of payment" /> : null}
    </Dialog>
  );
}

function RentDialog({ departmentId, lease, onClose }) {
  const [busy, submit] = useSubmit(onClose);
  const [f, setF] = useState({ amount: String(lease.rentNow), fromMonth: lease.nextMonth, note: "", confirmPaidMonths: false });
  return (
    <Dialog title="Change the rent" description={`Now ${formatMoney(lease.rentNow)} a month. Earlier months keep their price.`} busy={busy} disabled={!(Number(f.amount) > 0) || !f.note.trim() || !f.fromMonth} submitLabel="Save the new rent" onClose={onClose} onSubmit={() => submit(leaseRentSpec(departmentId, lease, { ...f, amount: Number(f.amount) }), (r) => `New rent ${formatMoney(r.amount)} from ${r.fromMonth}.`)}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="New monthly rent (FCFA)" required htmlFor="rn-a"><input id="rn-a" className={inputClass} inputMode="numeric" value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} /></Field>
        <Field label="From the month" required htmlFor="rn-m"><input id="rn-m" type="month" className={inputClass} value={f.fromMonth} onChange={(e) => setF({ ...f, fromMonth: e.target.value })} /></Field>
      </div>
      <Field label="Why" required htmlFor="rn-n"><input id="rn-n" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Yearly increase in the contract" /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.confirmPaidMonths} onChange={(e) => setF({ ...f, confirmPaidMonths: e.target.checked })} /> Change it even if some of those months are already paid</label>
    </Dialog>
  );
}

function TermsDialog({ departmentId, lease, onClose }) {
  const [busy, submit] = useSubmit(onClose);
  const [f, setF] = useState({ startKey: lease.startKey, endKey: lease.endKey || "", dueDay: String(lease.dueDay), monthsPerBill: String(lease.monthsPerBill), depositRequired: String(lease.depositRequired), noticeDays: String(lease.noticeDays), utilities: lease.utilities || "", conditions: lease.conditions || "", notes: lease.notes || "" });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  return (
    <Dialog wide title="Contract terms" description="Renew by moving the end date. The rent changes with “Change the rent”." busy={busy} submitLabel="Save" onClose={onClose} onSubmit={() => submit(leaseUpdateSpec(departmentId, lease, { ...f, dueDay: Number(f.dueDay), monthsPerBill: Number(f.monthsPerBill), depositRequired: Number(f.depositRequired) || 0, noticeDays: Number(f.noticeDays) || 0 }, files), "Contract saved.")}>
      <div className="grid gap-3 sm:grid-cols-3">
        {lease.status === "RESERVED" ? <Field label="Starts" htmlFor="tm-s"><input id="tm-s" type="date" className={inputClass} value={f.startKey} onChange={set("startKey")} /></Field> : null}
        <Field label="Ends" htmlFor="tm-e"><input id="tm-e" type="date" className={inputClass} value={f.endKey} onChange={set("endKey")} /></Field>
        <Field label="Due day" htmlFor="tm-d"><input id="tm-d" type="number" min="1" max="28" className={inputClass} value={f.dueDay} onChange={set("dueDay")} /></Field>
        <Field label="Billed every" htmlFor="tm-b"><select id="tm-b" className={selectClass} value={f.monthsPerBill} onChange={set("monthsPerBill")}><option value="1">Month</option><option value="3">3 months</option><option value="6">6 months</option><option value="12">Year</option></select></Field>
        <Field label="Deposit required" htmlFor="tm-dp"><input id="tm-dp" className={inputClass} inputMode="numeric" value={f.depositRequired} onChange={(e) => setF({ ...f, depositRequired: wholeNumber(e.target.value) })} /></Field>
        <Field label="Notice (days)" htmlFor="tm-n"><input id="tm-n" type="number" min="0" className={inputClass} value={f.noticeDays} onChange={set("noticeDays")} /></Field>
      </div>
      <Field label="Utilities and charges" htmlFor="tm-u"><textarea id="tm-u" rows={2} className={textareaClass} value={f.utilities} onChange={set("utilities")} /></Field>
      <Field label="Other conditions" htmlFor="tm-c"><textarea id="tm-c" rows={2} className={textareaClass} value={f.conditions} onChange={set("conditions")} /></Field>
      <Field label="Notes" htmlFor="tm-no"><input id="tm-no" className={inputClass} value={f.notes} onChange={set("notes")} /></Field>
      <ProofUpload value={files} onChange={setFiles} label="Attach documents (signed contract, renewal …)" />
    </Dialog>
  );
}

function MoveOutDialog({ departmentId, lease, currentUserName, onClose }) {
  const [busy, submit] = useSubmit(onClose);
  const [f, setF] = useState({ moveOutKey: lease.todayKey, reason: "", availableFromKey: "", repairs: "", inspect: true, depositDamage: "", depositRent: "", depositCharges: "" });
  const [findings, setFindings] = useState(blankFindings(currentUserName));
  const [refund, setRefund] = useState({ amount: "", paymentMethod: "CASH", reference: "", receivedByName: currentUserName || "" });
  const [files, setFiles] = useState([]);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const used = (Number(f.depositDamage) || 0) + (Number(f.depositRent) || 0) + (Number(f.depositCharges) || 0) + (Number(refund.amount) || 0);
  const held = lease.deposit.held;
  const run = () =>
    submit(
      leaseEndSpec(departmentId, lease, {
        moveOutKey: f.moveOutKey,
        reason: f.reason,
        availableFromKey: f.availableFromKey || undefined,
        repairs: f.repairs,
        ...(f.inspect ? { inspection: { ...findings, damageCost: Number(findings.damageCost) || 0, attachmentIds: undefined }, chargeDamages: findings.chargeDamages } : {}),
        deposit: { damage: Number(f.depositDamage) || 0, rent: Number(f.depositRent) || 0, charges: Number(f.depositCharges) || 0 },
        ...(Number(refund.amount) > 0 ? { refund: { ...refund, amount: Number(refund.amount) } } : {}),
      }, files),
      (r) => `${lease.tenant} moved out. Still owed: ${formatMoney(r.owedAfter)} · deposit held: ${formatMoney(r.depositHeld)}.`
    );
  return (
    <Dialog wide title={`Move-out of ${lease.tenant}`} description={`${lease.office} · owed now ${formatMoney(lease.outstanding)} · deposit held ${formatMoney(held)}`} busy={busy} disabled={!f.moveOutKey || !f.reason.trim() || used > held || (Number(refund.amount) > 0 && !paymentReady(refund))} submitLabel="Record the move-out" onClose={onClose} onSubmit={run}>
      <div className="grid gap-3 sm:grid-cols-3">
        <Field label="Last day (rent until)" required htmlFor="mo-d"><input id="mo-d" type="date" className={inputClass} value={f.moveOutKey} onChange={set("moveOutKey")} /></Field>
        <Field label="Why" required htmlFor="mo-r"><input id="mo-r" className={inputClass} value={f.reason} onChange={set("reason")} placeholder="End of contract, notice given…" /></Field>
        <Field label="Office ready from" htmlFor="mo-a"><input id="mo-a" type="date" className={inputClass} value={f.availableFromKey} onChange={set("availableFromKey")} /></Field>
      </div>
      <Field label="Repairs required" htmlFor="mo-rp"><input id="mo-rp" className={inputClass} value={f.repairs} onChange={set("repairs")} /></Field>
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.inspect} onChange={(e) => setF({ ...f, inspect: e.target.checked })} /> Final inspection</label>
      {f.inspect ? <InspectionFindings value={findings} onChange={setFindings} canBill idPrefix="mo" /> : null}
      <div className="rounded-lg border border-slate-200 p-3">
        <h3 className="mb-2 text-sm font-semibold text-slate-900">The deposit ({formatMoney(held)} held)</h3>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Covers damages" htmlFor="mo-dd" hint="Billed and paid from the deposit"><input id="mo-dd" className={inputClass} inputMode="numeric" value={f.depositDamage} onChange={(e) => setF({ ...f, depositDamage: wholeNumber(e.target.value) })} /></Field>
          <Field label="Covers unpaid rent" htmlFor="mo-dr" hint={`Rent owed now ${formatMoney(lease.rentOutstanding)} (before the last month is prorated)`}><input id="mo-dr" className={inputClass} inputMode="numeric" value={f.depositRent} onChange={(e) => setF({ ...f, depositRent: wholeNumber(e.target.value) })} /></Field>
          <Field label="Covers utilities / charges" htmlFor="mo-dc"><input id="mo-dc" className={inputClass} inputMode="numeric" value={f.depositCharges} onChange={(e) => setF({ ...f, depositCharges: wholeNumber(e.target.value) })} /></Field>
        </div>
        <div className="mt-3"><PaymentFields value={refund} onChange={setRefund} idPrefix="mo-rf" amountLabel="Refunded to the tenant (FCFA)" byLabel="Given by" amountError={used > held ? `The deposit used and refunded (${formatMoney(used)}) is more than held.` : null} /></div>
        <p className="mt-2 text-xs text-slate-500">What is not used or refunded stays held (pending).</p>
      </div>
      <ProofUpload value={files} onChange={setFiles} label="Photos of the inspection" />
    </Dialog>
  );
}

function SimpleDialog({ title, description, fields, onSubmit, onClose, busy, submitLabel, variant }) {
  const [v, setV] = useState(Object.fromEntries(fields.map((f) => [f.name, f.value || ""])));
  return (
    <Dialog title={title} description={description} busy={busy} variant={variant} disabled={fields.some((f) => f.required && !String(v[f.name]).trim())} submitLabel={submitLabel} onClose={onClose} onSubmit={() => onSubmit(v)}>
      {fields.map((f) => (
        <Field key={f.name} label={f.label} required={f.required} htmlFor={`sd-${f.name}`}>
          {f.options ? <select id={`sd-${f.name}`} className={selectClass} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: e.target.value })}>{f.options.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select> : <input id={`sd-${f.name}`} type={f.type || "text"} className={inputClass} inputMode={f.numeric ? "numeric" : undefined} value={v[f.name]} onChange={(e) => setV({ ...v, [f.name]: f.numeric ? wholeNumber(e.target.value) : e.target.value })} />}
        </Field>
      ))}
    </Dialog>
  );
}

/** Every action of a contract, by its status and the person's rights. */
export function ContractActions({ departmentId, lease, items, canLease, canPrices, currentUserName, businessName }) {
  const [open, setOpen] = useState(null);
  const [busy, submit] = useSubmit(() => setOpen(null));
  if (!canLease) return null;
  const close = () => setOpen(null);
  const live = ["ACTIVE", "RESERVED"].includes(lease.status);
  const wa = lease.phone ? whatsappLink(lease.phone, reminderText({ business: businessName, tenant: lease.tenant, office: lease.office, outstanding: lease.outstanding, byKind: lease.byKind, monthsOwed: lease.monthsOwed, next: lease.next })) : null;
  const owedItems = items.filter((i) => i.due && i.balance > 0);
  return (
    <div className="flex flex-wrap gap-2 print:hidden">
      {lease.status !== "CANCELLED" ? <Button onClick={() => setOpen("pay")}><HandCoins className="h-4 w-4" /> Record a payment</Button> : null}
      {["ACTIVE", "ENDED"].includes(lease.status) ? <Button variant="outline" onClick={() => setOpen("charge")}><Receipt className="h-4 w-4" /> Bill a charge</Button> : null}
      {lease.status !== "CANCELLED" ? <Button variant="outline" onClick={() => setOpen("deposit")}><PiggyBank className="h-4 w-4" /> Deposit</Button> : null}
      {lease.status === "RESERVED" ? <Button variant="outline" onClick={() => setOpen("start")}><DoorOpen className="h-4 w-4" /> Moved in</Button> : null}
      {live && canPrices ? <Button variant="ghost" onClick={() => setOpen("rent")}><TrendingUp className="h-4 w-4" /> Change the rent</Button> : null}
      {live ? <Button variant="ghost" onClick={() => setOpen("terms")}><FileSignature className="h-4 w-4" /> Terms / renew</Button> : null}
      {canPrices && owedItems.length ? <Button variant="ghost" onClick={() => setOpen("waive")}><BadgePercent className="h-4 w-4" /> Forgive</Button> : null}
      {lease.credit > 0 ? <Button variant="ghost" onClick={() => setOpen("refund")}><Undo2 className="h-4 w-4" /> Refund advance</Button> : null}
      {wa && lease.outstanding > 0 ? <a href={wa} target="_blank" rel="noreferrer"><Button variant="ghost"><MessageCircle className="h-4 w-4" /> Remind by WhatsApp</Button></a> : null}
      {lease.status === "ACTIVE" ? <Button variant="outline" onClick={() => setOpen("end")}><LogOut className="h-4 w-4" /> Move-out</Button> : null}
      {lease.status === "RESERVED" ? <Button variant="ghost" onClick={() => setOpen("cancel")}><CircleX className="h-4 w-4" /> Cancel</Button> : null}

      {open === "pay" ? <LeasePaymentDialog departmentId={departmentId} lease={lease} items={items} outstanding={lease.outstanding} currentUserName={currentUserName} onClose={close} /> : null}
      {open === "charge" ? <ChargeDialog departmentId={departmentId} lease={lease} onClose={close} /> : null}
      {open === "deposit" ? <DepositDialog departmentId={departmentId} lease={lease} currentUserName={currentUserName} onClose={close} /> : null}
      {open === "rent" ? <RentDialog departmentId={departmentId} lease={lease} onClose={close} /> : null}
      {open === "terms" ? <TermsDialog departmentId={departmentId} lease={lease} onClose={close} /> : null}
      {open === "end" ? <MoveOutDialog departmentId={departmentId} lease={lease} currentUserName={currentUserName} onClose={close} /> : null}
      {open === "start" ? <SimpleDialog title={`${lease.tenant} moves in`} fields={[{ name: "moveInKey", label: "Move-in date", type: "date", value: lease.todayKey, required: true }]} busy={busy} submitLabel="Confirm" onClose={close} onSubmit={(v) => submit(leaseStartSpec(departmentId, lease, v), `${lease.tenant} moved in.`)} /> : null}
      {open === "cancel" ? <SimpleDialog title="Cancel the reservation" description="Money received stays on the tenant's account: refund it from Deposit or Refund advance." fields={[{ name: "reason", label: "Why", required: true }]} busy={busy} variant="destructive" submitLabel="Cancel the reservation" onClose={close} onSubmit={(v) => submit(leaseCancelSpec(departmentId, lease, v.reason), "Reservation cancelled.")} /> : null}
      {open === "waive" ? <SimpleDialog title="Forgive part of a debt" description="Not money: the month or charge is simply no longer owed for that amount." fields={[{ name: "item", label: "Month / charge", options: owedItems.map((i) => [i.chargeId ? `c:${i.chargeId}` : `m:${i.monthKey}`, `${i.label} (owes ${formatMoney(i.balance)})`]), value: owedItems[0] ? (owedItems[0].chargeId ? `c:${owedItems[0].chargeId}` : `m:${owedItems[0].monthKey}`) : "" }, { name: "amount", label: "Amount forgiven (FCFA)", numeric: true, required: true }, { name: "reason", label: "Why", required: true }]} busy={busy} submitLabel="Forgive" onClose={close} onSubmit={(v) => submit(waiveSpec(departmentId, lease, { ...(v.item.startsWith("c:") ? { chargeId: v.item.slice(2) } : { monthKey: v.item.slice(2) }), amount: Number(v.amount), reason: v.reason }), "Debt forgiven.")} /> : null}
      {open === "refund" ? <SimpleDialog title="Refund the advance" description={`Advance not used: ${formatMoney(lease.credit)}.`} fields={[{ name: "amount", label: "Amount (FCFA)", numeric: true, required: true, value: String(lease.credit) }, { name: "paymentMethod", label: "Given back by", options: [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank transfer"], ["OTHER", "Other"]], value: "CASH" }, { name: "reference", label: "Reference (unless cash)" }, { name: "reason", label: "Why", required: true }]} busy={busy} submitLabel="Give it back" onClose={close} onSubmit={(v) => submit(leaseRefundSpec(departmentId, lease, { ...v, amount: Number(v.amount) }), (r) => `Refund ${r.referenceNo} recorded.`)} /> : null}
    </div>
  );
}

