import { formatMoney } from "@/lib/format";
import { DataTable, Money, Section } from "@/components/kit/primitives";
import { cn } from "@/lib/utils";

/**
 * The income statement of a department for the period (lib/finance/statements: the same figures
 * as the company statements and, in Full accounting, the ledger): income, costs, profit, with the
 * previous period of the same length.
 */
export function IncomeStatement({ income: i, previousLabel }) {
  const p = i.previous || null;
  const rows = [
    ["Sales", "salesGross"],
    ["Discounts given", "discounts", true],
    ["Services (tickets collected)", "servicesRevenue"],
    ["Kept on cancelled tickets", "cancellationIncome"],
    ["Other income", "otherIncome"],
    ["Total income", "moneyIn", false, true],
    ["Goods bought", "purchases", true],
    ["Change in stock (negative when the stock grew)", "stockChange"],
    ["Expenses", "expenses", true],
    ["Other expenses", "otherExpenses", true],
    ["Crates broken / assets lost", "assetLosses", true],
    ["Debts written off", "badDebts", true],
    ["Total costs", "moneyOut", true, true],
  ].filter(([, k, , total]) => total || i[k] || p?.[k]);
  return (
    <Section title="Income statement" description="Cost of goods sold = goods bought + the change in stock. Deposits and supplier payments are not costs.">
      <table className="w-full text-sm">
        <thead><tr className="text-xs text-slate-500"><th className="py-1 text-left font-medium" /><th className="py-1 text-right font-medium">This period</th>{p ? <th className="py-1 text-right font-medium">{previousLabel || "Previous"}</th> : null}</tr></thead>
        <tbody>
          {rows.map(([label, k, , total]) => (
            <tr key={k} className={cn("border-t border-slate-100", total && "font-semibold")}>
              <td className="py-1.5">{label}</td>
              <td className="py-1.5 text-right tabular-nums">{k === "discounts" && i[k] ? "−" : ""}{formatMoney(i[k] || 0)}</td>
              {p ? <td className="py-1.5 text-right tabular-nums text-slate-500">{formatMoney(p[k] || 0)}</td> : null}
            </tr>
          ))}
          <tr className="border-t-2 border-slate-900 text-base font-bold">
            <td className="py-2">Profit</td>
            <td className={cn("py-2 text-right tabular-nums", i.result < 0 && "text-rose-700")}>{formatMoney(i.result)}{i.margin !== null ? <span className="ml-2 text-xs font-normal text-slate-500">{i.margin} %</span> : null}</td>
            {p ? <td className="py-2 text-right tabular-nums text-slate-500">{formatMoney(p.result)}</td> : null}
          </tr>
        </tbody>
      </table>
    </Section>
  );
}

/** A ranked table: name, then money columns (`cols`: [[label, key, money?]]). */
export function Ranked({ title, description, rows, cols, empty = "Nothing in this period.", limit = 15 }) {
  return (
    <Section title={title} description={description} bodyClassName="p-0">
      <DataTable dense rows={rows.slice(0, limit)} rowKey={(r, i) => r.id || r.name || i} empty={empty} columns={cols.map(([label, key, money], idx) => ({ key: `${key}-${idx}`, label, align: idx ? "right" : undefined, render: (r) => (money ? <Money value={r[key]} suffix={false} /> : r[key] ?? "—") }))} />
    </Section>
  );
}
