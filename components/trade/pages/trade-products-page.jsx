import { Boxes, CircleAlert, PackageX, Tags } from "lucide-react";
import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { productCategories, productList, stockTotals } from "@/lib/trade/queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { ProductBoard } from "@/components/trade/product-board";

const STATUSES = [
  { value: "", label: "On sale" },
  { value: "low", label: "Low or out of stock" },
  { value: "archived", label: "Archived" },
  { value: "all", label: "Everything" },
];

async function load(page, sp) {
  const { department } = page;
  const [products, categories, packagings] = await Promise.all([
    productList({ departmentId: department.id, q: sp?.q, category: sp?.category, status: sp?.status || "active" }),
    productCategories(department.id),
    department.domain === "BAR" ? db.tradePackaging.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true, deposit: true }, orderBy: { name: "asc" } }) : [],
  ]);
  return { products, categories, packagings };
}

function Filters({ categories, placeholder }) {
  return (
    <FilterBar
      fields={[
        { name: "q", label: "Search", type: "search", placeholder },
        { name: "category", label: "Category", type: "select", options: [{ value: "", label: "All categories" }, ...categories.map((c) => ({ value: c, label: c }))] },
        { name: "status", label: "Show", type: "select", options: STATUSES },
      ]}
    />
  );
}

/** The catalogue: products (and services) with their prices, barcodes, categories, margins. */
export async function TradeProductsPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey } = pageDate(user, null);
  const { products, categories, packagings } = await load(page, sp);
  const t = stockTotals(products);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={domain.words.catalog} description="What you sell: name, barcode, category, sale price and the average cost (it follows each purchase). The margin is the sale price minus the cost." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label={domain.words.items} value={t.products + t.services} hint={t.services ? `${t.services} service(s)` : undefined} icon={Tags} />
        <StatCard label="Stock value at cost" value={formatMoney(t.value)} hint={`${formatMoney(t.retailValue)} at sale prices`} icon={Boxes} />
        <StatCard label="Running low" value={t.low} tone={t.low ? "warn" : "default"} icon={CircleAlert} href={`/d/${department.id}/stock?status=low`} />
        <StatCard label="Out of stock" value={t.empty} tone={t.empty ? "out" : "default"} icon={PackageX} href={`/d/${department.id}/stock?status=low`} />
      </div>
      <Filters categories={categories} placeholder="Name, code, barcode, category, supplier…" />
      <ProductBoard departmentId={department.id} domain={department.domain} mode="products" products={serialize(products)} categories={categories} packagings={packagings} perms={perms} words={domain.words} fileName={`${department.name} products ${todayKey}`} />
    </div>
  );
}

/** The stock sheet: quantities, average cost, value, low stock; counts and losses with a reason. */
export async function TradeStockPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey } = pageDate(user, null);
  const { products, categories, packagings } = await load(page, sp);
  const goods = products.filter((p) => p.kind !== "SERVICE");
  const t = stockTotals(goods);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Stock" description="Quantities follow purchases, sales, tabs and counts on their own. Count the shelves regularly: a count or a loss needs a reason and shows in the reports." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Stock value at cost" value={formatMoney(t.value)} hint={`${t.products} product(s)`} icon={Boxes} />
        <StatCard label="At sale prices" value={formatMoney(t.retailValue)} hint={`expected margin ${formatMoney(t.retailValue - t.value)}`} />
        <StatCard label="Running low" value={t.low} tone={t.low ? "warn" : "default"} icon={CircleAlert} />
        <StatCard label="Out of stock" value={t.empty} tone={t.empty ? "out" : "default"} icon={PackageX} />
      </div>
      <Filters categories={categories} placeholder="Name, code, barcode…" />
      <ProductBoard departmentId={department.id} domain={department.domain} mode="stock" products={serialize(goods)} categories={categories} packagings={packagings} perms={perms} words={domain.words} fileName={`${department.name} stock ${todayKey}`} />
    </div>
  );
}
