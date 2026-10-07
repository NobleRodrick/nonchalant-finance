import Link from "next/link";
import { pageDate } from "@/lib/page-guards";
import { productionReport, recipeBoard } from "@/lib/production/queries";
import { formatMoney } from "@/lib/format";
import { DataTable, Money, Section } from "@/components/kit/primitives";
import { TradeHome } from "@/components/trade/trade-home";

/** Dashboard of a production department: sales and stock, plus production of the month and recipes. */
export async function ProductionHome({ page }) {
  const { user, department } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const [report, recipes] = await Promise.all([productionReport({ departmentId: department.id, fromKey: `${todayKey.slice(0, 7)}-01`, toKey: todayKey, timeZone }), recipeBoard({ departmentId: department.id })]);
  const base = `/d/${department.id}`;
  const blocked = recipes.filter((r) => r.rounds < 1);
  const warnings = blocked.length ? [{ key: "materials", tone: "warn", count: blocked.length, title: `${blocked.length} product(s) cannot be made now`, detail: "Not enough raw materials for one round of the recipe: buy them.", href: "/recipes", rows: blocked.map((r) => ({ id: r.id, label: r.product, note: r.lines.filter((l) => l.inStock < l.quantity).map((l) => l.name).join(", ") })) }] : [];
  const body = (
    <div className="grid gap-6 xl:grid-cols-2">
      <Section title="Production this month" description={`${report.batches} batch(es) · materials ${formatMoney(report.cost)}`} bodyClassName="p-0" actions={<Link className="text-sm underline" href={`${base}/production`}>Production</Link>}>
        <DataTable dense rows={report.byProduct} rowKey={(p) => p.productId} empty="Nothing made yet this month." columns={[{ key: "n", label: "Product", render: (p) => p.name }, { key: "m", label: "Made", align: "right", render: (p) => `${p.produced} ${p.unit || ""}` }, { key: "u", label: "Unit cost", align: "right", render: (p) => <Money value={p.unitCost} suffix={false} /> }, { key: "w", label: "Waste", align: "right", render: (p) => (p.waste ? `${p.waste} (${p.wastePct} %)` : "—") }]} />
      </Section>
      <Section title="Recipes" description="Cost and margin at today's material costs" bodyClassName="p-0" actions={<Link className="text-sm underline" href={`${base}/recipes`}>Recipes</Link>}>
        <DataTable dense rows={recipes} empty="No recipe yet." columns={[{ key: "n", label: "Product", render: (r) => r.product }, { key: "u", label: "Unit cost", align: "right", render: (r) => <Money value={r.unitCost} suffix={false} /> }, { key: "m", label: "Margin", align: "right", render: (r) => (r.margin !== null ? <span className={r.margin < 0 ? "text-rose-700" : ""}>{r.marginPct} %</span> : "—") }, { key: "r", label: "Rounds possible", align: "right", render: (r) => <span className={r.rounds < 1 ? "font-semibold text-rose-700" : ""}>{r.rounds}</span> }]} />
      </Section>
    </div>
  );
  return <TradeHome page={page} extra={{ warnings, body }} />;
}
