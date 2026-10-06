import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { departmentPage } from "@/lib/page-guards";
import { itemCategories, itemDetail } from "@/lib/rental/item-queries";
import { serialize } from "@/lib/serialize";
import { orgTimezone } from "@/lib/access";
import { formatDateKey, formatTimeInZone, toDateKey } from "@/lib/timezone";
import { DataTable, KeyValues, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { ItemActions } from "@/components/rental/stock/item-actions";
import { IncidentButtons, ReportIncidentButton } from "@/components/rental/incidents/incident-actions";
import { incidentList } from "@/lib/rental/item-queries";
import { CONDITION_LABELS, INCIDENT_KIND_LABELS, INCIDENT_STATUS_LABELS, MOVEMENT_LABELS } from "@/lib/rental/stock-math";

export const dynamic = "force-dynamic";
export const metadata = { title: "Stock item" };

const signed = (n) => (n > 0 ? `+${n}` : String(n));

/** One stock item: details, units by state, and every movement (who, when, why). */
export default async function StockItemPage({ params }) {
  const { deptId, itemId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "stock" });
  const [detail, categories, incidents] = await Promise.all([itemDetail({ departmentId: department.id, itemId }), itemCategories(department.id), incidentList({ departmentId: department.id, itemId, status: "all", take: 50 })]);
  if (!detail) notFound();
  const { item, movements } = detail;
  const tz = orgTimezone(user);
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-5">
      <Link href={`${base}/stock`} className="inline-flex items-center gap-1 text-sm text-slate-600 hover:underline print:hidden"><ArrowLeft className="h-4 w-4" /> Stock</Link>
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title={item.name} description={`${item.code} · ${item.category}${item.archivedAt ? ` · archived: ${item.archiveReason}` : ""}`} actions={<>{perms.rentalBook && !item.archivedAt ? <ReportIncidentButton departmentId={department.id} item={serialize(item)} /> : null}<ItemActions departmentId={department.id} item={serialize(item)} categories={categories} canManage={perms.rentalManage} canArchive={perms.archive} /></>} />
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
        <StatCard label="In the store" value={item.inStock} hint={item.alert ? (item.alert === "LOW" ? "Low" : "None left") : "good units"} tone={item.alert ? "warn" : "in"} />
        <StatCard label="Owned" value={item.owned} />
        <StatCard label="Rented out" value={item.out} tone={item.out ? "info" : "default"} />
        <StatCard label="Damaged" value={item.damaged} tone={item.damaged ? "warn" : "default"} />
        <StatCard label="In repair" value={item.inRepair} />
        <StatCard label="Missing" value={item.missing} tone={item.missing ? "out" : "default"} />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Details" className="lg:col-span-1">
          {item.photoUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={item.photoUrl} alt={item.name} className="mb-3 max-h-56 w-full rounded-lg border object-contain" />
          ) : null}
          <KeyValues
            rows={[
              { label: "Rental price per event", value: <Money value={item.rentalPrice} /> },
              { label: "Purchase price of one", value: <Money value={item.purchasePrice} /> },
              { label: "Replacement value of one", value: <Money value={item.lossValue} /> },
              { label: "Stock value", value: <Money value={item.value} /> },
              { label: "Unit", value: item.unit },
              { label: "Condition", value: CONDITION_LABELS[item.condition] },
              { label: "Storage place", value: item.location || "—" },
              { label: "Supplier", value: item.supplier || "—" },
              { label: "Date purchased", value: item.purchasedOn ? formatDateKey(toDateKey(item.purchasedOn, "UTC"), { weekday: false }) : "—" },
              { label: "Low-stock warning at", value: item.lowStockLevel || "none" },
            ]}
          />
          {item.description ? <p className="mt-3 text-sm text-slate-600">{item.description}</p> : null}
        </Section>
        <Section title="Movements" description="Every change of the units, newest first." className="lg:col-span-2" bodyClassName="p-0">
          <DataTable
            dense
            rows={movements}
            empty="No movement yet."
            columns={[
              { key: "date", label: "Date", render: (m) => <span className="whitespace-nowrap">{formatDateKey(toDateKey(m.date, tz), { weekday: false })} <span className="text-xs text-slate-400">{formatTimeInZone(m.date, tz)}</span></span> },
              { key: "ref", label: "No.", render: (m) => <span className="font-mono text-xs">{m.referenceNo}</span> },
              { key: "kind", label: "What", render: (m) => <span>{MOVEMENT_LABELS[m.kind]}{m.order ? <> · <Link className="underline" href={`${base}/bookings/${m.order.id}`}>{m.order.referenceNo}</Link></> : null}{m.kind === "TRANSFERRED" ? <span className="text-slate-500"> {m.fromLocation || "—"} → {m.toLocation}</span> : null}</span> },
              { key: "q", label: "Units", align: "right", render: (m) => (m.dOwned ? <span className="tabular-nums font-medium">{signed(m.dOwned)} owned</span> : m.kind === "TRANSFERRED" ? "—" : <span className="tabular-nums">{m.quantity}</span>) },
              { key: "value", label: "Value", align: "right", render: (m) => (m.value ? <Money value={m.value} suffix={false} /> : "") },
              { key: "by", label: "By", render: (m) => <span className="text-slate-600">{m.createdBy?.name}</span> },
              { key: "note", label: "Note", render: (m) => <span className="text-xs text-slate-500">{m.note}</span> },
            ]}
          />
        </Section>
      </div>
      {incidents.length ? (
        <Section title="Damaged and missing" bodyClassName="p-0">
          <DataTable
            dense
            rows={incidents}
            columns={[
              { key: "d", label: "Date", render: (x) => formatDateKey(toDateKey(x.date, tz), { weekday: false }) },
              { key: "w", label: "What", render: (x) => `${x.quantity} ${INCIDENT_KIND_LABELS[x.kind].toLowerCase()}` },
              { key: "o", label: "Event", render: (x) => (x.order ? <Link className="underline" href={`${base}/bookings/${x.order.id}`}>{x.order.referenceNo}</Link> : "In the store") },
              { key: "s", label: "Decision", render: (x) => INCIDENT_STATUS_LABELS[x.status] },
              { key: "a", label: "", align: "right", render: (x) => <IncidentButtons departmentId={department.id} incident={serialize(x)} canBook={perms.rentalBook} /> },
            ]}
          />
        </Section>
      ) : null}
    </div>
  );
}
