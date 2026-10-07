import { Boxes, CircleAlert, PackageCheck, Truck, Wrench } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { itemCategories, stockSheet, stockTotals } from "@/lib/rental/item-queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { StockSheet } from "@/components/rental/stock/stock-sheet";
import { TradeStockPage } from "@/components/trade/pages/trade-products-page";
import { TRADE_DOMAINS } from "@/lib/domains/trade";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock" };

const STATUSES = [
  { value: "", label: "In use" },
  { value: "low", label: "Low or empty" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "Everything" },
];

/** Event rental: the stock sheet (every item, its units by state, prices and value). */
export default async function StockPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const page = await departmentPage(deptId, { module: "stock" });
  if (TRADE_DOMAINS.includes(page.department.domain)) return <TradeStockPage page={page} searchParams={sp} />;
  const { user, department, domain, perms } = page;
  const { todayKey } = pageDate(user, null);
  const [items, categories] = await Promise.all([
    stockSheet({ departmentId: department.id, q: sp?.q, category: sp?.category, status: sp?.status || "active" }),
    itemCategories(department.id),
  ]);
  const t = stockTotals(items);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Stock" description="Every item with its units in the store, out at events, damaged, in repair and missing. Quantities follow bookings, returns, purchases and corrections automatically." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <StatCard label="Units in the store" value={t.inStock} hint={`of ${t.owned} owned · ${t.lines} items`} icon={PackageCheck} />
        <StatCard label="Out at events" value={t.out} icon={Truck} tone={t.out ? "info" : "default"} />
        <StatCard label="Damaged or in repair" value={t.damaged + t.inRepair} hint={`${t.inRepair} in repair`} icon={Wrench} tone={t.damaged + t.inRepair ? "warn" : "default"} />
        <StatCard label="Missing" value={t.missing} icon={CircleAlert} tone={t.missing ? "out" : "default"} />
        <StatCard label="Stock value" value={formatMoney(t.value)} hint={t.low ? `${t.low} item(s) low` : "at purchase prices"} icon={Boxes} tone={t.low ? "warn" : "default"} />
      </div>
      <FilterBar
        fields={[
          { name: "q", label: "Search", type: "search", placeholder: "Name, code, supplier, place…" },
          { name: "category", label: "Category", type: "select", options: [{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))] },
          { name: "status", label: "Show", type: "select", options: STATUSES },
        ]}
      />
      <StockSheet departmentId={department.id} items={serialize(items)} categories={categories} canManage={perms.rentalManage} canExport={perms.export} todayKey={todayKey} />
    </div>
  );
}
