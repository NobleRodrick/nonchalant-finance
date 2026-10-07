import Link from "next/link";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { trialBalance, fiscalYearStart } from "@/lib/accounting/balances";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { DataTable, Section, StatementAmount } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { ExportMenu } from "@/components/kit/export-menu";
import { FilterBar } from "@/components/kit/filter-bar";

export const dynamic = "force-dynamic";
export const metadata = { title: "Trial balance" };

const side = (v, s) => (s === "D" ? (v > 0 ? v : 0) : v < 0 ? -v : 0);

/** Balance générale: every account's opening, movements and closing balance of the period. */
export default async function TrialBalancePage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, todayKey } = await accountingPage(companyId);
  const range = resolvePeriod(sp, todayKey, "year");
  if (range.preset === "year") range.fromKey = fiscalYearStart(todayKey, company.fiscalYearStartMonth);
  const departments = await db.department.findMany({ where: { companyId }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const dept = departments.some((d) => d.id === sp?.dept) ? sp.dept : null;
  const classFilter = /^[1-8]$/.test(sp?.class || "") ? sp.class : null;
  const tb = await trialBalance({ company, fromKey: range.fromKey, toKey: range.toKey, departmentIds: dept ? [dept] : null });
  const rows = tb.rows.filter((r) => !classFilter || r.number.startsWith(classFilter));
  const sum = (k, s) => rows.reduce((a, r) => a + side(r[k], s), 0);
  const ledger = (n) => `/accounting/${companyId}/ledger?account=${n}&period=custom&from=${range.fromKey}&to=${range.toKey}`;
  const sheet = {
    name: "Balance générale",
    columns: [
      { label: "Account", value: "number" }, { label: "Name", value: "name" }, { label: "Label", value: "label" },
      { label: "Opening debit", value: "od" }, { label: "Opening credit", value: "oc" }, { label: "Debit", value: "debit" }, { label: "Credit", value: "credit" }, { label: "Closing debit", value: "cd" }, { label: "Closing credit", value: "cc" },
    ],
    rows: rows.map((r) => ({ ...r, od: side(r.opening, "D"), oc: side(r.opening, "C"), cd: side(r.closing, "D"), cc: side(r.closing, "C") })),
  };
  return (
    <div className="space-y-4">
      <PeriodPicker range={range} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar fields={[
          { name: "class", label: "Class", type: "select", options: [{ value: "", label: "All classes" }, ...["1 Equity, loans", "2 Fixed assets", "3 Stocks", "4 Third parties", "5 Treasury", "6 Expenses", "7 Income", "8 Other (HAO)"].map((l) => ({ value: l[0], label: l }))] },
          ...(departments.length > 1 ? [{ name: "dept", label: "Department", type: "select", options: [{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))] }] : []),
        ]} />
        <ExportMenu fileName={`${company.name}-trial-balance-${range.fromKey}-${range.toKey}`} sheets={[sheet]} />
      </div>
      <Section title={`Trial balance · ${periodLabel(range)}`} description="Income and expense accounts open at the start of the fiscal year; the others carry everything before." bodyClassName="p-0">
        <DataTable
          dense
          stickyHeader
          rows={rows}
          empty="No entries in this period."
          columns={[
            { key: "number", label: "Account", render: (r) => <Link className="font-mono text-xs underline" href={ledger(r.number)}>{r.number}</Link> },
            { key: "label", label: "Name", render: (r) => <span><span>{r.label}</span><span className="block text-[11px] text-slate-400">{r.name}</span></span> },
            { key: "od", label: "Opening debit", align: "right", render: (r) => <StatementAmount value={side(r.opening, "D")} /> },
            { key: "oc", label: "Opening credit", align: "right", render: (r) => <StatementAmount value={side(r.opening, "C")} /> },
            { key: "debit", label: "Debit", align: "right", render: (r) => <StatementAmount value={r.debit} /> },
            { key: "credit", label: "Credit", align: "right", render: (r) => <StatementAmount value={r.credit} /> },
            { key: "cd", label: "Closing debit", align: "right", render: (r) => <StatementAmount value={side(r.closing, "D")} /> },
            { key: "cc", label: "Closing credit", align: "right", render: (r) => <StatementAmount value={side(r.closing, "C")} /> },
          ]}
          footer={
            <tr data-testid="trial-totals">
              <td className="px-3 py-2" colSpan={2}>Totals{tb.priorResult && !classFilter ? " (earlier years' result not yet allocated: " : ""}{tb.priorResult && !classFilter ? <StatementAmount value={tb.priorResult} /> : null}{tb.priorResult && !classFilter ? ")" : ""}</td>
              <td className="px-3 py-2 text-right"><StatementAmount value={sum("opening", "D")} /></td>
              <td className="px-3 py-2 text-right"><StatementAmount value={sum("opening", "C")} /></td>
              <td className="px-3 py-2 text-right"><StatementAmount value={rows.reduce((a, r) => a + r.debit, 0)} /></td>
              <td className="px-3 py-2 text-right"><StatementAmount value={rows.reduce((a, r) => a + r.credit, 0)} /></td>
              <td className="px-3 py-2 text-right"><StatementAmount value={sum("closing", "D")} /></td>
              <td className="px-3 py-2 text-right"><StatementAmount value={sum("closing", "C")} /></td>
            </tr>
          }
        />
      </Section>
    </div>
  );
}
