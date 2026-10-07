"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { DataTable, Money, inputClass } from "@/components/kit/primitives";
import { SubmitButton } from "@/components/kit/form-dialog";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { formatDateKey } from "@/lib/timezone";
import { recordVatReturnAction, setExpenseVatAction } from "@/actions/accounting";

function VatCell({ companyId, row, locked }) {
  const router = useRouter();
  const [v, setV] = useState(row.taxAmount || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (Number(v || 0) === Number(row.taxAmount || 0)) return;
    setBusy(true);
    const ok = await runWithToast(setExpenseVatAction({ companyId, transactionId: row.id, taxAmount: Number(v) || 0 }), { success: `VAT of ${row.referenceNo} saved.` });
    setBusy(false);
    if (ok) router.refresh();
  };
  return <input aria-label={`VAT of ${row.referenceNo}`} inputMode="numeric" disabled={locked || busy} className={`${inputClass} h-8 w-28 text-right`} value={v} onChange={(e) => setV(wholeNumber(e.target.value))} onBlur={save} onKeyDown={(e) => e.key === "Enter" && save()} />;
}

export function ExpenseVatTable({ companyId, rows, locked }) {
  return (
    <DataTable
      dense
      rows={rows}
      empty="No expenses this month."
      columns={[
        { key: "dateKey", label: "Date", render: (r) => formatDateKey(r.dateKey, { weekday: false }) },
        { key: "referenceNo", label: "No.", render: (r) => <span className="font-mono text-xs">{r.referenceNo}</span> },
        { key: "department", label: "Department" },
        { key: "what", label: "What", render: (r) => <span>{r.what}{r.who ? <span className="block text-xs text-slate-500">{r.who}</span> : null}</span> },
        { key: "amount", label: "Paid", align: "right", render: (r) => <Money value={r.amount} suffix={false} /> },
        { key: "tax", label: "VAT on the invoice", align: "right", render: (r) => <VatCell companyId={companyId} row={r} locked={locked} /> },
      ]}
    />
  );
}

export function VatReturnButton({ companyId, month, disabled }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    const ok = await runWithToast(recordVatReturnAction({ companyId, month }), { success: (d) => (d.entry.status === "POSTED" ? `VAT return recorded (${d.entry.number}).` : "VAT return sent to the Boss for approval.") });
    setBusy(false);
    if (ok) router.refresh();
  };
  return <SubmitButton busy={busy} disabled={disabled} onClick={run}>Record the return of the month</SubmitButton>;
}
