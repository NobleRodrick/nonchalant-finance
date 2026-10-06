"use client";

import { useMemo, useState } from "react";
import { Field, inputClass, Money } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { PaymentFields, paymentReady } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { itemKey, proposeAllocation } from "@/lib/property/account";
import { leasePaymentSpec } from "@/lib/property/specs";
import { formatMoney } from "@/lib/format";

/**
 * A tenant's payment: amount, method, reference, who received it, proof, and what it pays — the
 * oldest debts first, as proposed, or the split changed by hand (owner's rule). Shows the
 * previous balance, what remains and the advance before saving.
 */
export function LeasePaymentDialog({ departmentId, lease, items, outstanding, currentUserName, onClose }) {
  const record = useRecorder();
  const open = useMemo(() => items.filter((i) => i.balance > 0), [items]);
  const [f, setF] = useState({ amount: outstanding ? String(outstanding) : "", paymentMethod: "CASH", reference: "", receivedByName: currentUserName || "", notes: "" });
  const [custom, setCustom] = useState(null); // { key: amount } when the split is changed by hand
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const proposal = useMemo(() => proposeAllocation({ items: open }, amount), [open, amount]);
  const split = custom ? open.map((i) => ({ key: itemKey(i), monthKey: i.chargeId ? null : i.monthKey, chargeId: i.chargeId, label: i.label, amount: Number(custom[itemKey(i)]) || 0 })).filter((l) => l.amount > 0) : proposal.lines;
  const allocated = split.reduce((s, l) => s + l.amount, 0);
  const tooMuch = custom && (allocated > amount || open.some((i) => (Number(custom[itemKey(i)]) || 0) > i.balance));
  const advance = Math.max(0, amount - allocated);
  const submit = async () => {
    setBusy(true);
    const input = { amount, paymentMethod: f.paymentMethod, reference: f.reference.trim(), receivedByName: f.receivedByName.trim(), notes: f.notes.trim(), ...(custom ? { lines: split.map(({ monthKey, chargeId, amount: a }) => ({ monthKey, chargeId, amount: a })) } : {}), ...(lease.status === "RESERVED" ? { advance: true } : {}) };
    const out = await record(leasePaymentSpec(departmentId, lease, input, files), { success: (r) => `Payment ${r.referenceNo} recorded. Still owed: ${formatMoney(r.remaining)}${r.advance ? ` · advance ${formatMoney(r.advance)}` : ""}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={`Payment from ${lease.tenant}`} description={`${lease.office} · owed now ${formatMoney(outstanding)}`} footer={<SubmitButton busy={busy} disabled={!paymentReady(f) || tooMuch} onClick={submit}>Record {amount ? formatMoney(amount) : ""}</SubmitButton>}>
      <PaymentFields value={f} onChange={setF} idPrefix="lp" />
      <div className="rounded-lg border border-slate-200">
        <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
          <h3 className="text-sm font-semibold text-slate-900">What it pays</h3>
          <button type="button" className="text-xs font-medium text-slate-600 underline" onClick={() => setCustom(custom ? null : Object.fromEntries(proposal.lines.map((l) => [l.key, String(l.amount)])))}>{custom ? "Back to oldest first" : "Choose the split"}</button>
        </div>
        {open.length ? (
          <table className="w-full text-sm" data-testid="payment-split">
            <thead><tr className="text-left text-xs text-slate-500"><th className="px-3 py-1.5 font-medium">Month / charge</th><th className="px-3 py-1.5 font-medium">Due</th><th className="px-3 py-1.5 text-right font-medium">Owed</th><th className="px-3 py-1.5 text-right font-medium">Paid now</th></tr></thead>
            <tbody>
              {open.map((i) => {
                const k = itemKey(i);
                const now = custom ? custom[k] || "" : proposal.lines.find((l) => l.key === k)?.amount || 0;
                return (
                  <tr key={k} className="border-t border-slate-100">
                    <td className="px-3 py-1.5">{i.label}</td>
                    <td className="px-3 py-1.5 text-slate-600">{i.dueKey}{i.overdue ? <span className="ml-1 text-xs text-rose-700">late</span> : null}</td>
                    <td className="px-3 py-1.5 text-right"><Money value={i.balance} suffix={false} /></td>
                    <td className="px-3 py-1.5 text-right">{custom ? <input aria-label={`Paid now: ${i.label}`} className={`${inputClass} h-8 w-28 text-right`} inputMode="numeric" value={now} onChange={(e) => setCustom({ ...custom, [k]: wholeNumber(e.target.value) })} /> : <Money value={now} suffix={false} />}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        ) : <p className="px-3 py-2 text-sm text-slate-500">Nothing is owed: the whole payment is an advance for the next months.</p>}
        <div className="flex flex-wrap justify-between gap-2 border-t border-slate-100 px-3 py-2 text-sm">
          <span>Allocated <strong>{formatMoney(allocated)}</strong></span>
          {tooMuch ? <span className="font-medium text-rose-700">More than received or than owed on a line.</span> : <span>Advance (pays the next months) <strong>{formatMoney(advance)}</strong></span>}
          <span>Still owed after <strong>{formatMoney(Math.max(0, outstanding - Math.min(allocated, outstanding)))}</strong></span>
        </div>
      </div>
      <Field label="Notes" htmlFor="lp-n"><input id="lp-n" className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      <ProofUpload value={files} onChange={setFiles} label="Attach proof of payment" />
    </FormDialog>
  );
}
