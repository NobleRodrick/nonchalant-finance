import { pageDate } from "@/lib/page-guards";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { tradeReport } from "@/lib/trade/queries";
import { serviceReport } from "@/lib/services/queries";
import { exportFileName } from "@/lib/export/table-export";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { PrintButton } from "@/components/kit/print-button";
import { ValueBars } from "@/components/charts/value-bars";
import { IncomeStatement, Ranked } from "@/components/trade/report-parts";
import { TableExport } from "@/components/trade/table-export";

const METHOD = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank / card", OTHER: "Other", CREDIT: "On credit" };

/** Sales, margins, purchases, stock, losses, credit (shop, bar, other). */
function TradeSections({ r, base, words }) {
  const s = r.sales;
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="trade-report">
        <StatCard tone="dark" label="Sales" value={formatMoney(s.net)} hint={`${s.count} sale(s) · basket ${formatMoney(s.basket)}${s.discounts ? ` · discounts ${formatMoney(s.discounts)}` : ""}`} />
        <StatCard label="Cost of goods sold" value={formatMoney(s.cost)} hint="at average cost" />
        <StatCard tone={s.margin < 0 ? "out" : "in"} label="Gross margin" value={formatMoney(s.margin)} hint={s.marginPct !== null ? `${s.marginPct} % of sales` : undefined} />
        <StatCard label="Goods bought" value={formatMoney(r.purchases.amount)} hint={`${r.purchases.count} purchase(s)${r.purchases.onCredit ? ` · ${formatMoney(r.purchases.onCredit)} on credit` : ""}`} href={`${base}/purchases`} />
        <StatCard label="Stock value now" value={formatMoney(r.stock.value)} hint={`${r.stock.low + r.stock.empty} low or out of stock`} href={`${base}/stock`} />
        <StatCard tone={r.losses.lost ? "out" : "default"} label="Goods lost / counted short" value={formatMoney(r.losses.lost)} hint={r.losses.found ? `found in counts ${formatMoney(r.losses.found)}` : undefined} />
        <StatCard tone={r.credit.overdue ? "out" : r.credit.owed ? "warn" : "default"} label="Customers owe" value={formatMoney(r.credit.owed)} hint={`given ${formatMoney(r.credit.given)} · repaid ${formatMoney(r.credit.repaid)} this period`} href={`${base}/debts`} />
        {r.crates ? <StatCard label="Crates owed back" value={r.crates.owedToSuppliers} hint={`deposits ${formatMoney(r.crates.depositsWithSuppliers)} · broken ${formatMoney(r.crates.depositLost)}`} href={`${base}/crates`} /> : null}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Sales by day">
          <ValueBars data={s.byDay.map((d) => ({ label: formatDateKey(d.dateKey, { weekday: false }).slice(0, 6), value: d.amount }))} />
        </Section>
        <Section title="How customers paid" bodyClassName="p-0">
          <DataTable dense rows={Object.entries(s.byMethod).filter(([, v]) => v).map(([k, v]) => ({ id: k, k, v }))} empty="No sale." columns={[{ key: "m", label: "Method", render: (x) => METHOD[x.k] || x.k }, { key: "a", label: "Amount", align: "right", render: (x) => <Money value={x.v} suffix={false} /> }, { key: "p", label: "Share", align: "right", render: (x) => `${s.net ? Math.round((x.v / s.net) * 100) : 0} %` }]} />
        </Section>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Ranked title={`Margin by ${words.item.toLowerCase()}`} description="Best sellers first" rows={s.byProduct} cols={[[words.item, "name"], ["Sold", "quantity"], ["Sales", "revenue", true], ["Cost", "cost", true], ["Margin", "margin", true]]} />
        <div className="space-y-6">
          <Ranked title="By category" rows={s.byCategory} cols={[["Category", "name"], ["Sales", "revenue", true], ["Margin", "margin", true]]} />
          <Ranked title="By cashier" rows={s.byCashier} cols={[["Cashier", "name"], ["Sales", "sales"], ["Amount", "amount", true], ["Discounts", "discounts", true]]} />
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Ranked title="Purchases by supplier" rows={r.purchases.bySupplier} cols={[["Supplier", "name"], ["Purchases", "purchases"], ["Amount", "amount", true], ["On credit", "onCredit", true]]} />
        <Section title="Losses and counts" bodyClassName="p-0">
          <DataTable dense rows={r.losses.rows} empty="No loss or count correction." columns={[{ key: "d", label: "Date", render: (x) => formatDateKey(x.dateKey, { weekday: false }) }, { key: "p", label: words.item, render: (x) => x.product }, { key: "q", label: "Quantity", align: "right", render: (x) => `${x.quantity} ${x.unit}` }, { key: "v", label: "Value", align: "right", render: (x) => <Money value={x.value} suffix={false} /> }, { key: "n", label: "Why", render: (x) => <span className="text-xs">{x.note}</span> }]} />
        </Section>
      </div>
    </>
  );
}

/** Tickets, services, washers, turnaround (pressing, car wash, jobs). */
function ServiceSectionsReport({ r, base, domain }) {
  const t = r.tickets;
  const carWash = domain.key === "CAR_WASH";
  return (
    <>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="service-report">
        <StatCard tone="dark" label={carWash ? "Washes" : "Tickets collected"} value={t.collected} hint={`${formatMoney(t.revenue)} · average ${formatMoney(t.average)} · ${t.received} received`} />
        <StatCard tone="in" label="Money received" value={formatMoney(r.money.received - r.money.refunded)} hint={r.money.refunded ? `after ${formatMoney(r.money.refunded)} refunded` : undefined} />
        <StatCard label="Time to be ready" value={t.turnaroundHours === null ? "—" : `${t.turnaroundHours} h`} hint="average, received → ready" />
        <StatCard label="Express" value={t.express} hint={`surcharges ${formatMoney(t.surcharges)}`} />
        <StatCard label="Discounts" value={formatMoney(t.discounts)} hint={t.loyalty.count ? `+ ${t.loyalty.count} free (loyalty) worth ${formatMoney(t.loyalty.value)}` : undefined} />
        <StatCard tone={t.cancelled ? "warn" : "default"} label="Cancelled" value={t.cancelled} hint={t.kept ? `${formatMoney(t.kept)} kept` : undefined} href={`${base}/tickets?view=cancelled`} />
        <StatCard tone={r.owing.amount ? "out" : "default"} label="Left without paying (all)" value={formatMoney(r.owing.amount)} hint={`${r.owing.rows.length} ticket(s)`} href={`${base}/tickets?view=owing`} />
        {domain.key === "PRESSING" ? <StatCard tone={r.money.compensations ? "out" : "default"} label="Damage compensations" value={formatMoney(r.money.compensations)} hint={`${r.money.compensationCount} claim(s)`} /> : <StatCard label="Commissions earned" value={formatMoney(r.workers.reduce((s, w) => s + w.period.commission, 0))} href={`${base}/workers`} />}
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Ranked title="By service" rows={r.byService} cols={[["Service", "name"], ["Lines", "lines"], ["Quantity", "quantity"], ["Revenue", "revenue", true]]} />
        <Ranked title={`By ${(domain.variantsLabel || "option").toLowerCase()}`} rows={r.byVariant} cols={[[domain.variantsLabel || "Option", "name"], ["Quantity", "quantity"], ["Revenue", "revenue", true]]} />
      </div>
      {carWash ? (
        <Section title="Washers" bodyClassName="p-0">
          <DataTable dense rows={r.workers} empty="No wash with a washer." columns={[{ key: "n", label: "Washer", render: (w) => w.name }, { key: "t", label: "Washes", align: "right", render: (w) => w.period.tickets }, { key: "r", label: "Work done", align: "right", render: (w) => <Money value={w.period.revenue} suffix={false} /> }, { key: "c", label: "Earned", align: "right", render: (w) => <Money value={w.period.commission} suffix={false} /> }, { key: "o", label: "Owed now", align: "right", render: (w) => <Money value={w.owed} suffix={false} /> }]} />
        </Section>
      ) : null}
      {!carWash && r.unclaimed.length ? (
        <Section title="Unclaimed" description={`Ready for ${r.settings.unclaimedDays} days or more`} bodyClassName="p-0">
          <DataTable dense rows={r.unclaimed} columns={[{ key: "r", label: "Ticket", render: (x) => x.referenceNo }, { key: "c", label: "Customer", render: (x) => `${x.customer || "—"} ${x.phone || ""}` }, { key: "d", label: "Ready since", render: (x) => x.readyKey }, { key: "b", label: "To pay", align: "right", render: (x) => <Money value={x.balance} suffix={false} /> }]} />
        </Section>
      ) : null}
    </>
  );
}

/** Reports of a shop, bar, pressing, car wash or other activity for any period. */
export async function TradeReportsPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp || {}, todayKey, "month");
  const args = { department, organizationId: user.organizationId, fromKey: range.fromKey, toKey: range.toKey, timeZone, todayKey };
  const sells = domain.engine !== "SERVICES";
  const jobs = domain.engine !== "TRADE";
  const [t, s] = await Promise.all([sells ? tradeReport(args) : null, jobs ? serviceReport(args) : null]);
  const income = (t || s).income;
  const prev = (t || s).statements.previous;
  const base = `/d/${department.id}`;
  const sheets = [
    { name: "Income statement", headers: ["Line", "Amount"], rows: [["Sales", income.salesGross], ["Discounts", -income.discounts], ["Services", income.servicesRevenue], ["Kept on cancellations", income.cancellationIncome], ["Other income", income.otherIncome], ["Total income", income.moneyIn], ["Goods bought", income.purchases], ["Change in stock", income.stockChange], ["Expenses", income.expenses], ["Other expenses", income.otherExpenses], ["Assets lost", income.assetLosses], ["Total costs", income.moneyOut], ["Profit", income.result]] },
    ...(t ? [{ name: "Products", headers: ["Product", "Category", "Sold", "Sales", "Cost", "Margin"], rows: t.sales.byProduct.map((p) => [p.name, p.category, p.quantity, p.revenue, p.cost, p.margin]) }, { name: "Purchases", headers: ["Supplier", "Purchases", "Amount", "On credit"], rows: t.purchases.bySupplier.map((x) => [x.name, x.purchases, x.amount, x.onCredit]) }, { name: "Stock", headers: ["Code", "Product", "In stock", "Unit", "Average cost", "Value"], rows: t.stock.rows.map((p) => [p.code, p.name, p.quantity, p.unit, p.costPrice, p.value]) }] : []),
    ...(s ? [{ name: "Services", headers: ["Service", "Lines", "Quantity", "Revenue"], rows: s.byService.map((x) => [x.name, x.lines, x.quantity, x.revenue]) }, { name: "Washers", headers: ["Washer", "Tickets", "Work done", "Earned", "Owed"], rows: s.workers.map((w) => [w.name, w.period.tickets, w.period.revenue, w.period.commission, w.owed]) }] : []),
  ];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title="Reports"
        description={`${periodLabel(range)}. ${sells ? "Sales count on their day; the cost of goods sold follows the average cost. " : ""}${jobs ? "Tickets are income on the day they are collected; payments before are advances. " : ""}Deposits are never income.`}
        actions={<div className="flex gap-2">{perms.export ? <TableExport fileName={exportFileName(department.name, "report", range.fromKey, range.toKey)} sheets={sheets} /> : null}<PrintButton /></div>}
      >
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      {t ? <TradeSections r={t} base={base} words={domain.words} /> : null}
      {s ? (sells ? <h2 className="text-lg font-semibold">Jobs</h2> : null) : null}
      {s ? <ServiceSectionsReport r={s} base={base} domain={domain} /> : null}
      <div className="grid gap-6 xl:grid-cols-2">
        <IncomeStatement income={income} previousLabel={prev ? `${formatDateKey(prev.fromKey, { weekday: false })} – ${formatDateKey(prev.toKey, { weekday: false })}` : null} />
        {t ? (
          <Section title="Who owes the most" bodyClassName="p-0">
            <DataTable dense rows={t.credit.rows.slice(0, 10)} empty="Nobody owes anything." columns={[{ key: "n", label: "Customer", render: (d) => d.debtor }, { key: "d", label: "Since", render: (d) => d.dateKey }, { key: "due", label: "Due", render: (d) => (d.dueKey ? <span className={d.overdue ? "text-rose-700" : ""}>{d.dueKey}</span> : "—") }, { key: "b", label: "Owes", align: "right", render: (d) => <Money value={d.balance} suffix={false} /> }]} />
          </Section>
        ) : (
          <Section title="Left without paying" bodyClassName="p-0">
            <DataTable dense rows={s.owing.rows.slice(0, 10)} empty="Nobody left owing." columns={[{ key: "r", label: "Ticket", render: (x) => x.referenceNo }, { key: "c", label: "Customer", render: (x) => x.customer || x.plate || "—" }, { key: "d", label: "Collected", render: (x) => x.collectedKey }, { key: "b", label: "Owes", align: "right", render: (x) => <Money value={x.balance} suffix={false} /> }]} />
          </Section>
        )}
      </div>
    </div>
  );
}
