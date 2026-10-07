import { StatementAmount } from "@/components/kit/primitives";
import { BALANCE_SHEET_ASSET_LINES, BALANCE_SHEET_LIABILITY_LINES, INCOME_STATEMENT_LINES } from "@/lib/accounting/statement-math";
import { cn } from "@/lib/utils";

/** Sign shown for an income-statement line: expenses are subtracted. */
function shown(kind, v) {
  return kind === "expense" ? -v : v;
}

function Row({ code, fr, en, kind, value, previous, hasPrevious }) {
  const total = kind === "total";
  return (
    <tr className={cn("border-b border-slate-100", total && "bg-slate-50 font-semibold", code === "XI" && "bg-slate-900 text-white")}>
      <td className="w-12 px-3 py-1.5 font-mono text-xs text-slate-400">{code === "DISC" ? "" : code}</td>
      <td className="px-3 py-1.5">
        <div className={cn(total ? "" : "pl-2")}>{en}</div>
        <div className={cn("text-[11px]", code === "XI" ? "text-slate-300" : "text-slate-400")}>{fr}</div>
      </td>
      <td className="px-3 py-1.5 text-right"><StatementAmount value={value} className={code === "XI" ? "text-white" : ""} /></td>
      {hasPrevious ? <td className="px-3 py-1.5 text-right text-slate-500"><StatementAmount value={previous} className={code === "XI" ? "text-slate-300" : ""} /></td> : null}
    </tr>
  );
}

/** Compte de résultat (SYSCOHADA order): lines with a value this period or the previous. */
export function IncomeStatementTable({ lines, previous, periodLabel, previousLabel }) {
  // The trading margin only for a business that buys goods to resell.
  const trading = [lines.TA, lines.RA, lines.RB, previous?.TA, previous?.RA, previous?.RB].some(Boolean);
  const rows = INCOME_STATEMENT_LINES.filter(([code, , , kind]) => (code === "XA" ? trading : kind === "total" || lines[code] || previous?.[code]));
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid="income-statement">
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-3 py-2">Ref.</th>
            <th className="px-3 py-2">Line</th>
            <th className="px-3 py-2 text-right">{periodLabel}</th>
            {previous ? <th className="px-3 py-2 text-right">{previousLabel}</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map(([code, fr, en, kind]) => (
            <Row key={code} code={code} fr={fr} en={en} kind={kind} value={shown(kind, lines[code])} previous={previous ? shown(kind, previous[code]) : 0} hasPrevious={Boolean(previous)} />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SideTable({ title, lines, values, testId }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm" data-testid={testId}>
        <thead>
          <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
            <th className="px-3 py-2">Ref.</th>
            <th className="px-3 py-2">{title}</th>
            <th className="px-3 py-2 text-right">Net</th>
          </tr>
        </thead>
        <tbody>
          {lines.filter(([code, , , kind]) => kind !== "line" || values[code]).map(([code, fr, en, kind]) => (
            <tr key={code} className={cn("border-b border-slate-100", kind !== "line" && "bg-slate-50 font-semibold", kind === "grand" && "bg-slate-900 text-white")}>
              <td className="w-12 px-3 py-1.5 font-mono text-xs text-slate-400">{code}</td>
              <td className="px-3 py-1.5">
                <div className={kind === "line" ? "pl-2" : ""}>{en}</div>
                <div className={cn("text-[11px]", kind === "grand" ? "text-slate-300" : "text-slate-400")}>{fr}</div>
              </td>
              <td className="px-3 py-1.5 text-right"><StatementAmount value={values[code]} className={kind === "grand" ? "text-white" : ""} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Bilan: assets beside equity and liabilities. */
export function BalanceSheetTables({ sheet }) {
  return (
    <div className="grid gap-6 xl:grid-cols-2">
      <SideTable title="Assets (Actif)" lines={BALANCE_SHEET_ASSET_LINES} values={sheet.assets} testId="balance-assets" />
      <SideTable title="Equity and liabilities (Passif)" lines={BALANCE_SHEET_LIABILITY_LINES} values={sheet.liabilities} testId="balance-liabilities" />
    </div>
  );
}

export const CASH_FLOW_LINES = [
  ["ZA", "Trésorerie nette au début de la période", "Net treasury at the start", "total"],
  ["ZB", "Flux de trésorerie provenant des activités opérationnelles", "From operations (sales, rent, events, expenses, salaries, taxes)", "line"],
  ["ZC", "Flux de trésorerie provenant des activités d'investissement", "From investments (equipment bought or sold)", "line"],
  ["ZD", "Flux de trésorerie provenant des capitaux propres", "From the owners (capital, dividends)", "line"],
  ["ZE", "Flux de trésorerie provenant des capitaux étrangers", "From lenders and deposits received (loans, cautions)", "line"],
  ["ZF", "Flux de trésorerie provenant des activités de financement", "From financing (ZD + ZE)", "total"],
  ["ZG", "Variation de la trésorerie nette de la période", "Change in net treasury", "total"],
  ["ZH", "Trésorerie nette à la fin de la période", "Net treasury at the end", "grand"],
];

/** Tableau des flux de trésorerie (direct method). */
export function CashFlowTable({ flow }) {
  return (
    <div className="space-y-3">
      <SideTable title="Cash flows" lines={CASH_FLOW_LINES} values={flow} testId="cash-flow" />
      <div className="grid gap-2 text-xs text-slate-500 sm:grid-cols-2">
        <span>Received from operations: <StatementAmount value={flow.detail.operatingIn} /> · paid: <StatementAmount value={flow.detail.operatingOut} /></span>
        <span>Equipment bought: <StatementAmount value={flow.detail.investingOut} /> · sold: <StatementAmount value={flow.detail.investingIn} /></span>
      </div>
      {!flow.checks ? <p className="text-sm text-rose-700">The flows do not add up to the closing treasury: an entry moves treasury without a counterpart.</p> : null}
    </div>
  );
}

/** Rows for the Excel / CSV export of a statement. */
export function statementSheet(name, lines, values, previous = null) {
  return {
    name,
    columns: [
      { label: "Ref.", value: "code" },
      { label: "Line (SYSCOHADA)", value: "fr" },
      { label: "Line", value: "en" },
      { label: "Amount", value: "value" },
      ...(previous ? [{ label: "Previous", value: "previous" }] : []),
    ],
    rows: lines.map(([code, fr, en, kind]) => ({ code, fr, en, value: shown(kind, values[code] || 0), previous: previous ? shown(kind, previous[code] || 0) : null })),
  };
}
