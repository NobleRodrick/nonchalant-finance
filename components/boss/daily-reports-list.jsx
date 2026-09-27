"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Download, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, Money, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";

export function DailyReportsList({ departments, filters, todayKey, rows }) {
  const router = useRouter();
  const pathname = usePathname();
  const [f, setF] = useState(filters);
  const apply = (e) => {
    e?.preventDefault();
    router.push(`${pathname}?${new URLSearchParams(Object.entries(f).filter(([, v]) => v))}`);
  };
  const exportCsv = () => {
    const head = ["Date", "Department", "Ref", "Status", "Version", "Sent by", "Money in", "Money out", "Result", "Cash expected", "Handed over", "Variance", "Stock value", "Debts owed"];
    const lines = rows.map((r) => [r.dateKey, r.department, r.referenceNo, r.status, r.version, r.submittedBy, r.totals.moneyIn, r.totals.moneyOut, r.totals.result, r.totals.cashExpected, r.totals.handedOver, r.totals.variance, r.totals.stockValue, r.totals.debtsClosing]);
    const csv = [head, ...lines].map((l) => l.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([`﻿${csv}`], { type: "text/csv" }));
    a.download = `daily-reports-${filters.from}-${filters.to}.csv`;
    a.click();
  };
  const sum = (k) => rows.filter((r) => r.status !== "DRAFT").reduce((s, r) => s + (Number(r.totals?.[k]) || 0), 0);
  return (
    <div className="space-y-4">
      <form onSubmit={apply} className="grid gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs sm:grid-cols-2 lg:grid-cols-5">
        <Field label="From" htmlFor="r-from"><input id="r-from" type="date" max={todayKey} className={inputClass} value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></Field>
        <Field label="To" htmlFor="r-to"><input id="r-to" type="date" max={todayKey} className={inputClass} value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} /></Field>
        <Field label="Department" htmlFor="r-dept">
          <select id="r-dept" className={selectClass} value={f.dept} onChange={(e) => setF({ ...f, dept: e.target.value })}>
            <option value="">All departments</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Status" htmlFor="r-status">
          <select id="r-status" className={selectClass} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="">All</option>
            <option value="SUBMITTED">Waiting for you</option>
            <option value="APPROVED">Approved</option>
            <option value="RETURNED">Returned</option>
            <option value="DRAFT">Not sent</option>
          </select>
        </Field>
        <div className="flex items-end gap-2">
          <Button type="submit"><Search className="h-4 w-4" /> Show</Button>
          <Button type="button" variant="outline" onClick={exportCsv} disabled={!rows.length}><Download className="h-4 w-4" /> CSV</Button>
        </div>
      </form>
      {rows.length === 0 ? (
        <EmptyState title="No reports" description="No report matches these dates and filters." />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-xs">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-medium">Date</th>
                <th className="px-3 py-2 font-medium">Department</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Sent by</th>
                <th className="px-3 py-2 text-right font-medium">Money in</th>
                <th className="px-3 py-2 text-right font-medium">Money out</th>
                <th className="px-3 py-2 text-right font-medium">Result</th>
                <th className="px-3 py-2 text-right font-medium">Handed over</th>
                <th className="px-3 py-2 text-right font-medium">Variance</th>
                <th className="px-3 py-2" />
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-b border-slate-100 last:border-0 hover:bg-slate-50">
                  <td className="whitespace-nowrap px-4 py-2 font-medium">{r.dateLabel}</td>
                  <td className="px-3 py-2">{r.department}</td>
                  <td className="px-3 py-2"><StatusBadge status={r.status} />{r.version > 1 ? <span className="ml-1 text-xs text-slate-500">v{r.version}</span> : null}</td>
                  <td className="px-3 py-2 text-xs">{r.submittedBy || "—"}</td>
                  <td className="px-3 py-2 text-right"><Money value={r.totals.moneyIn} suffix={false} /></td>
                  <td className="px-3 py-2 text-right"><Money value={r.totals.moneyOut} suffix={false} /></td>
                  <td className="px-3 py-2 text-right font-semibold"><Money value={r.totals.result} suffix={false} /></td>
                  <td className="px-3 py-2 text-right"><Money value={r.totals.handedOver} suffix={false} /></td>
                  <td className="px-3 py-2 text-right">{r.totals.variance === null || r.totals.variance === undefined ? "—" : <Money value={r.totals.variance} suffix={false} className={r.totals.variance ? "font-semibold text-rose-700" : "text-emerald-700"} />}</td>
                  <td className="px-3 py-2 text-right"><Link className="text-sm font-medium underline" href={`/boss/daily-reports/${r.id}`}>Open</Link></td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="border-t-2 border-slate-300 bg-slate-50 font-semibold">
                <td className="px-4 py-2" colSpan={4}>Total of sent reports</td>
                <td className="px-3 py-2 text-right"><Money value={sum("moneyIn")} suffix={false} /></td>
                <td className="px-3 py-2 text-right"><Money value={sum("moneyOut")} suffix={false} /></td>
                <td className="px-3 py-2 text-right"><Money value={sum("result")} suffix={false} /></td>
                <td className="px-3 py-2 text-right"><Money value={sum("handedOver")} suffix={false} /></td>
                <td className="px-3 py-2 text-right"><Money value={sum("variance")} suffix={false} /></td>
                <td />
              </tr>
            </tfoot>
          </table>
        </div>
      )}
    </div>
  );
}
