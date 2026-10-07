"use client";

import { useState } from "react";
import { ArrowLeftRight, PackagePlus, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { METHODS } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { packagingMoveSpec, packagingSpec } from "@/lib/trade/specs";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";

export const MOVE_KINDS = {
  RETURNED: { label: "Empties given back to the supplier", unit: "crates", money: "Deposit refunded to you", party: "Supplier" },
  CUSTOMER_OUT: { label: "Bottles taken away by a customer", unit: "bottles", money: "Deposit received from the customer", party: "Customer" },
  CUSTOMER_BACK: { label: "Bottles brought back by a customer", unit: "bottles", money: "Deposit given back to the customer", party: "Customer" },
  BROKEN: { label: "Crates broken or lost", unit: "crates", money: null, party: null },
  COUNT: { label: "I counted the crates here", unit: "crates", money: null, party: null },
  RECEIVED: { label: "Full crates received", unit: "crates" },
};

function CrateDialog({ departmentId, crate, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ name: crate?.name || "", supplierName: crate?.supplierName || "", deposit: crate ? String(crate.deposit) : "", bottleDeposit: crate?.bottleDeposit ? String(crate.bottleDeposit) : "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: ["deposit", "bottleDeposit"].includes(k) ? wholeNumber(e.target.value) : e.target.value });
  const submit = async () => {
    setBusy(true);
    const out = await record(packagingSpec(departmentId, { ...(crate ? { id: crate.id } : {}), ...f, name: f.name.trim(), deposit: Number(f.deposit), bottleDeposit: Number(f.bottleDeposit) || 0 }), { success: "Crate saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={crate ? crate.name : "Add a kind of crate"} description="One line per kind of returnable crate (brewery, size). Link the drinks to it on the Drinks page." footer={<SubmitButton busy={busy} disabled={!f.name.trim() || f.deposit === ""} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required htmlFor="cr-n" className="sm:col-span-2"><input id="cr-n" className={inputClass} value={f.name} onChange={set("name")} placeholder="SABC crate (12 × 65 cl)" /></Field>
        <Field label="Supplier" htmlFor="cr-s"><input id="cr-s" className={inputClass} value={f.supplierName} onChange={set("supplierName")} placeholder="SABC, Guinness…" /></Field>
        <Field label="Deposit of a crate (FCFA)" required htmlFor="cr-d" hint="Crate with its empty bottles"><input id="cr-d" className={inputClass} inputMode="numeric" value={f.deposit} onChange={set("deposit")} /></Field>
        <Field label="Deposit of one bottle (FCFA)" htmlFor="cr-b" hint="What a customer leaves to take a bottle away"><input id="cr-b" className={inputClass} inputMode="numeric" value={f.bottleDeposit} onChange={set("bottleDeposit")} /></Field>
      </div>
    </FormDialog>
  );
}

function MoveDialog({ departmentId, crates, crate: initial, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ packagingId: initial?.id || crates[0]?.id || "", kind: "RETURNED", quantity: "", counted: "", partyName: "", paymentMethod: "CASH", reference: "", noDeposit: false, note: "" });
  const [busy, setBusy] = useState(false);
  const crate = crates.find((c) => c.id === f.packagingId);
  const k = MOVE_KINDS[f.kind];
  const set = (key) => (e) => setF({ ...f, [key]: ["quantity", "counted"].includes(key) ? wholeNumber(e.target.value) : e.target.value });
  const unit = ["CUSTOMER_OUT", "CUSTOMER_BACK"].includes(f.kind) ? crate?.bottleDeposit || 0 : crate?.deposit || 0;
  const amount = k.money && !f.noDeposit ? (Number(f.quantity) || 0) * unit : 0;
  const max = { RETURNED: crate?.owedToSuppliers, CUSTOMER_BACK: crate?.bottlesWithCustomers, BROKEN: crate?.onHand }[f.kind];
  const valid = crate && (f.kind === "COUNT" ? f.counted !== "" : Number(f.quantity) > 0 && (max === undefined || Number(f.quantity) <= max)) && (!["BROKEN", "COUNT"].includes(f.kind) || f.note.trim()) && (!amount || f.paymentMethod === "CASH" || f.reference.trim());
  const submit = async () => {
    setBusy(true);
    const input = f.kind === "COUNT" ? { kind: "COUNT", counted: Number(f.counted), note: f.note.trim() } : { kind: f.kind, quantity: Number(f.quantity), partyName: f.partyName.trim() || null, paymentMethod: f.paymentMethod, reference: f.reference.trim() || null, noDeposit: f.noDeposit, note: f.note.trim() || null };
    const out = await record(packagingMoveSpec(departmentId, crate, input, k.label), { success: "Recorded." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title="Crates and bottles" description="Full crates come in with purchases. Here: empties back to the supplier, bottles customers take away or bring back, breakage, counts." footer={<><span className="mr-auto text-sm">{amount ? <>{k.money}: <strong className="tabular-nums">{formatMoney(amount)}</strong></> : f.kind === "BROKEN" && crate ? <>Deposit lost: <strong className="tabular-nums">{formatMoney((Number(f.quantity) || 0) * crate.deposit)}</strong></> : null}</span><SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record</SubmitButton></>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Crate" htmlFor="mv-c"><select id="mv-c" className={selectClass} value={f.packagingId} onChange={set("packagingId")}>{crates.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="What happened" htmlFor="mv-k"><select id="mv-k" className={selectClass} value={f.kind} onChange={set("kind")}>{["RETURNED", "CUSTOMER_OUT", "CUSTOMER_BACK", "BROKEN", "COUNT"].map((x) => <option key={x} value={x}>{MOVE_KINDS[x].label}</option>)}</select></Field>
        {f.kind === "COUNT" ? (
          <Field label="Crates counted here (full and empty)" required htmlFor="mv-n" hint={crate ? `The register shows ${crate.onHand}` : undefined}><input id="mv-n" className={inputClass} inputMode="numeric" value={f.counted} onChange={set("counted")} /></Field>
        ) : (
          <Field label={`How many ${k.unit}`} required htmlFor="mv-q" hint={max !== undefined ? `At most ${max}` : undefined}><input id="mv-q" className={inputClass} inputMode="numeric" value={f.quantity} onChange={set("quantity")} /></Field>
        )}
        {k.party ? <Field label={k.party} htmlFor="mv-p"><input id="mv-p" className={inputClass} value={f.partyName} onChange={set("partyName")} placeholder={f.kind === "RETURNED" ? crate?.supplierName || "" : "Name"} /></Field> : null}
        {k.money ? (
          <>
            <Field label="Paid by" htmlFor="mv-m"><select id="mv-m" className={selectClass} value={f.paymentMethod} onChange={set("paymentMethod")} disabled={f.noDeposit}>{METHODS.map(([key, l]) => <option key={key} value={key}>{l}</option>)}</select></Field>
            {f.paymentMethod !== "CASH" && !f.noDeposit ? <Field label="Transaction reference" required htmlFor="mv-r"><input id="mv-r" className={inputClass} value={f.reference} onChange={set("reference")} /></Field> : null}
            <label className="flex items-center gap-2 text-sm sm:col-span-2"><input type="checkbox" checked={f.noDeposit} onChange={(e) => setF({ ...f, noDeposit: e.target.checked })} /> No deposit this time (lent / given back without money)</label>
          </>
        ) : null}
        <Field label={["BROKEN", "COUNT"].includes(f.kind) ? "What happened" : "Note"} required={["BROKEN", "COUNT"].includes(f.kind)} htmlFor="mv-note" className="sm:col-span-2"><input id="mv-note" className={inputClass} value={f.note} onChange={set("note")} /></Field>
      </div>
    </FormDialog>
  );
}

/** Crates of a bar: owed back to suppliers, here, bottles out with customers, and the deposits. */
export function CratesBoard({ departmentId, crates, movements, perms }) {
  const [dialog, setDialog] = useState(null);
  const active = crates.filter((c) => c.isActive);
  return (
    <div className="space-y-5">
      <Section
        title="Crates"
        description="Deposits are never income or costs: they are money held by the supplier or for the customer. A crate broken or lost costs its deposit."
        bodyClassName="p-0"
        actions={
          <>
            {perms.sell && active.length ? <Button size="sm" onClick={() => setDialog({ kind: "move" })}><ArrowLeftRight className="h-4 w-4" /> Record a movement</Button> : null}
            {perms.manageStock ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "crate", crate: null })}><PackagePlus className="h-4 w-4" /> Add a kind of crate</Button> : null}
          </>
        }
      >
        <DataTable
          rows={crates}
          empty="No crate yet: add the kinds of returnable crates you buy (with their deposit)."
          columns={[
            { key: "n", label: "Crate", render: (c) => <span className="font-medium">{c.name}<span className="block text-xs font-normal text-slate-500">{[c.supplierName, `${formatMoney(c.deposit)} a crate`, c.bottleDeposit ? `${formatMoney(c.bottleDeposit)} a bottle` : null].filter(Boolean).join(" · ")}</span></span> },
            { key: "o", label: "Owed back to suppliers", align: "right", render: (c) => c.owedToSuppliers },
            { key: "h", label: "Here (full + empty)", align: "right", render: (c) => c.onHand },
            { key: "b", label: "Bottles with customers", align: "right", render: (c) => c.bottlesWithCustomers },
            { key: "ds", label: "Deposits with suppliers", align: "right", render: (c) => <Money value={c.depositsWithSuppliers} suffix={false} /> },
            { key: "dc", label: "Held for customers", align: "right", render: (c) => <Money value={c.depositsHeldForCustomers} suffix={false} /> },
            { key: "l", label: "Lost (broken)", align: "right", render: (c) => (c.depositLost ? <Money value={c.depositLost} suffix={false} tone="out" /> : "—") },
            { key: "x", label: "", render: (c) => <div className="flex justify-end gap-1">{perms.sell && c.isActive ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "move", crate: c })}>Move</Button> : null}{perms.manageStock ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "crate", crate: c })} aria-label={`Edit ${c.name}`}><Pencil className="h-4 w-4" /></Button> : null}</div> },
          ]}
        />
      </Section>
      <Section title="Last movements" bodyClassName="p-0">
        <DataTable
          dense
          rows={movements}
          empty="No movement yet."
          columns={[
            { key: "d", label: "Date", render: (m) => `${formatDateKey(m.dateKey, { weekday: false })} ${m.time}` },
            { key: "c", label: "Crate", render: (m) => m.crate },
            { key: "k", label: "What", render: (m) => MOVE_KINDS[m.kind]?.label || m.kind },
            { key: "q", label: "Quantity", align: "right", render: (m) => `${m.quantity} ${MOVE_KINDS[m.kind]?.unit || ""}` },
            { key: "a", label: "Deposit", align: "right", render: (m) => (m.amount ? <Money value={m.amount} suffix={false} /> : "—") },
            { key: "p", label: "Who / note", render: (m) => <span className="text-xs">{[m.party, m.note].filter(Boolean).join(" · ")}</span> },
          ]}
        />
      </Section>
      {dialog?.kind === "crate" ? <CrateDialog departmentId={departmentId} crate={dialog.crate} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "move" ? <MoveDialog departmentId={departmentId} crates={active} crate={dialog.crate} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
