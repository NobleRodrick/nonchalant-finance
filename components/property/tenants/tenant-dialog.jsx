"use client";

import { useState } from "react";
import { Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ExportMenu } from "@/components/kit/export-menu";
import { useRecorder } from "@/lib/offline/react";
import { tenantSaveSpec } from "@/lib/property/specs";
import { exportFileName } from "@/lib/export/table-export";

const FIELDS = [["name", "Full name / company name", true], ["company", "Contact person / company"], ["phone", "Phone"], ["phoneAlt", "Other phone"], ["email", "E-mail"], ["address", "Address"], ["identification", "Identification (ID, passport, RCCM)"]];

/** Adds a tenant or changes one's details. */
export function TenantDialog({ departmentId, tenant = null, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(Object.fromEntries([...FIELDS.map(([k]) => [k, tenant?.[k] || ""]), ["notes", tenant?.notes || ""]]));
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(tenantSaveSpec(departmentId, { ...(tenant ? { id: tenant.id } : {}), ...f, name: f.name.trim() }), { success: tenant ? "Tenant saved." : `${f.name.trim()} added.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={tenant ? tenant.name : "Add a tenant"} footer={<SubmitButton busy={busy} disabled={f.name.trim().length < 2} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        {FIELDS.map(([k, label, required]) => <Field key={k} label={label} required={required} htmlFor={`tn-${k}`}><input id={`tn-${k}`} type={k === "email" ? "email" : "text"} className={inputClass} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} /></Field>)}
      </div>
      <Field label="Notes" htmlFor="tn-notes"><textarea id="tn-notes" rows={2} className={textareaClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </FormDialog>
  );
}

export function TenantButton({ departmentId, tenant, label }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant={tenant ? "outline" : "default"} onClick={() => setOpen(true)}>{tenant ? <Pencil className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />} {label || (tenant ? "Edit" : "Add a tenant")}</Button>
      {open ? <TenantDialog departmentId={departmentId} tenant={tenant} onClose={() => setOpen(false)} /> : null}
    </>
  );
}

export function TenantExport({ rows, todayKey }) {
  return (
    <ExportMenu
      fileName={exportFileName("tenants", todayKey)}
      sheets={{
        name: "Tenants",
        columns: [
          { label: "Tenant", value: "name" },
          { label: "Company / contact", value: "company" },
          { label: "Phone", value: "phone" },
          { label: "E-mail", value: "email" },
          { label: "Identification", value: "identification" },
          { label: "Offices", value: (r) => r.live.map((l) => `${l.unit.name} (${l.unit.building.name})`).join(", ") },
          { label: "Rent a month", value: "rent" },
          { label: "Owed", value: "owed" },
          { label: "Overdue", value: "overdue" },
          { label: "Months owed", value: "monthsOwed" },
          { label: "Deposit held", value: "depositHeld" },
        ],
        rows,
      }}
    />
  );
}
