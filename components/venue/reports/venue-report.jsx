import Link from "next/link";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { LEAD_STATUS_LABELS } from "@/lib/venue/lead-math";
import { DataTable, KeyValues, Money, Section, StatCard, StatementAmount } from "@/components/kit/primitives";
import { CashCountForm } from "@/components/departments/cash-count-form";

const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"]];
const amount = (v, strong) => <StatementAmount value={v} className={strong ? "font-semibold" : undefined} />;
const date = (k) => formatDateKey(k, { weekday: false });

/**
 * One venue report (lib/venue/reports → venueReport) as printable sections. Pure rendering: every
 * figure is computed and tested in lib/venue/report-math.
 */
export function VenueReport({ base, departmentId, report: r, label, includesToday, canCount }) {
  const { income, cashFlow: cf, verification: v } = r;
  const lastCount = v.counts.at(-1) || null;
  return (
    <div className="space-y-6" data-testid="venue-report">
      <div className="hidden print:block">
        <h2 className="text-lg font-semibold">Report · {label}</h2>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3" data-testid="report-kpis">
        <StatCard tone="dark" label="Revenue" value={formatMoney(income.revenue)} hint={`${r.events.length} event(s) held · margin ${formatRate(income.margin)}`} />
        <StatCard tone="out" label="Costs" value={formatMoney(income.costs)} hint={`Expenses ${formatMoney(income.expenses + income.otherExpenses)} · asset losses ${formatMoney(income.assetLosses)}`} />
        <StatCard tone={income.result < 0 ? "out" : "in"} label="Result" value={formatMoney(income.result)} hint="Revenue − costs" />
        <StatCard label="Collected from clients" value={formatMoney(cf.receivedFromClients)} hint={`Refunded ${formatMoney(cf.refunds)}`} />
        <StatCard tone={r.outstanding.total ? "warn" : "default"} label="Still owed by clients" value={formatMoney(r.outstanding.total)} hint={`Today, all bookings · advances held ${formatMoney(r.outstanding.advances)}`} />
        <StatCard tone={v.discrepancies ? "out" : "default"} label="Cash to hand over now" value={formatMoney(v.toHandOver)} hint={`Handed over in the period ${formatMoney(cf.handedOver)}${v.discrepancies ? ` · discrepancies ${formatMoney(v.discrepancies)}` : ""}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Income statement" description="Events on their date (accrual)">
          <KeyValues
            rows={[
              { label: "Events held", value: amount(income.eventsRevenue), indent: true },
              { label: "Kept from cancelled bookings", value: amount(income.cancellationIncome), indent: true },
              { label: "Other income", value: amount(income.otherIncome), indent: true },
              { label: "Revenue", value: amount(income.revenue, true), strong: true },
              { label: "Expenses", value: amount(-income.expenses), indent: true },
              { label: "Other expenses", value: amount(-income.otherExpenses), indent: true },
              { label: "Assets lost", value: amount(-income.assetLosses), indent: true },
              { label: "Costs", value: amount(-income.costs, true), strong: true },
              { label: "Result", value: amount(income.result, true), strong: true },
            ]}
          />
        </Section>
        <Section title="Cash flow" description="Money the day it moved">
          <KeyValues
            rows={[
              { label: "Cash in the drawer at the start", value: amount(cf.opening) },
              { label: "Received from clients", value: amount(cf.receivedFromClients), indent: true },
              { label: "Other income", value: amount(cf.otherIncome), indent: true },
              { label: "Refunds to clients", value: amount(-cf.refunds), indent: true },
              { label: "Expenses paid", value: amount(-cf.expenses), indent: true },
              { label: "Net money movement", value: amount(cf.net, true), strong: true },
              ...METHODS.map(([k, l]) => ({ label: `Received by ${l}`, value: amount(cf.byMethod[k] || 0), indent: true })),
              { label: "Cash in / cash out", value: <span className="tabular-nums">{formatMoney(cf.cashIn)} / {formatMoney(cf.cashOut)}</span> },
              { label: "Handed over to the Boss", value: amount(-cf.handedOver) },
              { label: "Cash in the drawer at the end", value: amount(cf.closingCash, true), strong: true },
            ]}
          />
        </Section>
      </div>

      <Section id="cash" title="Cash verification" description="Who received the money and how, what was counted, handed over and what remains">
        <div className="grid gap-6 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DataTable
              dense
              rowKey={(p) => p.receivedBy}
              columns={[
                { key: "receivedBy", label: "Received by" },
                ...METHODS.map(([k, l]) => ({ key: k, label: l, align: "right", render: (p) => <Money value={p[k] || 0} suffix={false} /> })),
                { key: "count", label: "Payments", align: "right" },
                { key: "total", label: "Total", align: "right", render: (p) => <Money value={p.total} className="font-semibold" /> },
              ]}
              rows={v.byPerson}
              empty="No client payment in this period."
            />
          </div>
          <KeyValues
            rows={[
              { label: "Recorded as received", value: <Money value={v.recorded} /> },
              { label: "Of which in cash", value: <Money value={v.recordedCash} />, indent: true },
              { label: "Handed over", value: <Money value={v.handedOver} /> },
              cf.handoverPending ? { label: "Waiting for the Boss to confirm", value: <Money value={cf.handoverPending} />, indent: true } : null,
              v.disputed ? { label: "Disputed handovers", value: <Money value={v.disputed} tone="out" />, indent: true } : null,
              { label: "Counted vs expected", value: <Money value={v.countVariance} signed tone={v.countVariance ? "out" : "auto"} /> },
              { label: "Discrepancies", value: <Money value={v.discrepancies} tone={v.discrepancies ? "out" : "auto"} />, strong: true },
              { label: "Remaining to hand over (now)", value: <Money value={v.toHandOver} />, strong: true },
            ]}
          />
        </div>
        {v.counts.length ? (
          <div className="mt-5">
            <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cash counts</h3>
            <DataTable
              dense
              rowKey={(c) => c.dateKey}
              columns={[
                { key: "dateKey", label: "Date", render: (c) => date(c.dateKey) },
                { key: "countedCash", label: "Counted", align: "right", render: (c) => <Money value={c.countedCash} /> },
                { key: "expectedCash", label: "Expected", align: "right", render: (c) => <Money value={c.expectedCash} /> },
                { key: "variance", label: "Difference", align: "right", render: (c) => <Money value={c.variance} signed tone={c.variance ? "out" : "auto"} /> },
                { key: "notes", label: "Explanation", render: (c) => <span className="text-slate-600">{c.notes || "—"}</span> },
              ]}
              rows={v.counts}
            />
          </div>
        ) : null}
        {canCount && includesToday ? <CashCountForm departmentId={departmentId} expected={Math.max(0, Math.round(r.drawer.shouldRemain))} todayKey={r.todayKey} lastCount={lastCount?.dateKey === r.todayKey ? lastCount : null} /> : null}
      </Section>

      <Section title="Event profitability" description="Completed events of the period, most profitable first">
        <DataTable
          dense
          columns={[
            { key: "eventDateKey", label: "Date", render: (e) => date(e.eventDateKey) },
            { key: "event", label: "Event", render: (e) => <Link className="hover:underline" href={`${base}/bookings/${e.id}`}>{e.eventType} · {e.clientName}</Link> },
            { key: "revenue", label: "Revenue", align: "right", render: (e) => <Money value={e.revenue} suffix={false} /> },
            { key: "expenses", label: "Expenses", align: "right", render: (e) => <Money value={e.expenses} suffix={false} /> },
            { key: "losses", label: "Asset losses", align: "right", render: (e) => <Money value={e.losses} suffix={false} /> },
            { key: "profit", label: "Profit", align: "right", render: (e) => <Money value={e.profit} className="font-semibold" /> },
            { key: "margin", label: "Margin", align: "right", render: (e) => formatRate(e.margin) },
          ]}
          rows={r.events}
          empty="No event took place in this period."
          footer={
            r.events.length > 1 ? (
              <tr>
                <td className="px-3 py-2" colSpan={2}>Total</td>
                {["revenue", "expenses", "losses", "profit"].map((k) => <td key={k} className="px-3 py-2 text-right"><Money value={r.events.reduce((s, e) => s + e[k], 0)} suffix={false} /></td>)}
                <td />
              </tr>
            ) : null
          }
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Revenue by type of event" description="Completed events of the period">
          <DataTable
            dense
            rowKey={(g) => g.eventType}
            columns={[
              { key: "eventType", label: "Type of event" },
              { key: "events", label: "Events", align: "right" },
              { key: "revenue", label: "Revenue", align: "right", render: (g) => <Money value={g.revenue} suffix={false} /> },
              { key: "average", label: "Average", align: "right", render: (g) => <Money value={g.average} suffix={false} /> },
              { key: "profit", label: "Profit", align: "right", render: (g) => <Money value={g.profit} className="font-semibold" /> },
            ]}
            rows={r.revenueByEventType}
            empty="No event took place in this period."
          />
        </Section>
        <Section id="expenses" title="Expenses by category" description={`${formatMoney(income.expenses + income.otherExpenses)} in the period · ${formatMoney(r.eventExpenses)} for named events`}>
          <DataTable
            dense
            rowKey={(g) => g.category || "none"}
            columns={[
              { key: "label", label: "Category" },
              { key: "count", label: "Records", align: "right" },
              { key: "forEvents", label: "For events", align: "right", render: (g) => <Money value={g.forEvents} suffix={false} /> },
              { key: "amount", label: "Amount", align: "right", render: (g) => <Money value={g.amount} className="font-semibold" /> },
            ]}
            rows={r.expensesByCategory}
            empty="No expense in this period."
          />
        </Section>
      </div>

      <Section id="outstanding" title="Balances owed by clients" description={`Today, every active booking · ${formatMoney(r.outstanding.total)} in total`}>
        <DataTable
          dense
          columns={[
            { key: "eventDateKey", label: "Event date", render: (b) => date(b.eventDateKey) },
            { key: "client", label: "Client", render: (b) => <Link className="hover:underline" href={`${base}/bookings/${b.id}`}>{b.client.name}</Link> },
            { key: "phone", label: "Phone", render: (b) => b.client.phone || "—" },
            { key: "total", label: "Total", align: "right", render: (b) => <Money value={b.figures.total} suffix={false} /> },
            { key: "paid", label: "Paid", align: "right", render: (b) => <Money value={b.figures.paid} suffix={false} /> },
            { key: "balance", label: "Balance", align: "right", render: (b) => <Money value={b.figures.balance} className="font-semibold" /> },
          ]}
          rows={r.outstanding.rows.slice(0, 100)}
          empty="Nothing is owed."
        />
      </Section>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Bookings of the period" description="By event date">
          <KeyValues
            rows={[
              { label: "Reserved", value: r.bookings.RESERVED },
              { label: "Confirmed", value: r.bookings.CONFIRMED },
              { label: "Completed", value: r.bookings.COMPLETED },
              { label: "Cancelled", value: r.bookings.CANCELLED },
              { label: "Free dates, next 30 days", value: r.available.next30 },
            ]}
          />
          {r.cancellations.length ? (
            <div className="mt-4">
              <h3 className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">Cancelled in the period</h3>
              <ul className="space-y-1 text-sm">
                {r.cancellations.map((c) => (
                  <li key={c.id} className="flex justify-between gap-2"><span className="truncate">{c.client.name} · {c.cancelReason}</span><span className="whitespace-nowrap tabular-nums">kept {formatMoney(Math.max(0, c.kept))}</span></li>
                ))}
              </ul>
            </div>
          ) : null}
        </Section>
        <Section title="Leads" description="Enquiries received in the period">
          <KeyValues
            rows={[
              { label: "Enquiries", value: r.leads.total },
              { label: LEAD_STATUS_LABELS.BOOKED, value: r.leads.booked },
              { label: LEAD_STATUS_LABELS.LOST, value: r.leads.lost },
              { label: "Still open", value: r.leads.open },
              { label: "Conversion rate", value: formatRate(r.leads.conversionRate), strong: true },
            ]}
          />
        </Section>
        <Section title="Assets" description="Differences found after events">
          <KeyValues
            rows={[
              { label: "Units damaged or missing", value: r.assets.units },
              { label: "To settle", value: <Money value={r.assets.open} /> },
              { label: "Charged to clients", value: <Money value={r.assets.charged} /> },
              { label: "Losses borne by the hall", value: <Money value={r.assets.lossesSettled} />, strong: true },
              { label: "Expenses of events", value: <Money value={r.eventExpenses} /> },
            ]}
          />
        </Section>
      </div>
    </div>
  );
}
