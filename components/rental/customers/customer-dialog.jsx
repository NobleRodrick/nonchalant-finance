"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { clientSaveSpec } from "@/lib/rental/specs";

/** A customer's details (new or changed). */
export function CustomerDialog({ departmentId, customer, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ name: customer?.name || "", phone: customer?.phone || "", phoneAlt: customer?.phoneAlt || "", email: customer?.email || "", company: customer?.company || "", address: customer?.address || "", notes: customer?.notes || "" });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    const out = await record(clientSaveSpec(departmentId, { ...(customer ? { id: customer.id } : {}), ...f, name: f.name.trim() }), { success: `${f.name.trim()} saved.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={customer ? customer.name : "New customer"} footer={<SubmitButton busy={busy} disabled={f.name.trim().length < 2} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required htmlFor="cu-name"><input id="cu-name" className={inputClass} value={f.name} onChange={set("name")} /></Field>
        <Field label="Company / church / organisation" htmlFor="cu-co"><input id="cu-co" className={inputClass} value={f.company} onChange={set("company")} /></Field>
        <Field label="Phone" htmlFor="cu-ph"><input id="cu-ph" className={inputClass} inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Other phone" htmlFor="cu-ph2"><input id="cu-ph2" className={inputClass} inputMode="tel" value={f.phoneAlt} onChange={set("phoneAlt")} /></Field>
        <Field label="E-mail" htmlFor="cu-em"><input id="cu-em" type="email" className={inputClass} value={f.email} onChange={set("email")} /></Field>
        <Field label="Address" htmlFor="cu-ad"><input id="cu-ad" className={inputClass} value={f.address} onChange={set("address")} /></Field>
      </div>
      <Field label="Notes" htmlFor="cu-no"><textarea id="cu-no" className={textareaClass} value={f.notes} onChange={set("notes")} placeholder="Preferences, how they pay, who to call…" /></Field>
    </FormDialog>
  );
}

/** A button that opens the customer dialog. */
export function CustomerButton({ departmentId, customer, children, variant = "outline", size = "sm" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={variant} size={size} onClick={() => setOpen(true)}>{children}</Button>
      {open ? <CustomerDialog departmentId={departmentId} customer={customer} onClose={() => setOpen(false)} /> : null}
    </>
  );
}
