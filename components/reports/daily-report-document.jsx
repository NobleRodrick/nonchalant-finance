import { Money, Plates, StatusBadge } from "@/components/kit/primitives";
import { countOf, formatAmount, formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";

/**
 * The daily report of a restaurant department (snapshot schema v2). The same component is
 * used on screen, for printing (A4) and in the Boss's review, so the figures are identical
 * everywhere. Sections: summary, money in, money out, sales by dish, stock, debts, cash,
 * every record of the day, notes and signatures.
 */
function H({ n, children, aside }) {
  return (
    <div className="mb-2 mt-6 flex items-end justify-between border-b border-slate-300 pb-1 print:mt-4">
      <h3 className="text-sm font-bold uppercase tracking-wide text-slate-900">
        <span className="mr-2 text-slate-400">{n}.</span>
        {children}
      </h3>
      {aside ? <span className="text-xs text-slate-500">{aside}</span> : null}
    </div>
  );
}

function Line({ label, value, strong, indent, tone, hint }) {
  return (
    <div className={cn("flex items-baseline justify-between gap-4 py-1 text-sm", strong && "border-t border-slate-200 pt-2 font-semibold")}>
      <span className={cn("text-slate-700", indent && "pl-4 text-slate-500", strong && "text-slate-900")}>
        {label}
        {hint ? <span className="ml-2 text-xs font-normal text-slate-400">{hint}</span> : null}
      </span>
      <Money value={value} className={cn(tone === "in" && "text-emerald-700", tone === "out" && "text-rose-700")} />
    </div>
  );
}

function Tile({ label, value, tone }) {
  return (
    <div className={cn("rounded-lg border px-3 py-2 print:border-slate-400", tone === "in" ? "border-emerald-200 bg-emerald-50/50" : tone === "out" ? "border-rose-200 bg-rose-50/50" : tone === "dark" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white")}>
      <div className={cn("text-[11px] font-medium uppercase tracking-wide", tone === "dark" ? "text-slate-300" : "text-slate-500")}>{label}</div>
      <div className="mt-0.5 text-lg font-semibold tabular-nums">{value}</div>
    </div>
  );
}

const METHOD = { CASH: "cash", MOMO: "Mobile Money", BANK_TRANSFER: "bank", CREDIT: "on credit" };

export function DailyReportDocument({ model, printedAt }) {
  if (!model || model.schemaVersion !== 2) return <LegacyReport model={model} />;
  const { money, stock, debts, cash, sales } = model;
  const paidParts = Object.entries(money.salesByMethod || {}).filter(([, v]) => v).map(([k, v]) => `${METHOD[k]} ${formatAmount(v)}`);
  return (
    <article className="daily-report mx-auto max-w-4xl rounded-xl border border-slate-200 bg-white p-6 shadow-xs sm:p-8 print:max-w-none print:rounded-none print:border-0 print:p-0 print:shadow-none" data-testid="daily-report">
      <header className="flex flex-col gap-3 border-b-2 border-slate-900 pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="text-xs font-semibold uppercase tracking-wider text-slate-500">{model.organization?.name}</div>
          <h2 className="text-2xl font-bold text-slate-900">Daily report</h2>
          <div className="text-sm text-slate-700">
            {model.department.name}
            {model.department.code ? ` (${model.department.code})` : ""} · {formatDateKey(model.dateKey)}
          </div>
        </div>
        <div className="text-left text-xs text-slate-600 sm:text-right">
          <div className="mb-1"><StatusBadge status={model.status} /></div>
          {model.report?.referenceNo ? <div>Ref {model.department.code ? `${model.department.code}/` : ""}{model.report.referenceNo}{model.report.version > 1 ? ` · version ${model.report.version}` : ""}</div> : null}
          {model.report?.submittedBy ? <div>Sent by {model.report.submittedBy}{model.report.submittedAt ? ` · ${new Date(model.report.submittedAt).toLocaleString("en-GB", { timeZone: "Africa/Douala" })}` : ""}</div> : null}
          <div>{printedAt ? `Printed ${printedAt}` : `Generated ${new Date(model.generatedAt).toLocaleString("en-GB", { timeZone: "Africa/Douala" })}`}</div>
        </div>
      </header>

      {model.report?.reviewNotes ? (
        <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <strong>Boss's note:</strong> {model.report.reviewNotes}
        </div>
      ) : null}

      <H n={1}>Summary</H>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6 print:grid-cols-6">
        <Tile label="Money in" value={formatAmount(money.moneyIn)} tone="in" />
        <Tile label="Money out" value={formatAmount(money.moneyOut)} tone="out" />
        <Tile label="Result" value={formatAmount(money.result)} tone="dark" />
        <Tile label="Cash expected" value={formatAmount(cash.expected)} />
        <Tile label="Handed to Boss" value={formatAmount(cash.handedOver)} />
        <Tile label="Cash variance" value={cash.variance === null ? "not counted" : `${cash.variance > 0 ? "+" : ""}${formatAmount(cash.variance)}`} tone={cash.variance ? "out" : undefined} />
      </div>
      <p className="mt-2 text-xs text-slate-500">All amounts in FCFA.</p>

      <div className="grid gap-x-10 sm:grid-cols-2 print:grid-cols-2">
        <section>
          <H n={2}>Money in</H>
          <Line label="Sales" value={money.salesGross} hint={paidParts.length ? paidParts.join(" · ") : null} />
          {money.unlistedSales ? <Line indent label="of which unlisted items (recorded debts)" value={money.unlistedSales} /> : null}
          <Line label="Rent income" value={money.rentIncome} />
          <Line label="Other income" value={money.otherIncome} />
          <Line strong label="Total money in" value={money.moneyIn} tone="in" />
        </section>
        <section>
          <H n={3}>Money out</H>
          <Line label="Discounts" value={money.discounts} hint={money.standaloneDiscounts ? `on sales ${formatAmount(money.saleDiscounts)} · paid out ${formatAmount(money.standaloneDiscounts)}` : null} />
          <Line label="Purchases" value={money.purchases} hint={money.purchasesOnCredit ? `${formatAmount(money.purchasesOnCredit)} on supplier credit` : null} />
          <Line label="Expenses" value={money.expenses} />
          {money.expensesByCategory?.map((c) => <Line key={c.label} indent label={c.label} value={c.amount} />)}
          <Line label="Other expenses" value={money.otherExpenses} />
          {money.otherExpensesByCategory?.map((c) => <Line key={c.label} indent label={c.label} value={c.amount} />)}
          <Line strong label="Total money out" value={money.moneyOut} tone="out" />
        </section>
      </div>
      <div className="mt-3 flex items-center justify-between rounded-lg bg-slate-900 px-4 py-2 text-white print:border print:border-slate-900 print:bg-white print:text-slate-900">
        <span className="text-sm font-semibold">Result of the day (money in − money out)</span>
        <Money value={money.result} className="text-lg font-bold" />
      </div>

      <H n={4} aside={`${countOf(sales.plates, "plate")} · ${countOf(money.salesCount, "sale")}`}>Sales by dish</H>
      {sales.byDish.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-1.5 text-left font-medium">Dish</th>
              <th className="py-1.5 text-right font-medium">Plates</th>
              <th className="py-1.5 text-right font-medium">Unit price</th>
              <th className="py-1.5 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {sales.byDish.map((d) => (
              <tr key={d.dishId} className="border-b border-slate-100">
                <td className="py-1.5">{d.name}</td>
                <td className="py-1.5 text-right tabular-nums">{d.plates}</td>
                <td className="py-1.5 text-right tabular-nums">{formatAmount(d.unitPrice)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatAmount(d.gross)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <p className="text-sm text-slate-500">No sales.</p>
      )}

      <H n={5} aside="Closing = Opening + Added − Sold">Stock (plates)</H>
      {stock.rows.length ? (
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-xs text-slate-500">
              <th className="py-1.5 text-left font-medium">Dish</th>
              <th className="py-1.5 text-right font-medium">Opening</th>
              <th className="py-1.5 text-right font-medium">Added</th>
              <th className="py-1.5 text-right font-medium">Sold</th>
              {stock.showSpoiled ? <th className="py-1.5 text-right font-medium">Spoiled</th> : null}
              {stock.showCorrected ? <th className="py-1.5 text-right font-medium">Corr.</th> : null}
              <th className="py-1.5 text-right font-semibold text-slate-700">Closing</th>
              <th className="py-1.5 text-right font-medium">Unit price</th>
              <th className="py-1.5 text-right font-medium">Value</th>
            </tr>
          </thead>
          <tbody>
            {stock.rows.map((r) => (
              <tr key={r.dishId} className="border-b border-slate-100">
                <td className="py-1.5">{r.name}</td>
                <td className="py-1.5 text-right"><Plates value={r.opening} /></td>
                <td className="py-1.5 text-right"><Plates value={r.added} /></td>
                <td className="py-1.5 text-right"><Plates value={r.sold} /></td>
                {stock.showSpoiled ? <td className="py-1.5 text-right"><Plates value={r.spoiled} /></td> : null}
                {stock.showCorrected ? <td className="py-1.5 text-right"><Plates value={r.corrected} /></td> : null}
                <td className="py-1.5 text-right font-semibold"><Plates value={r.closing} /></td>
                <td className="py-1.5 text-right tabular-nums">{formatAmount(r.unitPrice)}</td>
                <td className="py-1.5 text-right tabular-nums">{formatAmount(r.value)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-slate-300 font-semibold">
              <td className="py-1.5">Total</td>
              <td className="py-1.5 text-right"><Plates value={stock.totals.opening} /></td>
              <td className="py-1.5 text-right"><Plates value={stock.totals.added} /></td>
              <td className="py-1.5 text-right"><Plates value={stock.totals.sold} /></td>
              {stock.showSpoiled ? <td className="py-1.5 text-right"><Plates value={stock.totals.spoiled} /></td> : null}
              {stock.showCorrected ? <td className="py-1.5 text-right"><Plates value={stock.totals.corrected} /></td> : null}
              <td className="py-1.5 text-right"><Plates value={stock.totals.closing} /></td>
              <td />
              <td className="py-1.5 text-right tabular-nums">{formatAmount(stock.totals.value)}</td>
            </tr>
          </tfoot>
        </table>
      ) : (
        <p className="text-sm text-slate-500">No dishes.</p>
      )}
      <p className="mt-1 text-xs text-slate-500">
        Opening stock value {formatMoney(stock.totals.openingValue)} → closing stock value <strong>{formatMoney(stock.totals.value)}</strong> (plates × unit price).
      </p>

      <div className="grid gap-x-10 sm:grid-cols-2 print:grid-cols-2">
        <section>
          <H n={6}>Debts (customers)</H>
          <Line label="Owed at the start of the day" value={debts.opening} />
          <Line label="+ New debts (sales on credit)" value={debts.given} />
          {debts.oldAdded ? <Line label="+ Old debts added" value={debts.oldAdded} /> : null}
          <Line label="− Repaid today" value={debts.repaid} />
          <Line strong label="Owed at the end of the day" value={debts.closing} />
          {debts.newDebts.length ? (
            <div className="mt-2 text-xs text-slate-600">
              {debts.newDebts.map((d) => (
                <div key={d.id} className="flex justify-between gap-2 py-0.5">
                  <span>{d.referenceNo} · {d.debtor} · {d.description}</span>
                  <span className="tabular-nums">{formatAmount(d.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
          {debts.repayments.length ? (
            <div className="mt-2 text-xs text-slate-600">
              {debts.repayments.map((p) => (
                <div key={p.id} className="flex justify-between gap-2 py-0.5">
                  <span>{p.referenceNo} · {p.debtor} repaid {p.debtReference} ({p.method})</span>
                  <span className="tabular-nums">{formatAmount(p.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
        <section>
          <H n={7}>Cash drawer</H>
          <Line label="Opening cash" value={cash.opening} />
          <Line label="+ Cash received" value={cash.cashIn} />
          <Line label="− Cash paid out" value={cash.cashOut} />
          <Line strong label="Cash expected" value={cash.expected} />
          <Line label="− Handed to the Boss" value={cash.handedOver} hint={cash.handoverPending ? `${formatAmount(cash.handoverPending)} not yet confirmed` : null} />
          <Line strong label="Should remain in the drawer" value={cash.shouldRemain} />
          <div className="flex items-baseline justify-between py-1 text-sm">
            <span className="text-slate-700">Counted</span>
            <span className="tabular-nums">{cash.counted === null ? "not counted yet" : formatMoney(cash.counted)}</span>
          </div>
          <div className={cn("-mx-2 flex items-baseline justify-between rounded-md px-2 py-1 text-sm font-semibold", cash.variance ? "bg-rose-50 text-rose-800" : cash.variance === 0 ? "bg-emerald-50 text-emerald-800" : "")}>
            <span>Variance</span>
            <span className="tabular-nums">{cash.variance === null ? "—" : cash.variance === 0 ? "Balanced" : `${cash.variance > 0 ? "+" : ""}${formatMoney(cash.variance)} (${cash.variance < 0 ? "shortage" : "surplus"})`}</span>
          </div>
          {cash.electronic?.MOMO || cash.electronic?.BANK_TRANSFER ? (
            <p className="mt-1 text-xs text-slate-500">Received electronically (not in the drawer): Mobile Money {formatAmount(cash.electronic.MOMO)} · Bank {formatAmount(cash.electronic.BANK_TRANSFER)}.</p>
          ) : null}
          {model.handovers?.length ? (
            <div className="mt-2 text-xs text-slate-600">
              {model.handovers.map((h) => (
                <div key={h.id} className="flex justify-between py-0.5">
                  <span>{h.referenceNo} · {h.time} · to {h.recipient} · {h.status.toLowerCase()}</span>
                  <span className="tabular-nums">{formatAmount(h.amount)}</span>
                </div>
              ))}
            </div>
          ) : null}
        </section>
      </div>

      <H n={8} aside={countOf(model.records.length, "record")}>Every record of the day</H>
      <table className="w-full text-xs">
        <thead>
          <tr className="border-b border-slate-200 text-slate-500">
            <th className="py-1 text-left font-medium">Time</th>
            <th className="py-1 text-left font-medium">Ref</th>
            <th className="py-1 text-left font-medium">Type</th>
            <th className="py-1 text-left font-medium">Details</th>
            <th className="py-1 text-left font-medium">By</th>
            <th className="py-1 text-right font-medium">Amount</th>
          </tr>
        </thead>
        <tbody>
          {model.records.map((r) => (
            <tr key={`${r.kind}-${r.id}`} className={cn("border-b border-slate-100 align-top", r.status === "VOIDED" && "text-slate-400 line-through")}>
              <td className="py-1 pr-2">{r.time}</td>
              <td className="py-1 pr-2 font-medium">{r.referenceNo || ""}</td>
              <td className="py-1 pr-2">{r.typeLabel}</td>
              <td className="py-1 pr-2">
                {r.description}
                {r.method && r.kind === "money" ? ` · ${r.method}` : ""}
                {r.status === "VOIDED" && r.voidReason ? ` · void: ${r.voidReason}` : ""}
              </td>
              <td className="py-1 pr-2">{r.by}</td>
              <td className="py-1 text-right tabular-nums">{r.amount === null ? "" : formatAmount(r.amount)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      <H n={9}>Notes and signatures</H>
      <p className="min-h-[2rem] whitespace-pre-wrap text-sm text-slate-700">{model.notes || model.report?.notes || "—"}</p>
      <div className="mt-10 grid grid-cols-2 gap-10 text-xs text-slate-600">
        <div className="border-t border-slate-500 pt-1">Department head: {model.report?.submittedBy || "________________"}</div>
        <div className="border-t border-slate-500 pt-1">Boss: {model.report?.reviewedBy || "________________"}</div>
      </div>
      <footer className="mt-6 text-center text-[10px] text-slate-400">Springer Finance · figures in FCFA</footer>
    </article>
  );
}

/** Reports sent before this version (schema 1): the main totals only. */
function LegacyReport({ model }) {
  const t = model?.metrics || model?.totals || {};
  return (
    <article className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-6">
      <h2 className="text-lg font-bold">Daily report (earlier format)</h2>
      <p className="mt-1 text-sm text-slate-500">This report was sent with an earlier version of the app. Its main figures:</p>
      <div className="mt-4 space-y-1">
        {Object.entries(t)
          .filter(([, v]) => typeof v === "number")
          .slice(0, 30)
          .map(([k, v]) => (
            <div key={k} className="flex justify-between border-b border-slate-100 py-1 text-sm">
              <span className="text-slate-600">{k.replace(/([A-Z])/g, " $1").toLowerCase()}</span>
              <span className="tabular-nums">{formatAmount(v)}</span>
            </div>
          ))}
      </div>
    </article>
  );
}
