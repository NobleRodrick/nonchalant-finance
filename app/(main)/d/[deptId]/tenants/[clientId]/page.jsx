import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { tenantDetail } from "@/lib/property/lease-queries";
import { readProfile } from "@/lib/business-profile";
import { reminderText, whatsappLink } from "@/lib/property/reminder-text";
import { unitTitle } from "@/lib/property/unit-math";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DataTable, KeyValues, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { AccountBadge, LeaseStatusBadge } from "@/components/property/status";
import { TenantButton } from "@/components/property/tenants/tenant-dialog";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tenant" };

/** One tenant: profile, every contract with its account, all payments, statement, documents. */
export default async function TenantPage({ params }) {
  const { deptId, clientId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "tenants" });
  const { todayKey, timeZone } = pageDate(user, null);
  const t = await tenantDetail({ departmentId: department.id, clientId, todayKey, timeZone });
  if (!t) notFound();
  const base = `/d/${department.id}`;
  const payments = t.leases.flatMap((l) => l.payments.map((p) => ({ ...p, contract: l.referenceNo, office: l.unit.name }))).sort((a, b) => b.dateKey.localeCompare(a.dateKey));
  const byKind = {};
  for (const l of t.leases) for (const [k, v] of Object.entries(l.account?.byKind || {})) byKind[k] = (byKind[k] || 0) + v;
  const business = readProfile(department).legalName || department.name;
  const live = t.leases.find((l) => l.status === "ACTIVE");
  const wa = t.phone && t.owed > 0 ? whatsappLink(t.phone, reminderText({ business, tenant: t.name, office: t.leases.filter((l) => ["ACTIVE", "ENDED"].includes(l.status)).map((l) => unitTitle(l.unit)).join(", "), outstanding: t.owed, byKind, monthsOwed: t.leases.reduce((s, l) => s + (l.account?.monthsOwed || 0), 0), next: live?.account?.next })) : null;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${domain.label} · Tenant`}
        title={t.name}
        description={[t.company, t.phone, t.email, t.identification].filter(Boolean).join(" · ")}
        actions={<div className="flex flex-wrap gap-2">{wa ? <a href={wa} target="_blank" rel="noreferrer"><Button variant="outline"><MessageCircle className="h-4 w-4" /> Remind by WhatsApp</Button></a> : null}{perms.propertyLease ? <TenantButton departmentId={department.id} tenant={serialize(t)} /> : null}</div>}
      />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone={t.overdue ? "out" : t.owed ? "warn" : "default"} label="Owed now" value={formatMoney(t.owed)} hint={t.overdue ? `${formatMoney(t.overdue)} overdue` : undefined} />
        <StatCard label="Paid in all" value={formatMoney(t.paid)} />
        <StatCard label="Deposit held" value={formatMoney(t.depositHeld)} />
        <StatCard label="Contracts" value={t.leases.length} hint={t.leases.filter((l) => l.status === "ACTIVE").map((l) => l.unit.name).join(", ") || "None active"} />
      </div>
      {Object.keys(byKind).length ? <Section title="What is owed"><KeyValues rows={[...Object.entries(byKind).map(([k, v]) => ({ label: CHARGE_KIND_LABELS[k], value: <Money value={v} />, indent: true })), { label: "Total", value: <Money value={t.owed} />, strong: true }]} /></Section> : null}
      <Section title="Contracts">
        <DataTable
          rows={t.leases}
          columns={[
            { key: "ref", label: "Contract", render: (l) => <Link className="font-medium hover:underline" href={`${base}/contracts/${l.id}`}>{l.referenceNo}</Link> },
            { key: "office", label: "Office", render: (l) => unitTitle(l.unit) },
            { key: "dates", label: "Dates", render: (l) => `${l.startKey} → ${l.moveOutKey || l.endKey || "open"}` },
            { key: "rent", label: "Rent", align: "right", render: (l) => <Money value={l.rentNow} suffix={false} /> },
            { key: "status", label: "Status", render: (l) => <span className="flex gap-1"><LeaseStatusBadge status={l.status} /><AccountBadge status={l.account?.status} /></span> },
            { key: "owed", label: "Owed", align: "right", render: (l) => <Money value={l.account?.outstanding || 0} suffix={false} /> },
            { key: "docs", label: "", render: (l) => <span className="flex gap-2 text-xs"><Link className="underline" href={`${base}/contracts/${l.id}/documents/statement`} target="_blank">Statement</Link><Link className="underline" href={`${base}/contracts/${l.id}/documents/bill`} target="_blank">Bill</Link><Link className="underline" href={`${base}/contracts/${l.id}/documents/agreement`} target="_blank">Agreement</Link></span> },
          ]}
        />
      </Section>
      <Section title="Payment history" description="Payments, deposits and refunds of every contract">
        <DataTable
          dense
          rows={payments}
          empty="No payment yet."
          rowClassName={(p) => (p.status === "VOIDED" ? "opacity-50 line-through" : "")}
          columns={[
            { key: "d", label: "Date", render: (p) => p.dateKey },
            { key: "r", label: "Receipt", render: (p) => (p.status !== "VOIDED" && ["lease-payment", "lease-deposit"].includes(p.category) ? <Link className="underline" target="_blank" href={`${base}/contracts/${p.leaseId || t.leases.find((l) => l.referenceNo === p.contract)?.id}/documents/receipt?t=${p.id}`}>{p.referenceNo}</Link> : p.referenceNo) },
            { key: "c", label: "Contract", render: (p) => `${p.contract} · ${p.office}` },
            { key: "w", label: "What", render: (p) => <span>{p.what}{p.covered.length ? <span className="block text-xs text-slate-500">{p.covered.map((c) => c.label).join(", ")}</span> : null}</span> },
            { key: "a", label: "Amount", align: "right", render: (p) => <Money value={p.type === "BOOKING_REFUND" ? -p.amount : p.amount} suffix={false} /> },
          ]}
        />
      </Section>
      {t.notes || t.address ? <Section title="Notes"><p className="whitespace-pre-line text-sm text-slate-700">{[t.address, t.notes].filter(Boolean).join("\n")}</p></Section> : null}
    </div>
  );
}
