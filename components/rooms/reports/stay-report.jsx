import Link from "next/link";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { DataTable, KeyValues, Money, Section, StatCard, StatementAmount } from "@/components/kit/primitives";
import { ValueBars } from "@/components/charts/value-bars";
import { CashCountForm } from "@/components/departments/cash-count-form";

const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"]];
const amount = (v, strong) => <StatementAmount value={v} className={strong ? "font-semibold" : undefined} />;
const date = (k) => formatDateKey(k, { weekday: false });
const shortDay = (k) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });

/** One guest house report (lib/rooms/reports → staysReport) as printable sections. Pure rendering. */
export function StayReport({ base, departmentId, report: r, label, includesToday, canCount }) {
  const { income: i, cashFlow: cf, verification: v, balanceSheet: bs, profitability: p, occupancy: occ, activity: act } = r;
  const lastCount = v.counts.at(-1) || null;
  const days = r.nightsByDay.length;
  return (
    <div className="space-y-6" data-testid="stay-report">
      <div className="hidden print:block"><h2 className="text-lg font-semibold">Report · {label}</h2></div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="report-kpis">
        <StatCard tone="dark" label="Revenue" value={formatMoney(i.revenue)} hint={`${r.nightsSold} night(s) sold · occupancy ${formatRate(occ.rate)}`} />
        <StatCard tone="out" label="Costs" value={formatMoney(i.costs)} hint={`Expenses ${formatMoney(i.expenses)} · repairs ${formatMoney(i.repairs)} · losses ${formatMoney(i.assetLosses)}`} />
        <StatCard tone={i.result < 0 ? "out" : "in"} label="Net income" value={formatMoney(i.result)} hint={`Margin ${formatRate(i.margin)}`} />
        <StatCard label="Cash received" value={formatMoney(cf.receivedFromClients + cf.otherIncome)} hint={`From guests ${formatMoney(cf.receivedFromClients)} · other ${formatMoney(cf.otherIncome)}`} />
        <StatCard tone={r.balances.owedTotal ? "warn" : "default"} label="Owed by guests" value={formatMoney(r.balances.owedTotal)} hint={`For nights already stayed ${formatMoney(r.balances.receivable)}`} />
        <StatCard tone={v.discrepancies ? "out" : "default"} label="Cash to hand over now" value={formatMoney(v.toHandOver)} hint={`Handed over in the period ${formatMoney(cf.handedOver)}${v.discrepancies ? ` · discrepancies ${formatMoney(v.discrepancies)}` : ""}`} />
      </div>
      {r.unvalidated.count ? <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">{r.unvalidated.count} expense(s) for {formatMoney(r.unvalidated.amount)} are not validated yet. <Link className="underline" href={`${base}/money?pending=1&period=year`}>Check them</Link></p> : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Income statement (profit & loss)" description="Nights on their date (accrual)">
          <KeyValues
            rows={[
              { label: "Nights stayed", value: amount(i.nightsRevenue), indent: true },
              { label: "Kept from cancelled bookings", value: amount(i.cancellationIncome), indent: true },
              { label: "Other income", value: amount(i.otherIncome), indent: true },
              { label: "Revenue", value: amount(i.revenue, true), strong: true },
              { label: "Expenses", value: amount(-i.expenses), indent: true },
              { label: "Repairs and maintenance", value: amount(-i.repairs), indent: true },
              { label: "Assets lost", value: amount(-i.assetLosses), indent: true },
              { label: "Costs", value: amount(-i.costs, true), strong: true },
              { label: "Net income", value: amount(i.result, true), strong: true },
            ]}
          />
        </Section>
        <Section id="cash-flow" title="Cash flow statement" description="Money the day it moved">
          <KeyValues
            rows={[
              { label: "Cash in the drawer at the start", value: amount(cf.opening) },
              { label: "Received from guests", value: amount(cf.receivedFromClients), indent: true },
              { label: "Other income", value: amount(cf.otherIncome), indent: true },
              { label: "Refunds to guests", value: amount(-cf.refunds), indent: true },
              { label: "Expenses paid", value: amount(-cf.expenses), indent: true },
              { label: "Operating cash flow", value: amount(cf.operating, true), strong: true },
              { label: "Furniture & equipment bought", value: amount(-cf.assetPurchases), indent: true },
              { label: "Net cash flow", value: amount(cf.net, true), strong: true },
              ...METHODS.map(([k, l]) => ({ label: `Received by ${l}`, value: amount(cf.byMethod[k] || 0), indent: true })),
              { label: "Handed over to the Boss", value: amount(-cf.handedOver) },
              { label: "Cash in the drawer at the end", value: amount(cf.closingCash, true), strong: true },
            ]}
          />
        </Section>
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Balance sheet" description={`On ${date(r.asOfKey)}`}>
          <KeyValues
            rows={[
              { label: "Cash in the drawer", value: amount(bs.cash), indent: true },
              { label: "Owed by guests for nights stayed", value: amount(bs.receivable), indent: true },
              { label: "Furniture & equipment (purchase value)", value: amount(bs.assetsValue), indent: true },
              { label: "Total assets", value: amount(bs.totalAssets, true), strong: true },
              { label: "Guests' advances (nights not stayed yet)", value: amount(bs.advances), indent: true },
              { label: "Total liabilities", value: amount(bs.totalLiabilities, true), strong: true },
              { label: "Net position", value: amount(bs.netPosition, true), strong: true },
            ]}
          />
          <p className="mt-2 text-xs text-slate-500">Cash handed over to the Boss leaves the department; Mobile Money and bank payments are shown in the cash flow.</p>
        </Section>
        <Section title="Bookings and occupancy" description={label}>
          <KeyValues
            rows={[
              { label: "New bookings", value: act.newBookings },
              { label: "Arrivals · departures", value: `${act.arrivals} · ${act.departures}` },
              { label: "Check-ins · check-outs", value: `${act.checkIns} · ${act.checkOuts}` },
              { label: "Cancellations", value: act.cancellations },
              { label: "Nights occupied / available", value: `${occ.occupied} / ${occ.available}` },
              { label: "Occupancy rate", value: formatRate(occ.rate), strong: true },
              { label: "Average price of a night sold", value: <Money value={r.nightsSold ? Math.round(i.nightsRevenue / r.nightsSold) : 0} /> },
              act.complimentary ? { label: "Free stays (venue packages)", value: act.complimentary } : null,
            ]}
          />
        </Section>
      </div>

      <Section title="Apartment by apartment" description="Revenue, costs and profit of each apartment; shared costs of the house below">
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          {p.best ? <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm"><div className="text-xs font-semibold uppercase text-emerald-800">Highest revenue</div><div className="font-semibold">{p.best.name}: {formatMoney(p.best.revenue)}</div></div> : null}
          {p.worst ? <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm"><div className="text-xs font-semibold uppercase text-rose-800">Lowest revenue</div><div className="font-semibold">{p.worst.name}: {formatMoney(p.worst.revenue)}</div></div> : null}
        </div>
        <DataTable
          dense
          rowKey={(x) => x.roomId}
          rows={p.rows}
          columns={[
            { key: "name", label: "Apartment", render: (x) => <Link className="font-medium hover:underline" href={`${base}/rooms/${x.roomId}`}>{x.name}</Link> },
            { key: "nights", label: "Nights", align: "right", render: (x) => x.nightsSold },
            { key: "occ", label: "Occupancy", align: "right", render: (x) => formatRate(x.occupancyRate) },
            { key: "adr", label: "Price / night", align: "right", render: (x) => <Money value={x.adr} suffix={false} /> },
            { key: "rev", label: "Revenue", align: "right", render: (x) => <Money value={x.revenue} suffix={false} /> },
            { key: "exp", label: "Expenses", align: "right", render: (x) => <Money value={x.expenses - x.repairs} suffix={false} /> },
            { key: "rep", label: "Repairs", align: "right", render: (x) => <Money value={x.repairs} suffix={false} /> },
            { key: "loss", label: "Assets lost", align: "right", render: (x) => <Money value={x.assetLosses} suffix={false} /> },
            { key: "profit", label: "Profit", align: "right", render: (x) => <Money value={x.profit} className="font-semibold" /> },
            { key: "margin", label: "Margin", align: "right", render: (x) => formatRate(x.margin) },
          ]}
          footer={
            <>
              <tr><td className="px-3 py-2" colSpan={4}>Shared by the house</td><td className="px-3 py-2 text-right"><Money value={p.shared.otherIncome} suffix={false} /></td><td className="px-3 py-2 text-right"><Money value={p.shared.expenses - p.shared.repairs} suffix={false} /></td><td className="px-3 py-2 text-right"><Money value={p.shared.repairs} suffix={false} /></td><td className="px-3 py-2 text-right"><Money value={p.shared.assetLosses} suffix={false} /></td><td className="px-3 py-2 text-right"><Money value={p.shared.otherIncome - p.shared.expenses - p.shared.assetLosses} /></td><td /></tr>
              <tr><td className="px-3 py-2" colSpan={8}>Executive Stay (all)</td><td className="px-3 py-2 text-right"><Money value={i.result} /></td><td className="px-3 py-2 text-right">{formatRate(i.margin)}</td></tr>
            </>
          }
        />
        <div className="mt-4 grid gap-6 lg:grid-cols-2 print:hidden">
          <div>
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Revenue by apartment</h3>
            <ValueBars data={p.rows.map((x) => ({ label: x.name, value: x.revenue, detail: `profit ${formatMoney(x.profit)}` }))} empty="No revenue in this period." />
          </div>
          {days > 1 ? (
            <div>
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Nights' revenue by day</h3>
              <ValueBars data={r.nightsByDay.map((d) => ({ label: shortDay(d.dateKey), value: d.revenue }))} color="#7c3aed" empty="No night sold in this period." />
            </div>
          ) : null}
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section id="expenses" title="Expense report" description={`${formatMoney(i.expenses + i.repairs)} spent · shared ${formatMoney(p.shared.expenses)}`}>
          <DataTable dense rowKey={(g) => g.category} rows={r.expensesByCategory} empty="No expense in this period." columns={[{ key: "label", label: "Category" }, { key: "amount", label: "Amount", align: "right", render: (g) => <Money value={g.amount} /> }]} />
          {cf.assetPurchases ? <p className="mt-2 text-xs text-slate-500">Furniture & equipment bought ({formatMoney(cf.assetPurchases)}) is an investment: in the cash flow and the balance sheet, not a cost.</p> : null}
        </Section>
        <Section title="Revenue report" description={label}>
          <KeyValues
            rows={[
              { label: "Nights stayed", value: <Money value={i.nightsRevenue} /> },
              { label: "Kept from cancelled bookings", value: <Money value={i.cancellationIncome} /> },
              { label: "Other income (extra services …)", value: <Money value={i.otherIncome} /> },
              { label: "Revenue", value: <Money value={i.revenue} />, strong: true },
              { label: "Received from guests in the period (cash basis)", value: <Money value={cf.receivedFromClients - cf.refunds} /> },
            ]}
          />
          {r.cancellations.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {r.cancellations.map((c) => <li key={c.id} className="flex justify-between gap-2"><span className="truncate">{c.referenceNo} · {c.guestName} · {c.cancelReason}</span><span className="whitespace-nowrap tabular-nums">kept {formatMoney(c.kept)}</span></li>)}
            </ul>
          ) : null}
        </Section>
      </div>

      <Section id="cash" title="Cash collection and verification" description="Who received the money and how, what was counted, handed over and what remains">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DataTable
              dense
              rowKey={(x) => x.receivedBy}
              rows={v.byPerson}
              empty="No guest payment in this period."
              columns={[
                { key: "receivedBy", label: "Received by" },
                ...METHODS.map(([k, l]) => ({ key: k, label: l, align: "right", render: (x) => <Money value={x[k] || 0} suffix={false} /> })),
                { key: "count", label: "Payments", align: "right" },
                { key: "total", label: "Total", align: "right", render: (x) => <Money value={x.total} className="font-semibold" /> },
              ]}
            />
          </div>
          <KeyValues
            rows={[
              { label: "Total income recorded", value: <Money value={i.revenue} /> },
              { label: "Cash / money received", value: <Money value={v.recorded + cf.otherIncome} /> },
              { label: "Of which in cash", value: <Money value={v.recordedCash} />, indent: true },
              { label: "Handed over", value: <Money value={v.handedOver} /> },
              cf.handoverPending ? { label: "Waiting for the Boss to confirm", value: <Money value={cf.handoverPending} />, indent: true } : null,
              { label: "Still to hand over (now)", value: <Money value={v.toHandOver} />, strong: true },
              { label: "Owed by guests", value: <Money value={r.balances.owedTotal} /> },
              { label: "Counted vs expected", value: <Money value={v.countVariance} signed tone={v.countVariance ? "out" : "auto"} /> },
              { label: "Discrepancies", value: <Money value={v.discrepancies} tone={v.discrepancies ? "out" : "auto"} />, strong: true },
            ]}
          />
        </div>
        {v.counts.length ? (
          <div className="mt-5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cash counts</h3>
            <DataTable dense rowKey={(c) => c.dateKey} rows={v.counts} columns={[
              { key: "dateKey", label: "Date", render: (c) => date(c.dateKey) },
              { key: "countedCash", label: "Counted", align: "right", render: (c) => <Money value={c.countedCash} /> },
              { key: "expectedCash", label: "Expected", align: "right", render: (c) => <Money value={c.expectedCash} /> },
              { key: "variance", label: "Difference", align: "right", render: (c) => <Money value={c.variance} signed tone={c.variance ? "out" : "auto"} /> },
              { key: "notes", label: "Explanation", render: (c) => <span className="text-slate-600">{c.notes || "—"}</span> },
            ]} />
          </div>
        ) : null}
        {canCount && includesToday ? <CashCountForm kind="rooms.cash.count" departmentId={departmentId} expected={Math.max(0, Math.round(r.drawer.shouldRemain))} todayKey={r.todayKey} lastCount={lastCount?.dateKey === r.todayKey ? lastCount : null} /> : null}
      </Section>

      <Section id="outstanding" title="Outstanding payments" description={`Today: ${formatMoney(r.balances.owedTotal)} owed · ${formatMoney(r.balances.receivable)} for nights already stayed · advances held ${formatMoney(r.balances.advances)}`}>
        <DataTable
          dense
          rows={r.balances.rows.slice(0, 100)}
          empty="Nothing is owed."
          columns={[
            { key: "ref", label: "Booking", render: (b) => <Link className="hover:underline" href={`${base}/stays/${b.id}`}>{b.referenceNo}</Link> },
            { key: "guest", label: "Guest", render: (b) => <span>{b.guestName}{b.guestPhone ? <span className="block text-xs text-slate-500">{b.guestPhone}</span> : null}</span> },
            { key: "apt", label: "Apartment", render: (b) => b.roomName },
            { key: "dates", label: "Stay", render: (b) => `${date(b.checkInKey)} → ${date(b.checkOutKey)}` },
            { key: "total", label: "Price", align: "right", render: (b) => <Money value={b.total} suffix={false} /> },
            { key: "paid", label: "Paid", align: "right", render: (b) => <Money value={b.paid} suffix={false} /> },
            { key: "stayed", label: "For nights stayed", align: "right", render: (b) => <Money value={b.owedForNightsStayed} suffix={false} /> },
            { key: "balance", label: "Balance", align: "right", render: (b) => <Money value={b.balance} className="font-semibold" /> },
          ]}
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Asset report" description="Register at purchase value; changes of the period">
          <KeyValues
            rows={[
              { label: "Value of the register", value: <Money value={r.assets.register.total.value} />, strong: true },
              { label: "Units · damaged now", value: `${r.assets.register.total.units} · ${r.assets.register.total.damaged}` },
              { label: "Added (units) · bought (cost)", value: `${r.assets.movements.bought} · ${formatMoney(r.assets.movements.purchaseCost)}` },
              { label: "Damaged · repaired", value: `${r.assets.movements.damaged} · ${r.assets.movements.repaired}` },
              { label: "Missing · replaced · removed", value: `${r.assets.movements.missing} · ${r.assets.movements.replaced} · ${r.assets.movements.removed}` },
              { label: "Moved between apartments", value: r.assets.movements.transfers },
              { label: "Lost value (a cost)", value: <Money value={r.assets.movements.loss} tone={r.assets.movements.loss ? "out" : "auto"} />, strong: true },
            ]}
          />
          <Link href={`${base}/assets`} className="mt-2 inline-block text-sm underline print:hidden">The register</Link>
        </Section>
        <Section title="Maintenance and repair report" description={label}>
          <KeyValues
            rows={[
              { label: "Pending now", value: `${r.repairs.pending} (${r.repairs.urgent} urgent or high)` },
              { label: "Estimated cost pending", value: <Money value={r.repairs.estimated} /> },
              { label: "Repaired in the period", value: r.repairs.done },
              { label: "Cost of the repairs done", value: <Money value={r.repairs.spent} />, strong: true },
            ]}
          />
          {r.repairs.openList.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {r.repairs.openList.slice(0, 8).map((x) => <li key={x.id} className="flex justify-between gap-2"><span className="truncate">{x.referenceNo} · {x.room.name} · {x.title}</span><span className="text-xs text-slate-500">{x.priority.toLowerCase()}</span></li>)}
            </ul>
          ) : null}
          <Link href={`${base}/maintenance`} className="mt-2 inline-block text-sm underline print:hidden">Maintenance</Link>
        </Section>
      </div>
    </div>
  );
}
