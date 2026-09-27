"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Money, Plates, StatementAmount, inputClass, selectClass } from "@/components/kit/primitives";
import { MoneyBars, HBars } from "@/components/charts/money-bars";
import { AiInsights } from "@/components/reports/ai-insights";
import { formatAmount, formatPct, formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const PRESETS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "month", label: "This month" },
  { id: "last-month", label: "Last month" },
  { id: "year", label: "This year" },
  { id: "custom", label: "Custom" },
];
const TABS = [
  { id: "income", label: "Income statement" },
  { id: "cash", label: "Cash movement" },
  { id: "stock", label: "Stock movement" },
  { id: "debts", label: "Debts" },
];

function csvDownload(filename, rows) {
  const csv = rows.map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(",")).join("\n");
  const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

function Row({ label, value, previous, change, strong, indent, href, sign }) {
  const v = sign === "-" ? -value : value;
  const content = <StatementAmount value={v} className={cn(strong && "font-bold")} />;
  return (
    <tr className={cn("border-b border-slate-100", strong && "border-t-2 border-slate-300 bg-slate-50")}>
      <td className={cn("py-2 pr-3 text-sm", indent ? "pl-6 text-slate-600" : "pl-3", strong && "font-bold text-slate-900")}>{label}</td>
      <td className="py-2 pr-3 text-right text-sm">{href ? <Link href={href} className="underline-offset-2 hover:underline">{content}</Link> : content}</td>
      {previous !== undefined ? <td className="py-2 pr-3 text-right text-sm text-slate-500">{previous === null ? "—" : <StatementAmount value={sign === "-" ? -previous : previous} />}</td> : null}
      {change !== undefined ? <td className={cn("py-2 pr-3 text-right text-xs", change > 0 ? "text-emerald-700" : change < 0 ? "text-rose-700" : "text-slate-400")}>{formatPct(change)}</td> : null}
    </tr>
  );
}

export function StatementsView({ organizationName, departments, scopeIds, scopeAll, range, previousLabel, todayKey, statement, tab }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [custom, setCustom] = useState({ from: range.fromKey, to: range.toKey });
  const go = (patch) => {
    const p = new URLSearchParams(search.toString());
    Object.entries(patch).forEach(([k, v]) => (v === null || v === undefined || v === "" ? p.delete(k) : p.set(k, v)));
    router.push(`${pathname}?${p}`);
  };
  const { income, cash, stock, debts, coverage } = statement;
  const cmp = income.previous;
  const single = scopeIds.length === 1 ? scopeIds[0] : null;
  const drill = (type) => (single ? `/d/${single}/history?from=${range.fromKey}&to=${range.toKey > todayKey ? todayKey : range.toKey}&type=${type}&status=VALID` : undefined);
  const scopeLabel = scopeAll ? (departments.length > 1 ? "All departments" : departments[0]?.name) : departments.filter((d) => scopeIds.includes(d.id)).map((d) => d.name).join(", ");

  const exportCsv = () => {
    const rows = [["Springer Finance", organizationName], ["Period", range.label], ["Departments", scopeLabel], []];
    if (tab === "income") {
      rows.push(["Line", "Amount (FCFA)", "Previous period", "Change %"]);
      [["Sales", "salesGross"], ["Rent income", "rentIncome"], ["Other income", "otherIncome"], ["Total money in", "moneyIn"], ["Discounts", "discounts"], ["Purchases", "purchases"], ["Expenses", "expenses"], ["Other expenses", "otherExpenses"], ["Total money out", "moneyOut"], ["Result", "result"]].forEach(([l, k]) =>
        rows.push([l, income[k], cmp?.[k] ?? "", income.change?.[k] ?? ""])
      );
    } else if (tab === "stock") {
      rows.push(["Dish", "Opening", "Added", "Sold", "Spoiled", "Corrections", "Closing", "Unit price", "Value"]);
      stock.rows.forEach((r) => rows.push([r.name, r.opening, r.added, r.sold, r.spoiled, r.corrected, r.closing, r.unitPrice, r.value]));
    } else if (tab === "cash") {
      rows.push(["Line", "Amount (FCFA)"], ["Opening cash", cash.opening], ["Cash in", cash.cashIn], ["Cash out", cash.cashOut], ["Expected", cash.expected], ["Handed to Boss", cash.handedOver], ["Closing", cash.closing]);
    } else {
      rows.push(["Line", "Amount (FCFA)"], ["Owed at start", debts.opening], ["New debts", debts.given], ["Old debts added", debts.oldAdded], ["Repaid", debts.repaid], ["Owed at end", debts.closing], [], ["Customer", "Balance"]);
      debts.topDebtors.forEach((d) => rows.push([d.name, d.balance]));
    }
    csvDownload(`statement-${tab}-${range.fromKey}-${range.toKey}.csv`, rows);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 rounded-xl border border-slate-200 bg-white p-4 shadow-xs print:hidden">
        <div className="flex flex-wrap gap-2">
          {PRESETS.map((p) => (
            <button key={p.id} type="button" onClick={() => (p.id === "custom" ? go({ period: "custom", from: custom.from, to: custom.to }) : go({ period: p.id, from: null, to: null }))} className={cn("rounded-full border px-3 py-1 text-sm", range.preset === p.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50")}>
              {p.label}
            </button>
          ))}
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {range.preset === "custom" ? (
            <>
              <Field label="From" htmlFor="st-from"><input id="st-from" type="date" className={inputClass} value={custom.from} onChange={(e) => setCustom({ ...custom, from: e.target.value })} onBlur={() => go({ period: "custom", from: custom.from, to: custom.to })} /></Field>
              <Field label="To" htmlFor="st-to"><input id="st-to" type="date" className={inputClass} value={custom.to} onChange={(e) => setCustom({ ...custom, to: e.target.value })} onBlur={() => go({ period: "custom", from: custom.from, to: custom.to })} /></Field>
            </>
          ) : null}
          {departments.length > 1 ? (
            <Field label="Departments" htmlFor="st-dept">
              <select id="st-dept" className={selectClass} value={scopeAll ? "all" : scopeIds[0]} onChange={(e) => go({ dept: e.target.value === "all" ? null : e.target.value })}>
                <option value="all">All departments</option>
                {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          ) : null}
        </div>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between print:hidden">
        <div className="inline-flex flex-wrap rounded-lg border border-slate-200 bg-white p-0.5" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} type="button" onClick={() => go({ tab: t.id })} className={cn("rounded-md px-3 py-1.5 text-sm", tab === t.id ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-50")}>
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCsv}><Download className="h-4 w-4" /> Export CSV</Button>
          <Button onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
        </div>
      </div>

      <article className="rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="statement">
        <header className="mb-4 flex flex-col gap-2 border-b-2 border-slate-900 pb-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{organizationName}</div>
            <h2 className="text-2xl font-bold">{TABS.find((t) => t.id === tab)?.label}</h2>
            <div className="text-sm text-slate-700">{range.label} · {scopeLabel}</div>
          </div>
          <div className={cn("rounded-md px-3 py-1.5 text-xs font-medium", coverage.final ? "bg-emerald-50 text-emerald-800" : "bg-amber-50 text-amber-900")}>
            {coverage.expected === 0 ? "No restaurant days in this period" : coverage.final ? (coverage.expected === 1 ? "Final: the daily report is approved" : `Final: all ${coverage.expected} daily reports approved`) : `Provisional: ${coverage.approved} of ${coverage.expected} daily report${coverage.expected === 1 ? "" : "s"} approved (${coverage.sent} sent)`}
          </div>
        </header>

        {tab === "income" ? (
          <div className="grid gap-8 xl:grid-cols-[1fr_380px]">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-300 text-xs text-slate-500">
                    <th className="py-2 pl-3 text-left font-medium">FCFA</th>
                    <th className="py-2 pr-3 text-right font-medium">This period</th>
                    {cmp ? <th className="py-2 pr-3 text-right font-medium">{previousLabel ? "Previous" : ""}</th> : null}
                    {cmp ? <th className="py-2 pr-3 text-right font-medium">Change</th> : null}
                  </tr>
                </thead>
                <tbody>
                  <tr><td colSpan={4} className="pb-1 pl-3 pt-3 text-xs font-bold uppercase tracking-wide text-emerald-700">Money in</td></tr>
                  <Row label="Sales" value={income.salesGross} previous={cmp?.salesGross} change={income.change?.salesGross} indent href={drill("SALE")} />
                  <Row label="Rent income" value={income.rentIncome} previous={cmp?.rentIncome} change={income.change?.rentIncome} indent href={drill("RENT_INCOME")} />
                  <Row label="Other income" value={income.otherIncome} previous={cmp?.otherIncome} change={income.change?.otherIncome} indent href={drill("OTHER_INCOME")} />
                  <Row label="Total money in" value={income.moneyIn} previous={cmp?.moneyIn} change={income.change?.moneyIn} strong />
                  <tr><td colSpan={4} className="pb-1 pl-3 pt-4 text-xs font-bold uppercase tracking-wide text-rose-700">Money out</td></tr>
                  <Row label="Discounts" value={income.discounts} previous={cmp?.discounts} change={income.change?.discounts} indent sign="-" />
                  <Row label="Purchases" value={income.purchases} previous={cmp?.purchases} change={income.change?.purchases} indent sign="-" href={drill("PURCHASE")} />
                  <Row label="Expenses" value={income.expenses} previous={cmp?.expenses} change={income.change?.expenses} indent sign="-" href={drill("EXPENSE")} />
                  <Row label="Other expenses" value={income.otherExpenses} previous={cmp?.otherExpenses} change={income.change?.otherExpenses} indent sign="-" href={drill("OTHER_EXPENSE")} />
                  <Row label="Total money out" value={income.moneyOut} previous={cmp?.moneyOut} change={income.change?.moneyOut} strong sign="-" />
                  <tr><td colSpan={4} className="h-3" /></tr>
                  <Row label="Result (profit / loss)" value={income.result} previous={cmp?.result} change={income.change?.result} strong />
                </tbody>
              </table>
              <div className="mt-3 grid gap-1 text-xs text-slate-500">
                <span>Result margin (result ÷ money in): <strong className="text-slate-800">{income.margin === null ? "—" : `${income.margin}%`}</strong></span>
                <span>Net sales (sales − discounts on sales): <strong className="text-slate-800">{formatMoney(income.netSales)}</strong></span>
                {previousLabel ? <span>Previous period: {previousLabel}</span> : null}
              </div>
            </div>
            <div className="space-y-6">
              <div>
                <div className="mb-2 text-sm font-semibold">Where the money went</div>
                <HBars color="#f43f5e" rows={[{ label: "Discounts", value: income.discounts }, { label: "Purchases", value: income.purchases }, { label: "Expenses", value: income.expenses }, { label: "Other expenses", value: income.otherExpenses }]} />
              </div>
              {income.expensesByCategory.length ? (
                <div>
                  <div className="mb-2 text-sm font-semibold">Expenses by category</div>
                  <HBars color="#64748b" rows={income.expensesByCategory.map((c) => ({ label: c.label, value: c.amount }))} />
                </div>
              ) : null}
            </div>
            <div className="xl:col-span-2 print:break-inside-avoid">
              <div className="mb-2 text-sm font-semibold">Day by day</div>
              <MoneyBars data={statement.series} height={280} />
            </div>
            {statement.perDepartment.length > 1 ? (
              <div className="xl:col-span-2 overflow-x-auto">
                <div className="mb-2 text-sm font-semibold">By department</div>
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-300 text-xs text-slate-500">
                      <th className="py-2 text-left font-medium">Department</th>
                      <th className="py-2 text-right font-medium">Money in</th>
                      <th className="py-2 text-right font-medium">Money out</th>
                      <th className="py-2 text-right font-medium">Result</th>
                      <th className="py-2 text-right font-medium">Handed to Boss</th>
                      <th className="py-2 text-right font-medium">Stock value</th>
                    </tr>
                  </thead>
                  <tbody>
                    {statement.perDepartment.map((d) => (
                      <tr key={d.id} className="border-b border-slate-100">
                        <td className="py-2">{d.name}</td>
                        <td className="py-2 text-right"><StatementAmount value={d.moneyIn} /></td>
                        <td className="py-2 text-right"><StatementAmount value={-d.moneyOut} /></td>
                        <td className="py-2 text-right font-semibold"><StatementAmount value={d.result} /></td>
                        <td className="py-2 text-right"><StatementAmount value={d.handedOver} /></td>
                        <td className="py-2 text-right"><StatementAmount value={d.stockValue} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        ) : null}

        {tab === "income" ? <AiInsights departmentIds={scopeIds} fromKey={range.fromKey} toKey={range.toKey} /> : null}

        {tab === "cash" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <table className="w-full">
              <tbody>
                <Row label="Opening cash (in the drawers)" value={cash.opening} />
                <Row label="Cash received" value={cash.cashIn} indent />
                <Row label="Cash paid out" value={cash.cashOut} indent sign="-" />
                <Row label="Cash expected" value={cash.expected} strong />
                <Row label="Handed to the Boss" value={cash.handedOver} indent sign="-" href={drill("CASH_HANDOVER")} />
                <Row label="Cash left in the drawers" value={cash.closing} strong />
              </tbody>
            </table>
            <div className="space-y-4 text-sm">
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 font-semibold">Handovers</div>
                <div className="flex justify-between py-1"><span>Confirmed by the Boss</span><Money value={cash.confirmed} /></div>
                <div className="flex justify-between py-1"><span>Waiting for confirmation</span><Money value={cash.pending} /></div>
                <div className="flex justify-between py-1 text-rose-700"><span>Disputed (not counted)</span><Money value={cash.disputed} /></div>
              </div>
              <div className="rounded-lg border border-slate-200 p-4">
                <div className="mb-2 font-semibold">Received by method</div>
                {[["Cash", "CASH"], ["Mobile Money", "MOMO"], ["Bank", "BANK_TRANSFER"]].map(([l, k]) => (
                  <div key={k} className="flex justify-between py-1"><span>{l}</span><Money value={cash.receivedByMethod[k]} /></div>
                ))}
                <p className="mt-2 text-xs text-slate-500">Mobile Money and bank receipts are not physical cash; they are not in the drawer.</p>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "stock" ? (
          <div className="space-y-6">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Stock value at the start</div><div className="text-lg font-semibold"><Money value={stock.totals.openingValue} /></div></div>
              <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Stock value at the end</div><div className="text-lg font-semibold"><Money value={stock.totals.value} /></div></div>
              <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Plates sold</div><div className="text-lg font-semibold"><Plates value={stock.totals.sold} /></div></div>
              <div className="rounded-lg border border-slate-200 p-3"><div className="text-xs text-slate-500">Value of plates sold</div><div className="text-lg font-semibold"><Money value={stock.totals.soldValue} /></div></div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-300 text-xs text-slate-500">
                    <th className="py-2 text-left font-medium">Dish</th>
                    <th className="py-2 text-right font-medium">Opening</th>
                    <th className="py-2 text-right font-medium">Added</th>
                    <th className="py-2 text-right font-medium">Sold</th>
                    <th className="py-2 text-right font-medium">Spoiled</th>
                    <th className="py-2 text-right font-medium">Corrections</th>
                    <th className="py-2 text-right font-semibold text-slate-700">Closing</th>
                    <th className="py-2 text-right font-medium">Unit price</th>
                    <th className="py-2 text-right font-medium">Value</th>
                  </tr>
                </thead>
                <tbody>
                  {stock.rows.map((r) => (
                    <tr key={r.dishId} className="border-b border-slate-100">
                      <td className="py-2">{r.name}{scopeIds.length > 1 ? <span className="text-xs text-slate-400"> · {departments.find((d) => d.id === r.departmentId)?.name}</span> : null}</td>
                      <td className="py-2 text-right"><Plates value={r.opening} /></td>
                      <td className="py-2 text-right"><Plates value={r.added} /></td>
                      <td className="py-2 text-right"><Plates value={r.sold} /></td>
                      <td className="py-2 text-right"><Plates value={r.spoiled} /></td>
                      <td className="py-2 text-right"><Plates value={r.corrected} /></td>
                      <td className="py-2 text-right font-semibold"><Plates value={r.closing} /></td>
                      <td className="py-2 text-right">{formatAmount(r.unitPrice)}</td>
                      <td className="py-2 text-right">{formatAmount(r.value)}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-slate-300 font-semibold">
                    <td className="py-2">Total</td>
                    <td className="py-2 text-right"><Plates value={stock.totals.opening} /></td>
                    <td className="py-2 text-right"><Plates value={stock.totals.added} /></td>
                    <td className="py-2 text-right"><Plates value={stock.totals.sold} /></td>
                    <td className="py-2 text-right"><Plates value={stock.totals.spoiled} /></td>
                    <td className="py-2 text-right"><Plates value={stock.totals.corrected} /></td>
                    <td className="py-2 text-right"><Plates value={stock.totals.closing} /></td>
                    <td />
                    <td className="py-2 text-right">{formatAmount(stock.totals.value)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>
            <div className="grid gap-6 lg:grid-cols-2">
              <div>
                <div className="mb-2 text-sm font-semibold">Best-selling dishes (value)</div>
                {stock.topDishes.length ? <HBars color="#10b981" rows={stock.topDishes.map((d) => ({ label: `${d.name} (${d.sold} plates)`, value: d.soldValue }))} /> : <p className="text-sm text-slate-500">No sales in this period.</p>}
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Dishes not sold in this period</div>
                <p className="text-sm text-slate-600">{stock.unsold.length ? stock.unsold.map((d) => d.name).join(", ") : "Every dish sold at least once."}</p>
              </div>
            </div>
          </div>
        ) : null}

        {tab === "debts" ? (
          <div className="grid gap-8 lg:grid-cols-2">
            <table className="w-full">
              <tbody>
                <Row label="Owed by customers at the start" value={debts.opening} />
                <Row label="New debts (sales on credit)" value={debts.given} indent />
                <Row label="Old debts added" value={debts.oldAdded} indent />
                <Row label="Repaid" value={debts.repaid} indent sign="-" href={drill("DEBT_PAYMENT")} />
                <Row label="Owed at the end" value={debts.closing} strong />
              </tbody>
            </table>
            <div className="space-y-6">
              <div>
                <div className="mb-2 text-sm font-semibold">How old the debts are</div>
                <HBars color="#f59e0b" rows={[{ label: "0–7 days", value: debts.ageing["0-7"] }, { label: "8–30 days", value: debts.ageing["8-30"] }, { label: "31–60 days", value: debts.ageing["31-60"] }, { label: "More than 60 days", value: debts.ageing["60+"] }]} />
              </div>
              <div>
                <div className="mb-2 text-sm font-semibold">Customers who owe the most</div>
                {debts.topDebtors.length ? debts.topDebtors.map((d) => (
                  <div key={d.name} className="flex justify-between border-b border-slate-100 py-1 text-sm"><span>{d.name}</span><Money value={d.balance} /></div>
                )) : <p className="text-sm text-slate-500">Nobody owes money.</p>}
              </div>
            </div>
          </div>
        ) : null}
        <footer suppressHydrationWarning className="mt-8 border-t border-slate-200 pt-2 text-center text-[10px] text-slate-400">Springer Finance · {organizationName} · figures in FCFA · printed {new Date().toLocaleDateString("en-GB")}</footer>
      </article>
    </div>
  );
}
