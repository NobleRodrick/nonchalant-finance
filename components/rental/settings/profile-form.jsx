"use client";

import { useState } from "react";
import { Field, Section, inputClass, textareaClass } from "@/components/kit/primitives";
import { SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useRecorder } from "@/lib/offline/react";

import { DEFAULT_CONTRACT_TERMS, DEFAULT_PAYMENT_TERMS } from "@/lib/rental/documents";

const FIELDS = [
  ["legalName", "Business name on documents", "e.g. Deco Diva Events"],
  ["tagline", "Tagline", "Decoration & event rental"],
  ["address", "Address", "Street, district, city"],
  ["phone", "Phone", ""],
  ["email", "E-mail", ""],
  ["website", "Website or social page", ""],
  ["taxId", "Tax number (NIU)", ""],
  ["registration", "Trade register (RCCM)", ""],
  ["momoNumber", "Mobile Money number for payments", ""],
  ["bankDetails", "Bank details for transfers", "Bank, account name and number"],
];

/** The business details printed on quotations, invoices, receipts and rental agreements. */
export function ProfileForm({ departmentId, profile, logoUrl, canEdit, kind = "rental.profile.save" }) {
  const record = useRecorder();
  const [f, setF] = useState(() => Object.fromEntries([...FIELDS.map(([k]) => k), "paymentTerms", "contractTerms", "footer"].map((k) => [k, profile[k] || ""])));
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });
  const submit = async () => {
    setBusy(true);
    await record({ kind, label: "Business details", departmentId, input: { departmentId, ...f }, meta: { summary: "Business details" }, ...(files.length ? { files } : {}) }, { success: "Business details saved." });
    setFiles([]);
    setBusy(false);
  };
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Section title="On every document" className="lg:col-span-2">
        <div className="grid gap-4 sm:grid-cols-2">
          {FIELDS.map(([k, label, ph]) => (
            <Field key={k} label={label} htmlFor={`pf-${k}`}><input id={`pf-${k}`} className={inputClass} value={f[k]} onChange={set(k)} placeholder={ph} disabled={!canEdit} /></Field>
          ))}
          <Field label="Footer" htmlFor="pf-footer" className="sm:col-span-2"><input id="pf-footer" className={inputClass} value={f.footer} onChange={set("footer")} placeholder="e.g. Thank you for trusting us with your event!" disabled={!canEdit} /></Field>
        </div>
      </Section>
      <Section title="Logo">
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="Logo" className="mb-3 h-24 w-24 rounded-lg border object-contain" />
        ) : <p className="mb-3 text-sm text-slate-500">No logo yet: documents show the initials.</p>}
        {canEdit ? <ProofUpload value={files} onChange={setFiles} label={logoUrl ? "Replace the logo" : "Add the logo"} /> : null}
      </Section>
      <Section title="Payment terms" description="On quotations, confirmations and invoices." className="lg:col-span-3">
        <textarea aria-label="Payment terms" className={textareaClass} rows={3} value={f.paymentTerms} onChange={set("paymentTerms")} placeholder={DEFAULT_PAYMENT_TERMS} disabled={!canEdit} />
      </Section>
      <Section title="Rental agreement terms" description="Printed on the rental agreement. Empty: the standard terms shown in grey." className="lg:col-span-3">
        <textarea aria-label="Rental agreement terms" className={textareaClass} rows={8} value={f.contractTerms} onChange={set("contractTerms")} placeholder={DEFAULT_CONTRACT_TERMS} disabled={!canEdit} />
      </Section>
      {canEdit ? <div className="lg:col-span-3"><SubmitButton busy={busy} onClick={submit}>Save the business details</SubmitButton></div> : null}
    </div>
  );
}
