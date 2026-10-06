import { pageDate } from "@/lib/page-guards";
import { assetRegister, registerTotals } from "@/lib/assets/asset-queries";
import { bookableItems } from "@/lib/rental/item-queries";
import { isDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { AssetBoard } from "./asset-board";

/** Event rental: the asset register with depreciation on a date (?asof=, ?status=, ?q=). */
export async function RentalAssetsPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey } = pageDate(user, null);
  const asOfKey = isDateKey(sp?.asof) ? sp.asof : todayKey;
  const [assets, items] = await Promise.all([assetRegister({ departmentId: department.id, asOfKey, status: sp?.status || "active", q: sp?.q }), bookableItems(department.id)]);
  const t = registerTotals(assets);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Assets" description="Long-term assets (lighting, structures, chairs and tables bought in bulk, vehicles, machines…) with their depreciation: original cost, per month, accumulated, book value and remaining life." />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Assets" value={t.count} />
        <StatCard label="Original cost" value={formatMoney(t.cost)} />
        <StatCard label="Depreciation per month" value={formatMoney(t.monthly)} hint={`${formatMoney(t.accumulated)} so far`} />
        <StatCard label="Book value" value={formatMoney(t.bookValue)} tone="dark" />
      </div>
      <FilterBar fields={[{ name: "q", label: "Search", type: "search", placeholder: "Name, code, category, place…" }, { name: "asof", label: "Values on", type: "date" }, { name: "status", label: "Show", type: "select", options: [{ value: "", label: "In use" }, { value: "disposed", label: "Disposed of" }, { value: "all", label: "Everything" }] }]} />
      <AssetBoard departmentId={department.id} assets={serialize(assets)} items={serialize(items)} canManage={perms.rentalManage} canDispose={perms.archive} canExport={perms.export} todayKey={todayKey} asOfKey={asOfKey} />
    </div>
  );
}
