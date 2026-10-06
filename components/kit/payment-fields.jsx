"use client";

import { Field, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";

export const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank transfer"], ["OTHER", "Other (cheque, card…)"]];
export const METHOD_NAMES = Object.fromEntries(METHODS);

/**
 * The fields of any money received or given back: amount, method, the transaction reference
 * (required unless cash) and who received / gave it. `value` { amount, paymentMethod, reference,
 * receivedByName }, `onChange(next)`. Used by every department's payment forms.
 */
export function PaymentFields({ value: f, onChange, idPrefix = "pf", amountLabel = "Amount received (FCFA)", byLabel = "Received by", amountError = null, showBy = true }) {
  const set = (k) => (e) => onChange({ ...f, [k]: k === "amount" ? wholeNumber(e.target.value) : e.target.value });
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label={amountLabel} required htmlFor={`${idPrefix}-a`} error={amountError}><input id={`${idPrefix}-a`} className={inputClass} inputMode="numeric" value={f.amount} onChange={set("amount")} /></Field>
      <Field label="Paid by" htmlFor={`${idPrefix}-m`}><select id={`${idPrefix}-m`} className={selectClass} value={f.paymentMethod} onChange={set("paymentMethod")}>{METHODS.map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></Field>
      <Field label="Transaction reference" required={f.paymentMethod !== "CASH"} htmlFor={`${idPrefix}-r`}><input id={`${idPrefix}-r`} className={inputClass} value={f.reference} onChange={set("reference")} placeholder={f.paymentMethod === "MOMO" ? "MoMo transaction id" : f.paymentMethod === "BANK_TRANSFER" ? "Bank slip / transfer no." : ""} /></Field>
      {showBy ? <Field label={byLabel} htmlFor={`${idPrefix}-by`}><input id={`${idPrefix}-by`} className={inputClass} value={f.receivedByName} onChange={set("receivedByName")} /></Field> : null}
    </div>
  );
}

/** Whether the payment fields can be sent: an amount, and a reference unless cash. */
export const paymentReady = (f) => Number(f.amount) > 0 && (f.paymentMethod === "CASH" || String(f.reference || "").trim().length > 0);
