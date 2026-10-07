"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Field, inputClass, selectClass } from "@/components/kit/primitives";
import { SubmitButton } from "@/components/kit/form-dialog";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { allocateResultAction, closeBooksAction, reopenBooksAction } from "@/actions/accounting";

const label = (m) => new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${m}-01T00:00:00Z`));

/** Close through a month (the Boss), or reopen the last closed month with a reason. */
export function ClosingActions({ companyId, months, target, canSettle, blocked, hasClosed }) {
  const router = useRouter();
  const [month, setMonth] = useState(target || "");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(null);
  if (!canSettle) return <p className="text-sm text-slate-500">The Boss closes and reopens the books.</p>;
  const close = async () => {
    setBusy("close");
    const ok = await runWithToast(closeBooksAction({ companyId, month }), { success: (d) => `Closed: ${d.closed.map(label).join(", ")}.` });
    setBusy(null);
    if (ok) router.refresh();
  };
  const reopen = async () => {
    setBusy("reopen");
    const ok = await runWithToast(reopenBooksAction({ companyId, reason }), { success: (d) => `${d.reopened} reopened.` });
    setBusy(null);
    if (ok) {
      setReason("");
      router.refresh();
    }
  };
  return (
    <div className="space-y-4">
      {months.length ? (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Close the books through" htmlFor="cl-month">
            <select id="cl-month" className={selectClass} value={month} onChange={(e) => setMonth(e.target.value)}>
              {months.map((m) => <option key={m} value={m}>{label(m)}</option>)}
            </select>
          </Field>
          <SubmitButton busy={busy === "close"} disabled={blocked || Boolean(busy)} onClick={close}>Close</SubmitButton>
        </div>
      ) : null}
      {hasClosed ? (
        <div className="flex flex-wrap items-end gap-2 border-t border-slate-100 pt-3">
          <Field label="Reopen the last closed month: why?" htmlFor="cl-reason"><input id="cl-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. a supplier invoice was missing" /></Field>
          <SubmitButton variant="outline" busy={busy === "reopen"} disabled={!reason.trim() || Boolean(busy)} onClick={reopen}>Reopen</SubmitButton>
        </div>
      ) : null}
    </div>
  );
}

/** The owners' decision on a year's profit. */
export function AllocationForm({ companyId, year }) {
  const router = useRouter();
  const [f, setF] = useState({ reserves: "", dividends: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(allocateResultAction({ companyId, year, reserves: Number(f.reserves) || 0, dividends: Number(f.dividends) || 0 }), { success: "Allocation recorded." });
    setBusy(false);
    if (ok) router.refresh();
  };
  return (
    <div className="grid gap-2">
      <Field label="To reserves (FCFA)" htmlFor="al-res"><input id="al-res" inputMode="numeric" className={inputClass} value={f.reserves} onChange={(e) => setF({ ...f, reserves: wholeNumber(e.target.value) })} /></Field>
      <Field label="Dividends to pay (FCFA)" htmlFor="al-div"><input id="al-div" inputMode="numeric" className={inputClass} value={f.dividends} onChange={(e) => setF({ ...f, dividends: wholeNumber(e.target.value) })} /></Field>
      <SubmitButton busy={busy} onClick={submit}>Record the allocation of {year}</SubmitButton>
    </div>
  );
}
