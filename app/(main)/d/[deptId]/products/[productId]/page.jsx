import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { productCard } from "@/lib/trade/queries";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { DataTable, KeyValues, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";

export const dynamic = "force-dynamic";
export const metadata = { title: "Product" };

/** A product's stock card: details and every movement (opening, purchases, sales, counts, losses). */
export default async function ProductPage({ params }) {
  const { deptId, productId } = await params;
  const { user, department, domain } = await departmentPage(deptId, { module: "products" });
  const { timeZone } = pageDate(user, null);
  const card = await productCard({ departmentId: department.id, productId, timeZone });
  if (!card) notFound();
  const p = card.product;
  return (
    <div className="space-y-5">
      <Link href={`/d/${department.id}/products`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> {domain.words.catalog}</Link>
      <PageHeader eyebrow={`${p.code}${p.barcode ? ` · ${p.barcode}` : ""}`} title={p.name} description={[p.category, p.kind === "SERVICE" ? "service" : `sold by the ${p.unit}`, p.isActive ? null : "archived"].filter(Boolean).join(" · ")} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Sale price" value={formatMoney(p.salePrice)} hint={p.marginPct !== null ? `margin ${p.marginPct} %` : undefined} />
        <StatCard label="Average cost" value={formatMoney(p.costPrice)} />
        <StatCard tone={p.empty ? "out" : p.low ? "warn" : "default"} label="In stock" value={p.kind === "SERVICE" ? "—" : `${p.quantity} ${p.unit}`} hint={p.lowStock ? `warning at ${p.lowStock}` : undefined} />
        <StatCard label="Value at cost" value={formatMoney(p.value)} />
      </div>
      <Section title="Details">
        <KeyValues rows={[{ label: "Usual supplier", value: p.supplierName || "—" }, { label: "Units in a pack", value: p.unitsPerPack }, { label: "Crate", value: p.packaging || "—" }]} />
      </Section>
      <Section title="Stock card" description="Every movement, newest first: the stock is the sum of the quantities." bodyClassName="p-0">
        <DataTable
          dense
          rows={card.movements}
          empty="No movement yet."
          columns={[
            { key: "d", label: "Date", render: (m) => `${formatDateKey(m.dateKey, { weekday: false })} ${m.time}` },
            { key: "k", label: "What", render: (m) => m.label },
            { key: "q", label: "Quantity", align: "right", render: (m) => <span className={m.quantity < 0 ? "text-rose-700" : "text-emerald-700"}>{m.quantity > 0 ? "+" : ""}{m.quantity}</span> },
            { key: "c", label: "Unit cost", align: "right", render: (m) => <Money value={m.unitCost} suffix={false} /> },
            { key: "v", label: "Value", align: "right", render: (m) => <Money value={m.value} suffix={false} /> },
            { key: "n", label: "Note", render: (m) => <span className="text-xs">{m.note}</span> },
            { key: "b", label: "By", render: (m) => <span className="text-xs">{m.by}</span> },
          ]}
        />
      </Section>
    </div>
  );
}
