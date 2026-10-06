import Link from "next/link";
import { MessageCircle } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { arrears } from "@/lib/property/lease-queries";
import { buildingsOf, unitBoard } from "@/lib/property/unit-queries";
import { readProfile } from "@/lib/business-profile";
import { reminderText, whatsappLink } from "@/lib/property/reminder-text";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";
import { unitTitle } from "@/lib/property/unit-math";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { DataTable, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { ArrearsExport } from "@/components/property/arrears-export";
import { RemindAllButton } from "@/components/property/remind-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Arrears" };

/**
 * Property rental: the rent arrears dashboard — every tenant who owes: rent due, paid, balance,
 * months owed, days overdue, by kind; filters by building, office, amount owed, months owed,
 * days overdue, kind; totals and ageing; reminders by WhatsApp and e-mail.
 */
export default async function ArrearsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "arrears" });
  const { todayKey } = pageDate(user, null);
  const [a, buildings, units] = await Promise.all([
    arrears({ departmentId: department.id, todayKey, buildingId: sp.building || "", unitId: sp.office || "", minAmount: sp.min || 0, minMonths: sp.months || 0, minDays: sp.days || 0, kind: sp.kind || "" }),
    buildingsOf(department.id),
    unitBoard({ departmentId: department.id, todayKey }),
  ]);
  const base = `/d/${department.id}`;
  const business = readProfile(department).legalName || department.name;
  const t = a.totals;
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Rent arrears" description="Who owes, how much, for how many months and how late. Each month's debt stays separate until it is paid." actions={perms.propertyLease && a.rows.some((r) => r.tenant.email) ? <RemindAllButton departmentId={department.id} leaseIds={a.rows.filter((r) => r.tenant.email).map((r) => r.id)} /> : null} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="arrears-totals">
        <StatCard tone={t.balance ? "out" : "default"} label="Total owed by tenants" value={formatMoney(t.balance)} hint={`${t.tenants} tenant(s) · ${t.contracts} contract(s)`} />
        <StatCard tone={t.overdue ? "out" : "default"} label="Overdue" value={formatMoney(t.overdue)} />
        <StatCard label="Rent owed" value={formatMoney(t.rent)} />
        <StatCard label="Utilities & other owed" value={formatMoney(t.utilities)} hint={Object.entries(t.byKind).filter(([k]) => k !== "RENT").map(([k, v]) => `${CHARGE_KIND_LABELS[k]} ${formatMoney(v)}`).join(" · ") || undefined} />
      </div>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {a.buckets.map((b) => <StatCard key={b.label} label={`Late ${b.label}`} value={formatMoney(b.amount)} hint={`${b.count} contract(s)`} tone={b.amount && b.label !== "0–30 days" ? "warn" : "default"} />)}
      </div>
      <div className="flex flex-wrap items-end justify-between gap-2">
        <FilterBar
          fields={[
            { name: "building", label: "Building", type: "select", options: [{ value: "", label: "Both buildings" }, ...buildings.map((b) => ({ value: b.id, label: b.name }))] },
            { name: "office", label: "Office", type: "select", options: [{ value: "", label: "Every office" }, ...units.map((u) => ({ value: u.id, label: unitTitle(u) }))] },
            { name: "min", label: "Owing at least (FCFA)", type: "number", placeholder: "100000" },
            { name: "months", label: "Months owed at least", type: "number", placeholder: "2" },
            { name: "days", label: "Days overdue at least", type: "number", placeholder: "30" },
            { name: "kind", label: "Owes", type: "select", options: [{ value: "", label: "Anything" }, { value: "rent", label: "Rent" }, { value: "utilities", label: "Utilities / other" }] },
          ]}
        />
        {perms.export ? <ArrearsExport rows={serialize(a.rows)} todayKey={todayKey} /> : null}
      </div>
      <Section bodyClassName="p-0">
        <DataTable
          stickyHeader
          rows={a.rows}
          empty="Nobody owes anything that matches."
          footer={a.rows.length > 1 ? <tr><td className="px-3 py-2 font-semibold" colSpan={3}>Total</td><td className="px-3 py-2 text-right"><Money value={a.rows.reduce((s, r) => s + r.due, 0)} suffix={false} /></td><td className="px-3 py-2 text-right"><Money value={a.rows.reduce((s, r) => s + r.paid, 0)} suffix={false} /></td><td className="px-3 py-2 text-right font-semibold"><Money value={t.balance} suffix={false} /></td><td colSpan={3} /></tr> : null}
          columns={[
            { key: "tenant", label: "Tenant", render: (r) => <Link className="font-medium hover:underline" href={`${base}/tenants/${r.tenant.id}`}>{r.tenant.name}</Link> },
            { key: "office", label: "Office", render: (r) => <Link className="hover:underline" href={`${base}/contracts/${r.id}`}>{unitTitle(r.unit)}</Link> },
            { key: "rent", label: "Rent / month", align: "right", render: (r) => <Money value={r.rentNow} suffix={false} /> },
            { key: "due", label: "Due so far", align: "right", render: (r) => <Money value={r.due} suffix={false} /> },
            { key: "paid", label: "Paid", align: "right", render: (r) => <Money value={r.paid} suffix={false} /> },
            { key: "balance", label: "Balance", align: "right", render: (r) => <span><Money value={r.balance} className="font-semibold text-rose-700" suffix={false} />{r.utilities ? <span className="block text-[11px] text-slate-500">rent {formatMoney(r.rent)} · other {formatMoney(r.utilities)}</span> : null}</span> },
            { key: "months", label: "Months", align: "right", render: (r) => r.monthsOwed },
            { key: "days", label: "Days overdue", align: "right", render: (r) => <span className={r.daysOverdue > 30 ? "font-semibold text-rose-700" : ""}>{r.daysOverdue}</span> },
            { key: "act", label: "", render: (r) => { const wa = r.tenant.phone ? whatsappLink(r.tenant.phone, reminderText({ business, tenant: r.tenant.name, office: unitTitle(r.unit), outstanding: r.balance, byKind: r.byKind, monthsOwed: r.monthsOwed })) : null; return wa ? <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 hover:underline print:hidden"><MessageCircle className="h-3.5 w-3.5" /> WhatsApp</a> : null; } },
          ]}
        />
      </Section>
    </div>
  );
}
