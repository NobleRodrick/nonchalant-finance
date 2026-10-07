import { departmentPage, pageDate } from "@/lib/page-guards";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { batchList, productionReport, recipeBoard } from "@/lib/production/queries";
import { productList } from "@/lib/trade/queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { ProductionBoard } from "@/components/production/production-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Production" };

/** Production: batches of a period (materials used, good units made, cost per unit, waste). */
export default async function ProductionPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "production" });
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const [batches, report, recipes, products] = await Promise.all([
    batchList({ departmentId: department.id, fromKey: range.fromKey, toKey: range.toKey, timeZone }),
    productionReport({ departmentId: department.id, fromKey: range.fromKey, toKey: range.toKey, timeZone }),
    recipeBoard({ departmentId: department.id }),
    productList({ departmentId: department.id }),
  ]);
  const made = products.filter((p) => p.kind === "GOODS");
  const materials = products.filter((p) => p.kind !== "SERVICE");
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Production" description={`${periodLabel(range)}. Each batch takes its materials out of the stock and puts the good units in at their real cost: fewer good units (waste) means a higher cost per unit.`}>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Batches" value={report.batches} />
        <StatCard label="Cost of materials used" value={formatMoney(report.cost)} />
        <StatCard label="Products made" value={report.byProduct.length} hint={report.byProduct.slice(0, 3).map((p) => `${p.name}: ${p.produced}`).join(" · ") || undefined} />
        <StatCard tone={report.byProduct.some((p) => p.wastePct >= 5) ? "warn" : "default"} label="Waste" value={`${report.byProduct.reduce((s, p) => s + p.waste, 0)}`} hint="units planned but not made" />
      </div>
      <ProductionBoard departmentId={department.id} batches={serialize(batches)} products={serialize(made)} materials={serialize(materials)} recipes={serialize(recipes)} canRecord={perms.manageStock} canVoid={perms.void} />
    </div>
  );
}
