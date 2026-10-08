import Link from "next/link";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { reportDepartments } from "@/lib/accounting/access";
import { balanceSheetAt, cashFlowFor, incomeStatementFor } from "@/lib/accounting/reports";
import { fiscalYearStart } from "@/lib/accounting/balances";
import { BALANCE_SHEET_ASSET_LINES, BALANCE_SHEET_LIABILITY_LINES, INCOME_STATEMENT_LINES } from "@/lib/accounting/statement-math";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { formatDateKey } from "@/lib/timezone";
import { Section } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { ExportMenu } from "@/components/kit/export-menu";
import { FilterBar } from "@/components/kit/filter-bar";
import { BalanceSheetTables, CASH_FLOW_LINES, CashFlowTable, IncomeStatementTable, statementSheet } from "@/components/accounting/statement-tables";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Financial statements" };

const TABS = [
  ["income", "Income statement"],
  ["balance", "Balance sheet"],
  ["cash", "Cash-flow statement"],
];

/**
 * The SYSCOHADA statements of any period: compte de résultat (with the same period a year before,
 * one department or all), bilan at the end of the period, tableau des flux de trésorerie.
 */
export default async function StatementsPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, access, todayKey } = await accountingPage(companyId);
  // A head limited to his departments: their income statement (the balance sheet and the cash flow are the company's).
  const tabs = access.scoped ? TABS.slice(0, 1) : TABS;
  const range = resolvePeriod(sp, todayKey, "year");
  if (range.preset === "year") range.fromKey = fiscalYearStart(todayKey, company.fiscalYearStartMonth);
  // The balance sheet is at a date that has come.
  if (sp?.tab === "balance" && range.toKey > todayKey) range.toKey = todayKey;
  const tab = tabs.some(([k]) => k === sp?.tab) ? sp.tab : "income";
  const departments = await db.department.findMany({ where: { companyId, ...(access.scoped ? { id: { in: access.departmentIds } } : {}) }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const dept = departments.some((d) => d.id === sp?.dept) ? sp.dept : null;
  const label = periodLabel(range);
  const href = (k) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp || {}).filter(([, v]) => typeof v === "string")), tab: k })}`;

  let body = null;
  let sheets = [];
  if (tab === "income") {
    const is = await incomeStatementFor({ company, fromKey: range.fromKey, toKey: range.toKey, departmentIds: reportDepartments(access, dept), compare: true });
    const prevLabel = `${formatDateKey(`${Number(range.fromKey.slice(0, 4)) - 1}${range.fromKey.slice(4)}`, { weekday: false })} – ${formatDateKey(`${Number(range.toKey.slice(0, 4)) - 1}${range.toKey.slice(4)}`.replace(/-02-29$/, "-02-28"), { weekday: false })}`;
    body = <IncomeStatementTable lines={is.lines} previous={is.previous} periodLabel={label} previousLabel={prevLabel} />;
    sheets = [statementSheet("Compte de résultat", INCOME_STATEMENT_LINES, is.lines, is.previous)];
  } else if (tab === "balance") {
    const bs = await balanceSheetAt({ company, toKey: range.toKey });
    body = (
      <>
        <BalanceSheetTables sheet={bs} />
        <p className="mt-3 text-xs text-slate-500">
          At the end of {formatDateKey(range.toKey, { weekday: false })}. The year's result (since {formatDateKey(bs.yearStart, { weekday: false })}) is shown in CJ; results of earlier years not yet allocated in CH.
          {bs.balanced ? " Assets = equity and liabilities." : " The two sides differ: contact support."}
        </p>
      </>
    );
    sheets = [statementSheet("Bilan actif", BALANCE_SHEET_ASSET_LINES, bs.assets), statementSheet("Bilan passif", BALANCE_SHEET_LIABILITY_LINES, bs.liabilities)];
  } else {
    const cf = await cashFlowFor({ company, fromKey: range.fromKey, toKey: range.toKey });
    body = <CashFlowTable flow={cf} />;
    sheets = [statementSheet("Flux de trésorerie", CASH_FLOW_LINES, cf)];
  }

  return (
    <div className="space-y-4">
      <PeriodPicker range={range} />
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <div className="flex gap-1" role="tablist">
          {tabs.map(([k, l]) => (
            <Link key={k} role="tab" aria-selected={tab === k} href={href(k)} className={cn("rounded-md px-3 py-1.5 text-sm", tab === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50")}>{l}</Link>
          ))}
        </div>
        <div className="flex items-center gap-2">
          {tab === "income" && departments.length > 1 ? (
            <FilterBar fields={[{ name: "dept", label: "Department", type: "select", value: dept || "", options: [{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))] }]} />
          ) : null}
          <ExportMenu fileName={`${company.name}-${tab}-${range.fromKey}-${range.toKey}`} sheets={sheets} />
        </div>
      </div>
      <Section title={`${TABS.find(([k]) => k === tab)[1]} · ${company.legalName || company.name}`} description={tab === "balance" ? `At ${formatDateKey(range.toKey, { weekday: false })}` : label}>
        {body}
      </Section>
    </div>
  );
}
