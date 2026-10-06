"use client";

import Link from "next/link";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Money, Pill } from "@/components/kit/primitives";
import { VoidButton } from "@/components/kit/void-button";
import { METHOD_NAMES } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { voidSpec } from "@/lib/offline/specs";
import { chargeVoidSpec } from "@/lib/property/specs";

const STATUS = { PAID: ["Paid", "emerald"], PARTLY: ["Partly paid", "amber"], UNPAID: ["Unpaid", "slate"] };

/** Months of rent and charges with what was paid (by allocation or advance) and what is owed. */
export function AccountItems({ items }) {
  return (
    <DataTable
      dense
      rowKey={(i) => (i.chargeId ? i.chargeId : i.monthKey)}
      rows={items}
      empty="Nothing billed yet."
      rowClassName={(i) => (!i.due ? "text-slate-500" : i.overdue ? "bg-rose-50/40" : "")}
      columns={[
        { key: "label", label: "Month / charge", render: (i) => <span>{i.label}{i.referenceNo ? <span className="ml-1 text-xs text-slate-400">{i.referenceNo}</span> : null}</span> },
        { key: "due", label: "Due", render: (i) => <span className="whitespace-nowrap">{i.dueKey}{!i.due ? <span className="ml-1 text-xs">(upcoming)</span> : i.overdue ? <span className="ml-1 text-xs font-medium text-rose-700">{i.daysOverdue} days late</span> : null}</span> },
        { key: "amount", label: "Amount", align: "right", render: (i) => <Money value={i.amount} suffix={false} /> },
        { key: "paid", label: "Paid", align: "right", render: (i) => <Money value={i.paid + i.byCredit} suffix={false} /> },
        { key: "balance", label: "Balance", align: "right", render: (i) => <Money value={i.balance} className={i.balance && i.due ? "font-semibold text-rose-700" : undefined} suffix={false} /> },
        { key: "status", label: "", render: (i) => <Pill tone={STATUS[i.status][1]}>{STATUS[i.status][0]}</Pill> },
      ]}
    />
  );
}

/** Payments, deposits and refunds of the contract: what each covered, receipt, void. */
export function ContractPayments({ departmentId, leaseId, payments, canVoid }) {
  const record = useRecorder();
  const base = `/d/${departmentId}/contracts/${leaseId}/documents`;
  return (
    <DataTable
      dense
      rows={payments}
      empty="No money received yet."
      rowClassName={(p) => (p.status === "VOIDED" ? "opacity-50 line-through" : "")}
      columns={[
        { key: "date", label: "Date", render: (p) => p.dateKey },
        { key: "ref", label: "No.", render: (p) => p.referenceNo },
        { key: "what", label: "What", render: (p) => <span>{p.what}{p.covered.length ? <span className="block text-xs text-slate-500">{p.covered.map((c) => `${c.label}: ${c.amount}`).join(" · ")}</span> : p.category === "lease-payment" ? <span className="block text-xs text-slate-500">advance</span> : null}</span> },
        { key: "method", label: "Method", render: (p) => `${METHOD_NAMES[p.paymentMethod] || p.paymentMethod}${p.reference ? ` · ${p.reference}` : ""}` },
        { key: "by", label: "Received by", render: (p) => p.receivedByName || p.user?.name },
        { key: "amount", label: "Amount", align: "right", render: (p) => <Money value={["BOOKING_REFUND"].includes(p.type) ? -p.amount : p.amount} signed={p.type === "BOOKING_REFUND"} suffix={false} /> },
        {
          key: "act",
          label: "",
          render: (p) => (
            <span className="flex items-center justify-end gap-1 print:hidden">
              {p.status !== "VOIDED" && ["lease-payment", "lease-deposit"].includes(p.category) ? <Link href={`${base}/receipt?t=${p.id}`} target="_blank"><Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5" /> Receipt</Button></Link> : null}
              {p.status !== "VOIDED" && canVoid ? <VoidButton reference={p.referenceNo} onVoid={(reason) => record(voidSpec({ departmentId, row: { ...p, categoryId: p.category, methodCode: p.paymentMethod }, type: p.type, reason }), { success: `${p.referenceNo} voided.` })} /> : null}
              {p.status === "VOIDED" ? <span className="text-[11px]">{p.voidReason}</span> : null}
            </span>
          ),
        },
      ]}
    />
  );
}

/** Charges billed to the contract (utilities with their readings, damages, other), void. */
export function ContractCharges({ departmentId, charges, canVoid }) {
  const record = useRecorder();
  return (
    <DataTable
      dense
      rows={charges}
      empty="No utility or other charge billed."
      rowClassName={(c) => (c.voidedAt ? "opacity-50 line-through" : "")}
      columns={[
        { key: "ref", label: "No.", render: (c) => c.referenceNo },
        { key: "label", label: "Charge", render: (c) => <span>{c.label}{c.units !== null && c.units !== undefined ? <span className="block text-xs text-slate-500">{c.previousReading} → {c.currentReading} = {c.units} × {c.rate}</span> : null}</span> },
        { key: "month", label: "Month", render: (c) => c.monthKey },
        { key: "due", label: "Due", render: (c) => c.dueKey },
        { key: "amount", label: "Amount", align: "right", render: (c) => <Money value={c.amount} suffix={false} /> },
        { key: "act", label: "", render: (c) => (c.voidedAt ? <span className="text-[11px]">{c.voidReason}</span> : canVoid ? <VoidButton reference={c.referenceNo} what="charge" onVoid={(reason) => record(chargeVoidSpec(departmentId, c, reason), { success: `${c.referenceNo} voided.` })} /> : null) },
      ]}
    />
  );
}
