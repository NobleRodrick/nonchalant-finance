import Link from "next/link";
import { Beer, PackagePlus, Search, ShoppingCart, Truck } from "lucide-react";
import { pageDate } from "@/lib/page-guards";
import { tradeDashboard } from "@/lib/trade/queries";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney, formatRate } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { AttentionList } from "@/components/kit/attention-list";
import { ValueBars } from "@/components/charts/value-bars";


/** The sales & stock part of a dashboard (shop, bar, other activity). */
export async function TradeSections({ page, d }) {
  const { department, domain } = page;
  const base = `/d/${department.id}`;
  const m = d.month;
  return (
    <>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Today</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="trade-today">
          <StatCard tone="dark" label="Sales today" value={formatMoney(d.today.net)} hint={`${d.today.count} sale(s) · basket ${formatMoney(d.today.basket)}`} href={`${base}/sell`} />
          <StatCard tone="in" label="Cash" value={formatMoney(d.today.byMethod.CASH)} hint={`MoMo ${formatMoney(d.today.byMethod.MOMO)} · bank ${formatMoney(d.today.byMethod.BANK_TRANSFER + d.today.byMethod.OTHER)}`} />
          <StatCard tone={d.today.byMethod.CREDIT ? "warn" : "default"} label="On credit today" value={formatMoney(d.today.byMethod.CREDIT)} href={`${base}/debts`} />
          <StatCard label="Margin today" value={formatMoney(d.today.margin)} hint={d.today.marginPct !== null ? `${d.today.marginPct} % of sales` : "no sale yet"} />
        </div>
      </div>
      <div className="space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">This month · stock · credit</h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="trade-month">
          <StatCard label="Sales this month" value={formatMoney(m.net)} hint={`${m.count} sale(s)`} href={`${base}/reports`} />
          <StatCard tone={m.margin < 0 ? "out" : "in"} label="Gross margin" value={formatMoney(m.margin)} hint={m.marginPct !== null ? `${formatRate(m.marginPct)} · cost of goods ${formatMoney(m.cost)}` : undefined} href={`${base}/reports`} />
          <StatCard label="Stock value (at cost)" value={formatMoney(d.stock.value)} hint={`${d.stock.products} product(s)${d.stock.low + d.stock.empty ? ` · ${d.stock.low + d.stock.empty} low or out` : ""}`} tone={d.stock.empty ? "warn" : "default"} href={`${base}/stock`} />
          <StatCard tone={d.debts.overdue ? "out" : d.debts.owed ? "warn" : "default"} label="Customers owe" value={formatMoney(d.debts.owed)} hint={`${d.debts.count} debt(s)${d.debts.overdue ? ` · overdue ${formatMoney(d.debts.overdue)}` : ""}`} href={`${base}/debts`} />
          <StatCard tone={d.bills.count ? "warn" : "default"} label="Owed to suppliers" value={formatMoney(d.bills.owed)} hint={`${d.bills.count} bill(s)`} href={`${base}/purchases?tab=bills`} />
          {d.crates ? <StatCard label="Crates to give back" value={d.crates.owedToSuppliers} hint={`deposits ${formatMoney(d.crates.depositsWithSuppliers)}`} href={`${base}/crates`} /> : null}
          {domain.tabs ? <StatCard tone={d.tabs.length ? "info" : "default"} label="Open tabs" value={d.tabs.length} hint={formatMoney(d.tabs.reduce((s, t) => s + t.total, 0))} href={`${base}/sell`} /> : null}
        </div>
      </div>
      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Sales, last 14 days" actions={<Link href={`${base}/reports`} className="text-sm underline">Reports</Link>}>
          <ValueBars data={d.days.map((x) => ({ label: formatDateKey(x.dateKey, { weekday: false }).slice(0, 6), value: x.amount }))} empty="No sale yet." />
        </Section>
        <Section title="Best sellers this month" bodyClassName="p-0">
          <DataTable dense rows={m.byProduct.slice(0, 8)} empty="No sale this month." columns={[{ key: "n", label: domain.words.item, render: (p) => <Link className="hover:underline" href={`${base}/products/${p.id}`}>{p.name}</Link> }, { key: "q", label: "Sold", align: "right", render: (p) => `${p.quantity} ${p.unit || ""}` }, { key: "r", label: "Sales", align: "right", render: (p) => <Money value={p.revenue} suffix={false} /> }, { key: "m", label: "Margin", align: "right", render: (p) => <Money value={p.margin} suffix={false} /> }]} />
        </Section>
      </div>
      {d.lowProducts.length ? (
        <Section title="To buy" description="Out of stock or at their low-stock level" bodyClassName="p-0" actions={<Link href={`${base}/purchases`} className="text-sm underline">Record a purchase</Link>}>
          <DataTable dense rows={d.lowProducts} columns={[{ key: "n", label: domain.words.item, render: (p) => <Link className="hover:underline" href={`${base}/products/${p.id}`}>{p.name}</Link> }, { key: "q", label: "Left", align: "right", render: (p) => <span className={p.empty ? "font-semibold text-rose-700" : "text-amber-700"}>{p.quantity} {p.unit}</span> }, { key: "l", label: "Warn at", align: "right", render: (p) => p.lowStock || "—" }, { key: "s", label: "Usual supplier", render: (p) => p.supplierName || "—" }]} />
        </Section>
      ) : null}
    </>
  );
}

/** Dashboard of a shop or a bar (an other activity adds its jobs: components/services). */
export async function TradeHome({ page, extra = null }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const d = await tradeDashboard({ department, todayKey, timeZone });
  const base = `/d/${department.id}`;
  const warnings = [...d.warnings, ...(extra?.warnings || [])];
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={formatDateKey(todayKey)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/search`}><Button variant="outline"><Search className="h-4 w-4" /> Search</Button></Link>
            {perms.purchases ? <Link href={`${base}/purchases`}><Button variant="outline"><Truck className="h-4 w-4" /> Purchase</Button></Link> : null}
            {perms.manageStock ? <Link href={`${base}/products`}><Button variant="outline"><PackagePlus className="h-4 w-4" /> {domain.words.items}</Button></Link> : null}
            {perms.sell ? <Link href={`${base}/sell`}><Button>{domain.tabs ? <Beer className="h-4 w-4" /> : <ShoppingCart className="h-4 w-4" />} Sell</Button></Link> : null}
          </div>
        }
      />
      <Section title="Alerts" description={warnings.length ? `${warnings.length} point(s) to look at` : undefined}>
        <AttentionList warnings={warnings} base={base} empty="Nothing needs attention: stock, tabs, customers' debts and suppliers' bills are in order." />
      </Section>
      <TradeSections page={page} d={d} />
      {extra?.body || null}
    </div>
  );
}
