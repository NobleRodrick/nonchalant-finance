"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Loader2, Paperclip, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Field, KeyValues, Money, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { countOf, formatMoney } from "@/lib/format";
import { getRecordDetail } from "@/actions/history";
import { cn } from "@/lib/utils";

const METHOD = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank", CREDIT: "On credit" };
const ACTION_LABELS = {
  SALE_RECORDED: "Sale recorded", RECORD_VOIDED: "Voided", PURCHASE_RECORDED: "Purchase recorded", DEBT_REPAID: "Repayment added to the debt",
  CASH_HANDED_OVER: "Cash handed over", HANDOVER_CONFIRMED: "Confirmed by the Boss", HANDOVER_DISPUTED: "Disputed by the Boss", STOCK_ADDED: "Stock added",
  STOCK_CORRECTED: "Count corrected", OPENING_STOCK_SET: "Opening stock set", STOCK_RECORD_VOIDED: "Voided", DEBT_CANCELLED: "Debt cancelled",
};

function Detail({ target, onClose }) {
  const [data, setData] = useState(null);
  useEffect(() => {
    let alive = true;
    if (target) getRecordDetail(target).then((res) => alive && setData(res?.success ? res.data : { error: res?.error || "Could not load." }));
    return () => {
      alive = false;
    };
  }, [target]);
  if (!target) return null;
  const r = data?.record;
  return (
    <Dialog open={Boolean(target)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{r?.referenceNo || "Record"}</DialogTitle>
          <DialogDescription>{data?.kind === "stock" ? "Stock record" : r?.type?.replace(/_/g, " ").toLowerCase()}</DialogDescription>
        </DialogHeader>
        {!data ? (
          <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-slate-400" /></div>
        ) : data.error ? (
          <p className="text-sm text-rose-700">{data.error}</p>
        ) : data.kind === "stock" ? (
          <div className="space-y-4">
            <KeyValues
              rows={[
                { label: "Dish", value: r.menuItem?.name },
                { label: "Plates", value: String(Number(r.quantity)) },
                { label: "Plates after", value: String(Number(r.balanceAfter ?? 0)) },
                { label: "Reason", value: r.reason || r.notes || "—" },
                { label: "Recorded by", value: r.user?.name },
                { label: "When", value: new Date(r.date).toLocaleString("en-GB", { timeZone: "Africa/Douala" }) },
                r.purchase ? { label: "Purchase", value: r.purchase.transaction?.referenceNo } : null,
                r.voidedAt ? { label: "Status", value: <StatusBadge status="VOIDED" /> } : null,
              ]}
            />
            <AuditTrail audit={data.audit} />
          </div>
        ) : (
          <div className="space-y-4">
            <KeyValues
              rows={[
                { label: "Amount", value: <Money value={r.amount} />, strong: true },
                r.grossAmount && Number(r.discountAmount) ? { label: "Before discount", value: <Money value={r.grossAmount} /> } : null,
                Number(r.discountAmount) ? { label: "Discount", value: <Money value={r.discountAmount} /> } : null,
                { label: "Paid by", value: METHOD[r.paymentMethod] || r.paymentMethod },
                { label: "Description", value: r.description || "—" },
                r.counterparty ? { label: "With", value: r.counterparty } : null,
                r.customerName ? { label: "Customer", value: r.customerName } : null,
                r.reference ? { label: "External reference", value: r.reference } : null,
                { label: "Recorded by", value: r.user?.name },
                { label: "When", value: new Date(r.date).toLocaleString("en-GB", { timeZone: "Africa/Douala" }) },
                { label: "Status", value: r.status === "VOIDED" ? <span><StatusBadge status="VOIDED" /> {r.voidReason} {r.voidedByName ? `(by ${r.voidedByName})` : ""}</span> : "Valid" },
              ]}
            />
            {r.saleLines?.length ? (
              <div>
                <div className="mb-1 text-sm font-semibold">Dishes</div>
                {r.saleLines.map((l) => (
                  <div key={l.id} className="flex justify-between border-b border-slate-100 py-1 text-sm">
                    <span>{Number(l.quantity)} × {l.menuItem?.name} @ {formatMoney(l.unitPrice)}</span>
                    <Money value={l.totalAmount} />
                  </div>
                ))}
              </div>
            ) : null}
            {r.debt ? (
              <div className="rounded-lg bg-amber-50 p-3 text-sm">
                Debt <strong>{r.debt.referenceNo}</strong> for {r.debt.debtorName}: owed {formatMoney(r.debt.amountOwed)}, paid {formatMoney(r.debt.amountPaid)} ({r.debt.status.toLowerCase().replace("_", " ")}).
                {r.debt.payments.length ? <div className="mt-1 text-xs">Repayments: {r.debt.payments.map((p) => `${p.transaction?.referenceNo} ${formatMoney(p.amount)}`).join(", ")}</div> : null}
              </div>
            ) : null}
            {r.debtPayment ? <div className="rounded-lg bg-emerald-50 p-3 text-sm">Repayment of debt <strong>{r.debtPayment.debt?.referenceNo}</strong> by {r.debtPayment.debt?.debtorName}.</div> : null}
            {r.purchase ? (
              <div className="rounded-lg bg-slate-50 p-3 text-sm">
                <div className="font-semibold">Purchase{r.purchase.supplierName ? ` from ${r.purchase.supplierName}` : ""}</div>
                {r.purchase.lines.map((l) => <div key={l.id} className="flex justify-between"><span>{l.description}</span><Money value={l.totalCost} /></div>)}
                {r.purchase.stockAdds.length ? <div className="mt-1 text-xs">Plates added: {r.purchase.stockAdds.map((m) => `${Number(m.quantity)} × ${m.menuItem?.name} (${m.referenceNo})`).join(", ")}</div> : null}
              </div>
            ) : null}
            {data.attachments?.length ? (
              <div className="flex flex-wrap gap-2">
                {data.attachments.map((a) => (
                  <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs hover:bg-slate-50">
                    <Paperclip className="h-3.5 w-3.5" /> {a.fileName}
                  </a>
                ))}
              </div>
            ) : null}
            <AuditTrail audit={data.audit} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function AuditTrail({ audit }) {
  if (!audit?.length) return null;
  return (
    <div>
      <div className="mb-1 text-sm font-semibold">Trail</div>
      <ol className="space-y-1 border-l-2 border-slate-200 pl-3 text-xs text-slate-600">
        {audit.map((a) => (
          <li key={a.id}>
            <span className="font-medium text-slate-800">{ACTION_LABELS[a.action] || a.action.replace(/_/g, " ").toLowerCase()}</span> · {a.userName || ""} · {new Date(a.createdAt).toLocaleString("en-GB", { timeZone: "Africa/Douala" })}
          </li>
        ))}
      </ol>
    </div>
  );
}

export function HistoryBoard({ departmentId, filters, rangeLabel, types, people, todayKey, rows, totals }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState(filters);
  const [target, setTarget] = useState(null);
  const apply = (next = f) => {
    const p = new URLSearchParams(Object.entries(next).filter(([, v]) => v && v !== "ALL"));
    router.push(`${pathname}?${p}`);
  };
  return (
    <div className="space-y-4">
      <form
        className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-6"
        onSubmit={(e) => {
          e.preventDefault();
          apply();
        }}
      >
        <Field label="From" htmlFor="h-from"><input id="h-from" type="date" max={todayKey} className={inputClass} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" htmlFor="h-to"><input id="h-to" type="date" max={todayKey} className={inputClass} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Type" htmlFor="h-type">
          <select id="h-type" className={selectClass} value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })}>
            {types.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor="h-status">
          <select id="h-status" className={selectClass} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="ALL">All</option>
            <option value="VALID">Valid only</option>
            <option value="VOIDED">Voided only</option>
          </select>
        </Field>
        {people.length ? (
          <Field label="Recorded by" htmlFor="h-user">
            <select id="h-user" className={selectClass} value={f.user} onChange={(e) => setF({ ...f, user: e.target.value })}>
              <option value="">Everyone</option>
              {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Search" htmlFor="h-q">
          <div className="flex gap-2">
            <input id="h-q" className={inputClass} placeholder="Ref, customer…" value={f.q} onChange={(e) => setF({ ...f, q: e.target.value })} />
            <Button type="submit" size="icon" aria-label="Search"><Search className="h-4 w-4" /></Button>
          </div>
        </Field>
      </form>
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm text-slate-600">
        <span>{rangeLabel} · {countOf(totals.count, "record")}</span>
        <span>
          In <Money value={totals.moneyIn} tone="in" /> · Out <Money value={totals.moneyOut} tone="out" /> · To Boss <Money value={totals.transfers} />
        </span>
      </div>
      {rows.length === 0 ? (
        <EmptyState title="Nothing found" description="Change the dates or the filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Ref</th>
                <th className="px-3 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Type</th>
                <th className="px-3 py-2 font-medium">Details</th>
                <th className="px-3 py-2 font-medium">By</th>
                <th className="px-3 py-2 text-right font-medium">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.kind}-${r.id}`} className={cn("cursor-pointer border-b border-slate-100 last:border-0 hover:bg-slate-50", r.voided && "text-slate-400")} onClick={() => setTarget({ kind: r.kind, id: r.id })}>
                  <td className="px-4 py-2 font-medium">{r.referenceNo || "—"}</td>
                  <td className="whitespace-nowrap px-3 py-2">{r.dateKey} {r.time}</td>
                  <td className="px-3 py-2">
                    <span className={cn("rounded-md px-1.5 py-0.5 text-xs font-medium", r.direction === "in" ? "bg-emerald-50 text-emerald-800" : r.direction === "out" ? "bg-rose-50 text-rose-800" : r.direction === "stock" ? "bg-sky-50 text-sky-800" : "bg-slate-100 text-slate-700")}>
                      {r.typeLabel}
                    </span>
                    {r.voided ? <StatusBadge status="VOIDED" className="ml-1" /> : null}
                  </td>
                  <td className={cn("px-3 py-2", r.voided && "line-through")}>{r.description}{r.method ? <span className="text-xs text-slate-500"> · {r.method}</span> : null}</td>
                  <td className="px-3 py-2 text-xs">{r.by}</td>
                  <td className="px-3 py-2 text-right">{r.amount === null ? "" : <Money value={r.amount} tone={r.voided ? "none" : r.direction === "in" ? "in" : r.direction === "out" ? "out" : "none"} />}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {target ? <Detail key={`${target.kind}-${target.id}`} target={target} onClose={() => setTarget(null)} /> : null}
    </div>
  );
}
