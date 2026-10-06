import Link from "next/link";
import { formatMoney, formatRate } from "@/lib/format";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";
import { monthLabel } from "@/lib/property/rent-schedule";
import { Banner, DataTable, KeyValues, Money, Section, StatCard, StatementAmount } from "@/components/kit/primitives";
import { ValueBars } from "@/components/charts/value-bars";
import { CashVerificationSection } from "@/components/reports/cash-verification-section";

const amount = (v, strong) => <StatementAmount value={v} className={strong ? "font-semibold" : undefined} />;
const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"], ["OTHER", "Other"]];
const perf = (rows, base, kind) => (
  <DataTable
    dense
    rows={rows}
    empty="Nothing in this period."
    columns={[
      { key: "name", label: kind === "unit" ? "Office" : kind === "tenant" ? "Tenant" : "Building", render: (r) => (kind === "unit" ? <Link className="hover:underline" href={`${base}/offices/${r.id}`}>{r.name} <span className="text-xs text-slate-500">{r.building}</span></Link> : kind === "tenant" ? <Link className="hover:underline" href={`${base}/tenants/${r.id}`}>{r.name}</Link> : r.name) },
      ...(kind === "tenant" ? [{ key: "offices", label: "Offices", render: (r) => r.offices }] : []),
      { key: "rent", label: "Rent", align: "right", render: (r) => <Money value={r.rent} suffix={false} /> },
      { key: "charges", label: "Charges", align: "right", render: (r) => <Money value={r.charges} suffix={false} /> },
      ...(kind !== "tenant" ? [{ key: "expenses", label: "Expenses", align: "right", render: (r) => <Money value={r.expenses} suffix={false} /> }, { key: "net", label: "Net", align: "right", render: (r) => <Money value={r.net} className="font-semibold" /> }] : [{ key: "revenue", label: "Total", align: "right", render: (r) => <Money value={r.revenue} className="font-semibold" /> }]),
    ]}
  />
);

/** One property rental report (lib/property/reports → propertyReport) as printable sections. */
export function PropertyReport({ base, departmentId, report: r, trends, label, includesToday, canCount }) {
  const i = r.income;
  const cf = r.cashFlow;
  const o = r.occupancy;
  return (
    <div className="space-y-6" data-testid="property-report">
      <div className="hidden print:block"><h2 className="text-lg font-semibold">Report · {label}</h2></div>
      {r.unvalidated.count ? <Banner tone="warn" className="mb-0" action={<Link href={`${base}/money?pending=1`} className="font-medium underline">Review</Link>}>{r.unvalidated.count} expense(s) for {formatMoney(r.unvalidated.amount)} still wait for approval.</Banner> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="report-kpis">
        <StatCard tone="dark" label="Total income" value={formatMoney(i.revenue)} hint={`Rent ${formatMoney(i.rentNet)} · utilities ${formatMoney(i.utilities)} · other ${formatMoney(i.otherCharges + i.otherIncome)}`} />
        <StatCard tone="out" label="Expenses" value={formatMoney(i.expenses)} />
        <StatCard tone={i.net < 0 ? "out" : "in"} label="Net operating income" value={formatMoney(i.net)} hint={`Margin ${formatRate(i.margin)}`} />
        <StatCard label="Rent collected" value={formatMoney(r.rent.collected)} hint={`Rent expected ${formatMoney(r.rent.expected)}`} />
        <StatCard tone={r.arrears.overdue ? "out" : r.arrears.owed ? "warn" : "default"} label="Owed by tenants (now)" value={formatMoney(r.arrears.owed)} hint={`Overdue ${formatMoney(r.arrears.overdue)} · ${r.arrears.tenants} tenant(s)`} href={`${base}/arrears`} />
        <StatCard label="Deposits held (now)" value={formatMoney(r.deposits.held)} hint={`Received ${formatMoney(r.deposits.received)} · refunded ${formatMoney(r.deposits.refunded)}`} />
        <StatCard label="Occupancy" value={`${o.OCCUPIED} / ${o.total}`} hint={`${o.occupancyRate}% now · ${o.periodRate}% over the period · ${o.vacant} vacant`} />
        <StatCard tone={r.verification.discrepancies ? "out" : "default"} label="Cash to hand over now" value={formatMoney(r.verification.toHandOver)} hint={`Handed over ${formatMoney(cf.handedOver)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Income statement" description="Rent on the days of its month; charges on their bill date">
          <KeyValues
            rows={[
              { label: "Rent", value: amount(i.rent), indent: true },
              i.waived ? { label: "Forgiven", value: amount(-i.waived), indent: true } : null,
              ...Object.entries(i.byKind).map(([k, v]) => ({ label: CHARGE_KIND_LABELS[k], value: amount(v), indent: true })),
              { label: "Other income", value: amount(i.otherIncome), indent: true },
              { label: "Total income", value: amount(i.revenue, true), strong: true },
              ...i.expensesByCategory.map((e) => ({ label: e.label, value: amount(-e.amount), indent: true })),
              { label: "Total expenses", value: amount(-i.expenses, true), strong: true },
              { label: "Net operating income", value: amount(i.net, true), strong: true },
            ]}
          />
        </Section>
        <Section title="Cash flow" description="Money the day it moved">
          <KeyValues
            rows={[
              { label: "Cash in the drawer at the start", value: amount(cf.opening) },
              { label: "Paid by tenants", value: amount(cf.tenantPayments), indent: true },
              cf.refunds ? { label: "Refunded to tenants", value: amount(-cf.refunds), indent: true } : null,
              { label: "Deposits received", value: amount(cf.depositsIn), indent: true },
              { label: "Deposits refunded", value: amount(-cf.depositsOut), indent: true },
              { label: "Other income", value: amount(cf.otherIncome), indent: true },
              { label: "Expenses paid", value: amount(-cf.expenses), indent: true },
              { label: "Net money movement", value: amount(cf.net, true), strong: true },
              ...METHODS.filter(([k]) => k !== "OTHER" || cf.byMethod.OTHER).map(([k, l]) => ({ label: `Received by ${l}`, value: amount(cf.byMethod[k] || 0), indent: true })),
              { label: "Bank and Mobile Money collections", value: amount(cf.bankAndMomo) },
              { label: "Handed over to the Boss", value: amount(-cf.handedOver) },
              { label: "Cash in the drawer at the end", value: amount(cf.closingCash, true), strong: true },
            ]}
          />
        </Section>
      </div>

      <Section title="Rental performance" description="Offices now; rent of the period">
        <KeyValues
          rows={[
            { label: "Total offices", value: o.total },
            { label: "Occupied · vacant · reserved · maintenance", value: `${o.OCCUPIED} · ${o.vacant} · ${o.RESERVED} · ${o.MAINTENANCE + o.UNAVAILABLE}` },
            { label: "Occupancy rate (now · over the period)", value: `${o.occupancyRate}% · ${o.periodRate}%` },
            { label: "Rent expected in the period", value: <Money value={r.rent.expected} /> },
            { label: "Rent collected in the period", value: <Money value={r.rent.collected} /> },
            { label: "Total tenant debt (now)", value: <Money value={r.arrears.owed} />, strong: true },
            { label: "Deposits held (now)", value: <Money value={r.deposits.held} /> },
          ]}
        />
      </Section>

      <CashVerificationSection verification={r.verification} cashFlow={{ ...cf, disputed: 0 }} drawer={r.drawer} todayKey={r.todayKey} departmentId={departmentId} canCount={canCount} includesToday={includesToday} countKind="property.cash.count" />

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="By building">{perf(r.by.buildings, base, "building")}{r.by.generalExpenses ? <p className="mt-2 text-xs text-slate-500">Expenses of the whole business (no building): {formatMoney(r.by.generalExpenses)}</p> : null}</Section>
        <Section title="By tenant">{perf(r.by.tenants, base, "tenant")}</Section>
      </div>
      <Section title="By office">{perf(r.by.units, base, "unit")}</Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Who owes" description="Now, every contract" actions={<Link href={`${base}/arrears`} className="text-sm underline print:hidden">Arrears</Link>}>
          <DataTable dense rows={r.arrears.rows.slice(0, 15)} empty="Nobody owes anything." columns={[{ key: "t", label: "Tenant", render: (x) => <Link className="hover:underline" href={`${base}/contracts/${x.id}`}>{x.tenant}</Link> }, { key: "u", label: "Office", render: (x) => x.unit }, { key: "m", label: "Months", align: "right", render: (x) => x.monthsOwed }, { key: "d", label: "Days late", align: "right", render: (x) => x.daysOverdue }, { key: "b", label: "Owed", align: "right", render: (x) => <Money value={x.balance} className="font-semibold" /> }]} />
        </Section>
        <Section title="Activity">
          <KeyValues
            rows={[
              { label: "New tenants", value: r.activity.newTenants.map((x) => `${x.tenant} (${x.unit})`).join(", ") || "—" },
              { label: "Offices vacated", value: r.activity.vacated.map((x) => `${x.unit} (${x.tenant})`).join(", ") || "—" },
              { label: "New reservations", value: r.activity.newReservations },
              { label: "Tenant payments", value: r.activity.payments },
              { label: "Maintenance reported · done · open", value: `${r.activity.maintenanceOpened} · ${r.activity.maintenanceDone} · ${r.activity.maintenanceOpen}` },
              { label: "Maintenance cost (done)", value: <Money value={r.activity.maintenanceCost} /> },
              { label: "Deposits used for debts", value: <Money value={r.deposits.applied} /> },
            ]}
          />
        </Section>
      </div>

      <Section title="Last 12 months" description="Total income month by month (net income on hover)">
        <ValueBars data={trends.map((m) => ({ label: monthLabel(m.monthKey, true), revenue: m.revenue, detail: `net ${formatMoney(m.net)}, collected ${formatMoney(m.collected)}` }))} valueKey="revenue" empty="No income yet." />
        <div className="mt-4">
          <DataTable dense rowKey={(m) => m.monthKey} rows={[...trends].reverse()} columns={[{ key: "m", label: "Month", render: (m) => monthLabel(m.monthKey) }, { key: "r", label: "Rent", align: "right", render: (m) => <Money value={m.rent} suffix={false} /> }, { key: "u", label: "Utilities", align: "right", render: (m) => <Money value={m.utilities} suffix={false} /> }, { key: "o", label: "Other", align: "right", render: (m) => <Money value={m.other} suffix={false} /> }, { key: "e", label: "Expenses", align: "right", render: (m) => <Money value={m.expenses} suffix={false} /> }, { key: "n", label: "Net", align: "right", render: (m) => <Money value={m.net} className="font-semibold" /> }, { key: "c", label: "Collected", align: "right", render: (m) => <Money value={m.collected} suffix={false} /> }]} />
        </div>
      </Section>
    </div>
  );
}
