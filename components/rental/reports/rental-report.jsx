import Link from "next/link";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { INCIDENT_KIND_LABELS, INCIDENT_STATUS_LABELS } from "@/lib/rental/stock-math";
import { Banner, DataTable, KeyValues, Money, Pill, Section, StatCard, StatementAmount } from "@/components/kit/primitives";
import { ValueBars } from "@/components/charts/value-bars";
import { CashVerificationSection } from "@/components/reports/cash-verification-section";
import { monthLabel } from "@/components/venue/dashboard/dashboard-parts";

const amount = (v, strong) => <StatementAmount value={v} className={strong ? "font-semibold" : undefined} />;
const date = (k) => formatDateKey(k, { weekday: false });
const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"], ["OTHER", "Other"]];
const H3 = ({ children }) => <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">{children}</h3>;

/** A short ranked list of items (most rented, least used, most profitable). */
function ItemList({ rows, value, empty }) {
  if (!rows.length) return <p className="text-sm text-slate-500">{empty}</p>;
  return (
    <ol className="space-y-1 text-sm">
      {rows.slice(0, 5).map((r) => (
        <li key={r.id} className="flex justify-between gap-2"><span className="truncate">{r.name}</span><span className="whitespace-nowrap tabular-nums text-slate-700">{value(r)}</span></li>
      ))}
    </ol>
  );
}

/**
 * One event rental report (lib/rental/reports → rentalReport) as printable sections. Pure
 * rendering: every figure is computed and tested in lib/rental/report-math.
 */
export function RentalReport({ base, departmentId, report: r, trends, label, includesToday, canCount }) {
  const { income: i, cashFlow: cf, verification: v, balances: b, balanceSheet: bs, activity: a, profitability: p } = r;
  const months = trends.map((m) => ({ label: monthLabel(m.monthKey), revenue: m.revenue, result: m.result, detail: `${m.events} event(s), result ${formatMoney(m.result)}` }));
  const days = r.revenueByDay.length > 1 && r.revenueByDay.length <= 62 ? r.revenueByDay.map((d) => ({ label: d.dateKey.slice(8) + "/" + d.dateKey.slice(5, 7), revenue: d.revenue })) : null;
  return (
    <div className="space-y-6" data-testid="rental-report">
      <div className="hidden print:block"><h2 className="text-lg font-semibold">Report · {label}</h2></div>

      {r.unvalidated.count ? (
        <Banner tone="warn" className="mb-0" action={<Link href={`${base}/money`} className="font-medium underline">Review</Link>}>{r.unvalidated.count} expense(s) for {formatMoney(r.unvalidated.amount)} still wait for approval.</Banner>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="report-kpis">
        <StatCard tone="dark" label="Revenue" value={formatMoney(i.revenue)} hint={`${a.events} event(s) · margin ${formatRate(i.margin)}`} />
        <StatCard tone="out" label="Costs" value={formatMoney(i.costs)} hint={`Expenses ${formatMoney(i.expenses + i.repairs)} · losses ${formatMoney(i.losses)} · depreciation ${formatMoney(i.depreciation)}`} />
        <StatCard tone={i.result < 0 ? "out" : "in"} label="Profit" value={formatMoney(i.result)} hint="Revenue − costs" />
        <StatCard label="Collected from customers" value={formatMoney(cf.receivedFromClients)} hint={`Refunded ${formatMoney(cf.refunds)}`} />
        <StatCard tone={b.overdue ? "out" : b.owedTotal ? "warn" : "default"} label="Owed by customers" value={formatMoney(b.owedTotal)} hint={`Overdue ${formatMoney(b.overdue)} · advances held ${formatMoney(b.advances)}`} />
        <StatCard label="Items out / back" value={`${a.unitsOut} / ${a.unitsBack}`} hint={`Utilization ${formatRate(r.items.utilization)} · ${a.unitsBought} bought`} />
        <StatCard tone={r.incidents.open ? "warn" : "default"} label="Damaged or missing" value={r.incidents.DAMAGED + r.incidents.BROKEN + r.incidents.MISSING} hint={`${formatMoney(r.incidents.value)} · ${r.incidents.open} to settle`} />
        <StatCard tone={v.discrepancies ? "out" : "default"} label="Cash to hand over now" value={formatMoney(v.toHandOver)} hint={`Handed over ${formatMoney(cf.handedOver)}${v.discrepancies ? ` · discrepancies ${formatMoney(v.discrepancies)}` : ""}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Income statement" description="Bookings on their event date (accrual)">
          <KeyValues
            rows={[
              { label: "Events (booking prices)", value: amount(i.eventsRevenue), indent: true },
              { label: "Charges (damages, extra days…)", value: amount(i.chargesRevenue), indent: true },
              { label: "Kept from cancelled bookings", value: amount(i.cancellationIncome), indent: true },
              { label: "Other income", value: amount(i.otherIncome), indent: true },
              i.assetGains ? { label: "Gains on assets sold", value: amount(i.assetGains), indent: true } : null,
              { label: "Revenue", value: amount(i.revenue, true), strong: true },
              { label: "Expenses", value: amount(-i.expenses), indent: true },
              { label: "Repairs", value: amount(-i.repairs), indent: true },
              { label: "Items lost or written off (at cost)", value: amount(-i.losses), indent: true },
              { label: "Depreciation", value: amount(-i.depreciation), indent: true },
              { label: "Costs", value: amount(-i.costs, true), strong: true },
              { label: "Profit", value: amount(i.result, true), strong: true },
            ]}
          />
        </Section>
        <Section title="Cash flow" description="Money the day it moved">
          <KeyValues
            rows={[
              { label: "Cash in the drawer at the start", value: amount(cf.opening) },
              { label: "Received from customers", value: amount(cf.receivedFromClients), indent: true },
              { label: "Other income", value: amount(cf.otherIncome), indent: true },
              { label: "Refunds to customers", value: amount(-cf.refunds), indent: true },
              { label: "Expenses paid", value: amount(-cf.expenses), indent: true },
              { label: "From operations", value: amount(cf.operating, true), strong: true },
              { label: "Items and assets bought", value: amount(-cf.purchases), indent: true },
              { label: "Net money movement", value: amount(cf.net, true), strong: true },
              ...METHODS.filter(([k]) => k !== "OTHER" || cf.byMethod.OTHER).map(([k, l]) => ({ label: `Received by ${l}`, value: amount(cf.byMethod[k] || 0), indent: true })),
              { label: "Handed over to the Boss", value: amount(-cf.handedOver) },
              { label: "Cash in the drawer at the end", value: amount(cf.closingCash, true), strong: true },
            ]}
          />
        </Section>
      </div>

      <CashVerificationSection verification={v} cashFlow={cf} drawer={r.drawer} todayKey={r.todayKey} departmentId={departmentId} canCount={canCount} includesToday={includesToday} countKind="rental.cash.count" />

      <Section id="events" title="Profit per event" description="Events of the period, most profitable first: price and charges, minus the event's expenses and items lost">
        <DataTable
          dense
          columns={[
            { key: "eventDateKey", label: "Date", render: (e) => date(e.eventDateKey) },
            { key: "event", label: "Event", render: (e) => <Link className="hover:underline" href={`${base}/bookings/${e.id}`}>{e.eventType} · {e.client}</Link> },
            { key: "revenue", label: "Revenue", align: "right", render: (e) => <Money value={e.revenue} suffix={false} /> },
            { key: "expenses", label: "Expenses", align: "right", render: (e) => <Money value={e.expenses} suffix={false} /> },
            { key: "losses", label: "Items lost", align: "right", render: (e) => <Money value={e.losses} suffix={false} /> },
            { key: "profit", label: "Profit", align: "right", render: (e) => <Money value={e.profit} className="font-semibold" /> },
            { key: "margin", label: "Margin", align: "right", render: (e) => formatRate(e.margin) },
          ]}
          rows={p.rows}
          empty="No event in this period."
          footer={
            p.rows.length > 1 ? (
              <tr>
                <td className="px-3 py-2" colSpan={2}>Total</td>
                {["revenue", "expenses", "losses", "profit"].map((k) => <td key={k} className="px-3 py-2 text-right"><Money value={p.rows.reduce((s, e) => s + e[k], 0)} suffix={false} /></td>)}
                <td />
              </tr>
            ) : null
          }
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="By type of event" description="Which events earn the most">
          <DataTable
            dense
            rowKey={(g) => g.eventType}
            columns={[
              { key: "eventType", label: "Type of event" },
              { key: "events", label: "Events", align: "right" },
              { key: "revenue", label: "Revenue", align: "right", render: (g) => <Money value={g.revenue} suffix={false} /> },
              { key: "profit", label: "Profit", align: "right", render: (g) => <Money value={g.profit} className="font-semibold" /> },
              { key: "margin", label: "Margin", align: "right", render: (g) => formatRate(g.margin) },
            ]}
            rows={p.byType}
            empty="No event in this period."
          />
        </Section>
        <Section id="expenses" title="Expenses by category" description="Purchases of items are investments, not expenses">
          <DataTable
            dense
            rowKey={(g) => g.category || "none"}
            columns={[
              { key: "label", label: "Category" },
              { key: "amount", label: "Amount", align: "right", render: (g) => <Money value={g.amount} className="font-semibold" /> },
            ]}
            rows={r.expensesByCategory}
            empty="No expense in this period."
          />
        </Section>
      </div>

      <Section id="owed" title="Balances owed by customers" description={`Today, every confirmed booking · ${formatMoney(b.owedTotal)} owed, ${formatMoney(b.overdue)} overdue`}>
        <DataTable
          dense
          columns={[
            { key: "eventDateKey", label: "Event date", render: (x) => date(x.eventDateKey) },
            { key: "client", label: "Customer", render: (x) => <Link className="hover:underline" href={`${base}/bookings/${x.id}`}>{x.client}</Link> },
            { key: "phone", label: "Phone", render: (x) => x.phone || "—" },
            { key: "total", label: "Total", align: "right", render: (x) => <Money value={x.total} suffix={false} /> },
            { key: "paid", label: "Paid", align: "right", render: (x) => <Money value={x.paid} suffix={false} /> },
            { key: "balance", label: "Balance", align: "right", render: (x) => <span className="inline-flex items-center gap-2">{x.overdue ? <Pill tone="rose">Overdue</Pill> : null}<Money value={x.balance} className="font-semibold" /></span> },
          ]}
          rows={b.rows.slice(0, 100)}
          empty="Nothing is owed."
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Balance sheet" description={`On ${date(r.asOfKey)}`}>
          <KeyValues
            rows={[
              { label: "Cash in the drawer", value: amount(bs.cash), indent: true },
              { label: "Owed by customers (events held)", value: amount(bs.receivable), indent: true },
              { label: "Stock at cost", value: amount(bs.stockValue), indent: true },
              { label: "Assets at book value", value: amount(bs.assetsBookValue), indent: true },
              { label: "Total assets", value: amount(bs.totalAssets, true), strong: true },
              { label: "Advances paid for events to come", value: amount(-bs.advances), indent: true },
              { label: "Net position", value: amount(bs.netPosition, true), strong: true },
            ]}
          />
        </Section>
        <Section title="Activity" description="Bookings made, items out and back, purchases">
          <KeyValues
            rows={[
              { label: "New bookings", value: `${a.newBookings} · ${formatMoney(a.newBookingsValue)}` },
              { label: "Of which confirmed", value: a.confirmed, indent: true },
              { label: "New customers served", value: a.customers, indent: true },
              { label: "Events held", value: a.events },
              { label: "Cancelled", value: a.cancelled },
              { label: "Units sent out / back", value: `${a.unitsOut} / ${a.unitsBack}` },
              { label: "Units bought", value: `${a.unitsBought} · ${formatMoney(a.purchases)}` },
              { label: "Stock now", value: `${r.stock.inStock} in store · ${r.stock.out} out · ${r.stock.damaged + r.stock.inRepair} damaged or in repair` },
            ]}
          />
          {r.cancellations.length ? (
            <div className="mt-4">
              <H3>Cancelled in the period</H3>
              <ul className="space-y-1 text-sm">
                {r.cancellations.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2"><span className="truncate">{c.referenceNo} · {c.client?.name} · {c.cancelReason}</span><span className="whitespace-nowrap tabular-nums">kept {formatMoney(c.kept)}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
      </div>

      <Section id="damages" title="Damages and losses" description={`${formatMoney(r.incidents.value)} estimated · repairs ${formatMoney(r.incidents.repairCost)} · ${r.incidents.open} still to settle`}>
        <DataTable
          dense
          rowKey={(x, n) => `${x.itemId}-${n}`}
          columns={[
            { key: "item", label: "Item", render: (x) => x.item?.name },
            { key: "kind", label: "What", render: (x) => INCIDENT_KIND_LABELS[x.kind] },
            { key: "quantity", label: "Units", align: "right" },
            { key: "estimatedLoss", label: "Value", align: "right", render: (x) => <Money value={x.estimatedLoss} suffix={false} /> },
            { key: "status", label: "Status", render: (x) => INCIDENT_STATUS_LABELS[x.status] },
          ]}
          rows={r.incidentList}
          empty="No damage or loss in this period."
        />
      </Section>

      <Section id="items" title="Items" description={`Average utilization ${formatRate(r.items.utilization)} (units out × days ÷ units owned × days of the period)`}>
        <div className="grid gap-6 md:grid-cols-3">
          <div><H3>Most rented</H3><ItemList rows={r.items.mostRented} value={(x) => `${x.units} units · ${x.times}×`} empty="Nothing rented in this period." /></div>
          <div><H3>Least used</H3><ItemList rows={r.items.leastRented} value={(x) => formatRate(x.utilization)} empty="No item in stock." /></div>
          <div><H3>Most profitable</H3><ItemList rows={r.items.mostProfitable} value={(x) => formatMoney(x.profit)} empty="Nothing rented in this period." /></div>
        </div>
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Customers" description="Who spent the most on events of the period">
          <DataTable
            dense
            rowKey={(c) => c.client}
            columns={[
              { key: "client", label: "Customer" },
              { key: "events", label: "Events", align: "right" },
              { key: "revenue", label: "Spent", align: "right", render: (c) => <Money value={c.revenue} className="font-semibold" /> },
            ]}
            rows={r.customers.slice(0, 10)}
            empty="No event in this period."
          />
        </Section>
        <Section title="Assets" description="Asset register on the date of the report">
          <KeyValues
            rows={[
              { label: "Assets in use", value: r.assets.count },
              { label: "Cost", value: <Money value={r.assets.cost} /> },
              { label: "Depreciation to date", value: <Money value={r.assets.accumulated} /> },
              { label: "Book value", value: <Money value={r.assets.bookValue} />, strong: true },
              { label: "Depreciation of the period", value: <Money value={r.assets.depreciation} /> },
              { label: "Each month now", value: <Money value={r.assets.monthly} /> },
            ]}
          />
          <p className="mt-3 text-sm"><Link href={`${base}/assets`} className="text-slate-700 underline print:hidden">Open the asset register</Link></p>
        </Section>
      </div>

      {days ? (
        <Section title="Revenue by day" description="Events on their date, charges and money kept from cancellations">
          <ValueBars data={days} valueKey="revenue" empty="No revenue in this period." />
        </Section>
      ) : null}

      <Section title="Last 12 months" description="Revenue month by month (profit on hover)">
        <ValueBars data={months} valueKey="revenue" empty="No revenue in the last 12 months." />
        <div className="mt-4">
          <DataTable
            dense
            rowKey={(m) => m.monthKey}
            columns={[
              { key: "monthKey", label: "Month", render: (m) => monthLabel(m.monthKey, true) },
              { key: "events", label: "Events", align: "right" },
              { key: "revenue", label: "Revenue", align: "right", render: (m) => <Money value={m.revenue} suffix={false} /> },
              { key: "costs", label: "Costs", align: "right", render: (m) => <Money value={m.costs} suffix={false} /> },
              { key: "result", label: "Profit", align: "right", render: (m) => <Money value={m.result} className="font-semibold" /> },
            ]}
            rows={[...trends].reverse()}
          />
        </div>
      </Section>
    </div>
  );
}
