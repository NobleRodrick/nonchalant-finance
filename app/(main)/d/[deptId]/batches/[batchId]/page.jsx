import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { batchDetail } from "@/lib/farm/queries";
import { productList } from "@/lib/trade/queries";
import { serialize } from "@/lib/serialize";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { DataTable, KeyValues, Money, PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { BatchActions } from "@/components/farm/batch-dialogs";
import { BatchEvents } from "@/components/farm/batch-events";

export const dynamic = "force-dynamic";
export const metadata = { title: "Batch" };

/** One farm batch: its figures, every record, its sales and expenses, and what can be done. */
export default async function BatchPage({ params }) {
  const { deptId, batchId } = await params;
  const { user, department, perms } = await departmentPage(deptId, { module: "batches" });
  const { todayKey, timeZone } = pageDate(user, null);
  const d = await batchDetail({ departmentId: department.id, batchId, todayKey, timeZone });
  if (!d) notFound();
  const b = d.batch;
  const f = b.figures;
  const [products, debtors] = await Promise.all([
    productList({ departmentId: department.id }),
    db.debtor.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
  ]);
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <Link href={`${base}/batches`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline"><ArrowLeft className="h-4 w-4" /> Batches & fields</Link>
      <PageHeader eyebrow={`${b.referenceNo} · ${b.kindLabel}`} title={b.name} description={`Started ${formatDateKey(b.startKey, { weekday: false })} · day ${b.age}${b.expectedEndKey ? ` · expected end ${formatDateKey(b.expectedEndKey, { weekday: false })}` : ""}${b.closedKey ? ` · closed ${formatDateKey(b.closedKey, { weekday: false })}` : ""}`}>
        <div className="mt-2">{b.status === "ACTIVE" ? <Pill tone="emerald">active</Pill> : <Pill>closed</Pill>}</div>
      </PageHeader>
      <BatchActions departmentId={department.id} batch={serialize(b)} inputs={serialize(products.filter((p) => p.kind === "RAW" && p.isActive))} produce={serialize(products.filter((p) => p.kind === "GOODS" && p.isActive))} debtors={debtors} perms={perms} todayKey={todayKey} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="batch-figures">
        {f.live ? <StatCard tone="dark" label="Alive now" value={`${f.alive} ${b.unit}`} hint={`put in ${f.started} · sold ${f.soldAlive}`} /> : <StatCard tone="dark" label="Area" value={`${b.initialCount} ${b.unit}`} hint={Object.entries(f.produce).map(([u, q]) => `${q} ${u} harvested`).join(" · ") || "nothing harvested yet"} />}
        {f.live ? <StatCard tone={f.mortalityPct >= 5 ? "out" : "default"} label="Deaths" value={`${f.dead}`} hint={`${f.mortalityPct ?? 0} % of those put in`} /> : <StatCard label="Losses" value={`${f.dead}`} />}
        <StatCard label="Cost so far" value={formatMoney(f.cost)} hint={`inputs from stock ${formatMoney(f.inputs)} · expenses ${formatMoney(f.expenses)}`} />
        <StatCard tone={f.profit < 0 ? "out" : "in"} label="Profit" value={formatMoney(f.profit)} hint={`sales ${formatMoney(f.sales)}${f.costPerHead !== null ? ` · cost a head ${formatMoney(f.costPerHead)}` : ""}`} />
      </div>
      <div className="grid gap-5 xl:grid-cols-[2fr_1fr]">
        <Section title="Records" bodyClassName="p-0"><BatchEvents departmentId={department.id} events={serialize(d.events)} canVoid={perms.void} /></Section>
        <div className="space-y-5">
          <Section title="Details">
            <KeyValues rows={[b.breed && { label: b.kind === "CROP" ? "Crop" : "Breed", value: b.breed }, b.location && { label: "Where", value: b.location }, { label: "Feed given", value: Object.entries(f.feed).map(([u, q]) => `${q} ${u}`).join(", ") || "—" }, { label: "Produce", value: Object.entries(f.produce).map(([u, q]) => `${q} ${u}`).join(", ") || "—" }, f.lastWeight && { label: "Last weighing", value: `${f.lastWeight.quantity} ${f.lastWeight.unit}` }, b.note && { label: "Notes", value: b.note }].filter(Boolean)} />
          </Section>
          <Section title="Sales and expenses of the batch" description="Expenses name their batch in Money in / out." bodyClassName="p-0">
            <DataTable dense rows={d.records} empty="None yet." rowClassName={(r) => (r.voided ? "opacity-50 line-through" : "")} columns={[{ key: "r", label: "Ref.", render: (r) => <span className="font-mono text-xs">{r.referenceNo}</span> }, { key: "d", label: "Date", render: (r) => r.dateKey }, { key: "w", label: "What", render: (r) => <span className="text-xs">{r.description}{r.who ? ` · ${r.who}` : ""}</span> }, { key: "a", label: "Amount", align: "right", render: (r) => <Money value={r.type === "SALE" || r.type === "OTHER_INCOME" ? r.amount : -r.amount} suffix={false} /> }]} />
          </Section>
        </div>
      </div>
    </div>
  );
}
