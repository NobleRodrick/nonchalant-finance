import Link from "next/link";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { reportDepartments } from "@/lib/accounting/access";
import { BUCKETS, partnerLedger } from "@/lib/accounting/partners";
import { formatDateKey } from "@/lib/timezone";
import { DataTable, Money, Section, StatCard } from "@/components/kit/primitives";
import { ExportMenu } from "@/components/kit/export-menu";
import { FilterBar } from "@/components/kit/filter-bar";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";
export const metadata = { title: "Customers and suppliers" };

/** Who owes the company and whom it owes, with the age of each debt (oldest settled first). */
export default async function PartnersPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, access, todayKey } = await accountingPage(companyId);
  const side = sp?.side === "suppliers" ? "suppliers" : "customers";
  const departments = await db.department.findMany({ where: { companyId, ...(access.scoped ? { id: { in: access.departmentIds } } : {}) }, select: { id: true, name: true }, orderBy: { createdAt: "asc" } });
  const dept = departments.some((d) => d.id === sp?.dept) ? sp.dept : null;
  const asOfKey = /^\d{4}-\d{2}-\d{2}$/.test(sp?.date || "") && sp.date <= todayKey ? sp.date : todayKey;
  const { rows, totals } = await partnerLedger({ company, side, asOfKey, departmentIds: reportDepartments(access, dept) });
  const names = new Map(departments.map((d) => [d.id, d.name]));
  const account = side === "suppliers" ? "401" : "411";
  const tab = (k, l) => <Link role="tab" aria-selected={side === k} href={`?side=${k}`} className={cn("rounded-md px-3 py-1.5 text-sm", side === k ? "bg-slate-900 text-white" : "bg-white text-slate-600 ring-1 ring-slate-200")}>{l}</Link>;
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex gap-1" role="tablist">{tab("customers", "Customers and tenants")}{tab("suppliers", "Suppliers")}</div>
        <div className="flex items-end gap-2">
          <FilterBar fields={[{ name: "date", label: "As of", type: "date" }, ...(departments.length > 1 ? [{ name: "dept", label: "Department", type: "select", options: [{ value: "", label: "All departments" }, ...departments.map((d) => ({ value: d.id, label: d.name }))] }] : [])]} />
          <ExportMenu fileName={`${company.name}-${side}-${asOfKey}`} sheets={[{ name: side === "suppliers" ? "Fournisseurs" : "Clients", columns: [{ label: "Name", value: "name" }, { label: side === "suppliers" ? "Owed to them" : "Owes", value: "owed" }, ...BUCKETS.map(([k]) => ({ label: `${k} days`, value: k })), { label: "Paid ahead", value: "ahead" }], rows: rows.map((r) => ({ ...r, ...r.buckets })) }]} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
        <StatCard tone={side === "suppliers" ? "out" : "in"} label={side === "suppliers" ? "The company owes" : "Owed to the company"} value={<Money value={totals.owed} />} className="lg:col-span-2" />
        {BUCKETS.map(([k]) => <StatCard key={k} tone={k === "90+" && totals.buckets[k] ? "warn" : "default"} label={`${k} days`} value={<Money value={totals.buckets[k]} />} />)}
      </div>
      <Section title={side === "suppliers" ? "Suppliers" : "Customers and tenants"} description={`At ${formatDateKey(asOfKey, { weekday: false })} · paid ahead: ${totals.ahead.toLocaleString("fr-FR")} FCFA`} bodyClassName="p-0">
        <DataTable
          dense
          rows={rows}
          empty={side === "suppliers" ? "Nothing owed to suppliers." : "Nobody owes anything."}
          columns={[
            { key: "name", label: "Name", render: (r) => <Link className="underline" href={`/accounting/${companyId}/ledger?account=${account.slice(0, 2)}&partner=${encodeURIComponent(r.key)}&period=year`}>{r.name}</Link> },
            { key: "dept", label: "Department", render: (r) => r.departmentIds.map((id) => names.get(id)).filter(Boolean).join(", ") },
            { key: "owed", label: side === "suppliers" ? "Owed to them" : "Owes", align: "right", render: (r) => <Money value={r.owed} suffix={false} /> },
            ...BUCKETS.map(([k]) => ({ key: k, label: `${k} d`, align: "right", render: (r) => (r.buckets[k] ? <Money value={r.buckets[k]} suffix={false} className={k === "90+" ? "text-rose-700" : ""} /> : null) })),
            { key: "ahead", label: "Paid ahead", align: "right", render: (r) => (r.ahead ? <Money value={r.ahead} suffix={false} /> : null) },
            { key: "oldest", label: "Oldest", render: (r) => (r.oldestKey ? formatDateKey(r.oldestKey, { weekday: false }) : "") },
          ]}
        />
      </Section>
    </div>
  );
}
