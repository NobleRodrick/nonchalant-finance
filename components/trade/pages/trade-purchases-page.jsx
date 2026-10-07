import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { billsDue, crateBoard, productList, purchaseList } from "@/lib/trade/queries";
import { vatOn } from "@/lib/accounting/rules";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { TradePurchasesBoard } from "@/components/trade/purchases-board";

/** Shop, bar, other: purchases of a period (stock in at cost) and supplier bills to pay. */
export async function TradePurchasesPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp || {}, todayKey, "month");
  const bar = department.domain === "BAR";
  const [purchases, bills, products, crates, company, names] = await Promise.all([
    purchaseList({ departmentId: department.id, fromKey: range.fromKey, toKey: range.toKey, timeZone }),
    billsDue({ departmentId: department.id, timeZone }),
    productList({ departmentId: department.id }),
    bar ? crateBoard({ departmentId: department.id, timeZone }) : null,
    department.companyId ? db.company.findUnique({ where: { id: department.companyId } }) : null,
    db.tradePurchase.findMany({ where: { departmentId: department.id }, distinct: ["supplierName"], select: { supplierName: true }, take: 300 }),
  ]);
  const live = purchases.filter((p) => !p.voided);
  const suppliers = [...new Set([...names.map((n) => n.supplierName), ...products.map((p) => p.supplierName).filter(Boolean)])].sort();
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Purchases & suppliers" description={`${periodLabel(range)}. Goods bought enter the stock at their cost. Paid now (cash, Mobile Money, bank) or on credit: the supplier's bill is paid later from here.`}>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Bought this period" value={formatMoney(live.reduce((s, p) => s + p.total, 0))} hint={`${live.length} purchase(s)`} />
        <StatCard label="Of which on credit" value={formatMoney(live.filter((p) => p.method === "CREDIT").reduce((s, p) => s + p.total, 0))} />
        <StatCard tone={bills.length ? "warn" : "default"} label="Owed to suppliers" value={formatMoney(bills.reduce((s, b) => s + b.balance, 0))} hint={`${bills.length} bill(s)`} />
        {bar ? <StatCard label="Crates to give back" value={crates.totals.owedToSuppliers} hint={`deposits ${formatMoney(crates.totals.depositsWithSuppliers)}`} href={`/d/${department.id}/crates`} /> : <StatCard label="Suppliers" value={new Set(live.map((p) => p.supplier)).size} />}
      </div>
      <TradePurchasesBoard
        departmentId={department.id}
        purchases={serialize(purchases)}
        bills={serialize(bills)}
        products={serialize(products.filter((p) => p.isActive && p.kind !== "SERVICE"))}
        packagings={serialize(crates?.crates.filter((c) => c.isActive) || [])}
        suppliers={suppliers}
        perms={perms}
        vat={Boolean(vatOn(company, todayKey))}
        bar={bar}
        initialTab={sp?.tab === "bills" ? "bills" : "purchases"}
        fileName={`${department.name} purchases ${range.fromKey} ${range.toKey}`}
      />
    </div>
  );
}
