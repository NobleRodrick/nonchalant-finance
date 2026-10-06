import Link from "next/link";
import { notFound } from "next/navigation";
import { FileText } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { leaseDetail } from "@/lib/property/lease-queries";
import { readProfile } from "@/lib/business-profile";
import { addMonths, monthLabel, monthOf } from "@/lib/property/rent-schedule";
import { INSPECTION_KIND_LABELS, MAINTENANCE_STATUS_LABELS, unitTitle } from "@/lib/property/unit-math";
import { CHARGE_KIND_LABELS, DEPOSIT_STATUS_LABELS } from "@/lib/property/account";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DataTable, KeyValues, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { AccountBadge, LeaseStatusBadge } from "@/components/property/status";
import { ContractActions } from "@/components/property/contracts/contract-actions";
import { AccountItems, ContractCharges, ContractPayments } from "@/components/property/contracts/contract-tables";

export const dynamic = "force-dynamic";
export const metadata = { title: "Contract" };

const DOCS = [["bill", "Monthly bill"], ["statement", "Tenant statement"], ["agreement", "Rental agreement"], ["settlement", "Move-out settlement"]];

/**
 * One contract: tenant, office, terms, the account month by month (rent and charges, paid,
 * owed), payments and what each covered, deposit ledger, charges, inspections, maintenance,
 * documents, and every action (payment, charge, deposit, rent change, renewal, move-out …).
 */
export default async function ContractPage({ params }) {
  const { deptId, leaseId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "contracts" });
  const { todayKey, timeZone } = pageDate(user, null);
  const l = await leaseDetail({ departmentId: department.id, leaseId, todayKey, timeZone });
  if (!l) notFound();
  const base = `/d/${department.id}`;
  const a = l.account;
  const d = l.deposit;
  const forClient = serialize({
    id: l.id,
    referenceNo: l.referenceNo,
    status: l.status,
    tenant: l.client.name,
    phone: l.client.phone,
    office: unitTitle(l.unit),
    startKey: l.startKey,
    endKey: l.endKey,
    dueDay: l.dueDay,
    monthsPerBill: l.monthsPerBill,
    depositRequired: l.depositRequired,
    noticeDays: l.noticeDays,
    utilities: l.utilities,
    conditions: l.conditions,
    notes: l.notes,
    rentNow: l.rentNow,
    outstanding: a?.outstanding || 0,
    rentOutstanding: a?.rentOutstanding || 0,
    byKind: a?.byKind || {},
    monthsOwed: a?.monthsOwed || 0,
    credit: a?.credit || 0,
    next: a?.next || null,
    deposit: d,
    chargeSettings: l.unit.chargeSettings,
    thisMonth: monthOf(todayKey),
    nextMonth: addMonths(monthOf(todayKey), 1),
    todayKey,
  });
  const business = readProfile(department).legalName || department.name;
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${domain.label} · Contract ${l.referenceNo}`}
        title={`${l.client.name} · ${l.unit.name}`}
        description={`${l.unit.building.name}${l.unit.floor ? ` · floor ${l.unit.floor}` : ""} · ${l.startKey} → ${l.moveOutKey || l.endKey || "open-ended"} · rent due on the ${l.dueDay}${l.monthsPerBill > 1 ? `, billed every ${l.monthsPerBill} months` : ""}`}
        actions={<ContractActions departmentId={department.id} lease={forClient} items={serialize(l.items)} canLease={perms.propertyLease} canPrices={perms.prices} currentUserName={user.name} businessName={business} />}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2"><LeaseStatusBadge status={l.status} /><AccountBadge status={a?.status} />{l.expiring ? <span className="text-sm font-medium text-amber-700">Ends within 60 days</span> : null}</div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5" data-testid="contract-kpis">
        <StatCard tone="dark" label="Monthly rent" value={formatMoney(l.rentNow)} hint={l.rates.length ? `Changes: ${l.rates.map((r) => `${formatMoney(r.amount)} from ${monthLabel(r.fromMonth, true)}`).join(", ")}` : "No change"} />
        <StatCard label="Due so far" value={formatMoney(a?.dueTotal || 0)} hint={`Paid ${formatMoney(a?.paidTotal || 0)}`} />
        <StatCard tone={a?.overdue ? "out" : a?.outstanding ? "warn" : "default"} label="Outstanding" value={formatMoney(a?.outstanding || 0)} hint={a?.monthsOwed ? `${a.monthsOwed} month(s) of rent · ${a.daysOverdue} days overdue` : a?.next ? `Next: ${a.next.label} on ${a.next.dueKey}` : undefined} />
        <StatCard label="Advance / paid ahead" value={formatMoney((a?.credit || 0) + (a?.paidAhead || 0))} />
        <StatCard label="Deposit held" value={formatMoney(d?.held || 0)} hint={`${DEPOSIT_STATUS_LABELS[l.depositStatus] || ""} · required ${formatMoney(l.depositRequired)}`} />
      </div>

      {a && Object.keys(a.byKind).length ? (
        <Section title="What is owed" description="Rent, utilities and other charges kept apart">
          <KeyValues rows={[...Object.entries(a.byKind).map(([k, v]) => ({ label: CHARGE_KIND_LABELS[k] || k, value: <Money value={v} />, indent: true })), { label: "Total outstanding", value: <Money value={a.outstanding} />, strong: true }]} />
        </Section>
      ) : null}

      <Section title="Account" description="Every month of rent and every charge, with what was paid and what is owed (paid ahead shown in grey)" actions={<div className="flex flex-wrap gap-1 print:hidden">{DOCS.filter(([k]) => k !== "settlement" || l.status === "ENDED").map(([k, label]) => <Link key={k} href={`${base}/contracts/${l.id}/documents/${k}`} target="_blank"><Button size="sm" variant="ghost"><FileText className="h-3.5 w-3.5" /> {label}</Button></Link>)}</div>}>
        <AccountItems items={serialize(l.items)} />
      </Section>

      <Section title="Payments, deposits and refunds">
        <ContractPayments departmentId={department.id} leaseId={l.id} payments={serialize(l.payments)} canVoid={perms.void} />
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Charges billed">
          <ContractCharges departmentId={department.id} charges={serialize(l.charges)} canVoid={perms.void} />
        </Section>
        <Section title="Statement" description={`Opening 0 + rent ${formatMoney(l.statement.totals.rent)} + utilities ${formatMoney(l.statement.totals.utilities)} + other ${formatMoney(l.statement.totals.other)} − payments ${formatMoney(l.statement.totals.payments + l.statement.totals.deposit + l.statement.totals.waived)} = ${formatMoney(l.statement.closing)}`}>
          <DataTable dense rowKey={(r, i) => `${r.dateKey}-${i}`} rows={l.statement.lines} empty="Nothing yet." columns={[{ key: "d", label: "Date", render: (r) => r.dateKey }, { key: "l", label: "", render: (r) => r.label }, { key: "dr", label: "Charged", align: "right", render: (r) => (r.debit ? <Money value={r.debit} suffix={false} /> : "") }, { key: "cr", label: "Paid", align: "right", render: (r) => (r.credit ? <Money value={r.credit} suffix={false} /> : "") }, { key: "b", label: "Balance", align: "right", render: (r) => <Money value={r.balance} suffix={false} /> }]} />
        </Section>
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Deposit ledger" description={`Required ${formatMoney(d.required)} · received ${formatMoney(d.received)} · refunded ${formatMoney(d.refunded)} · used ${formatMoney(d.applied)} · held ${formatMoney(d.held)}`}>
          <DataTable dense rows={l.depositLedger} empty="No deposit yet." columns={[{ key: "d", label: "Date", render: (r) => r.dateKey }, { key: "k", label: "", render: (r) => ({ RECEIVED: "Received", REFUNDED: "Refunded", APPLIED_RENT: "Used for rent", APPLIED_CHARGES: "Used for charges", APPLIED_DAMAGE: "Used for damages" })[r.kind] }, { key: "a", label: "Amount", align: "right", render: (r) => <Money value={r.amount} suffix={false} /> }, { key: "n", label: "Note", render: (r) => r.note || "" }]} />
        </Section>
        <Section title="Contract">
          <KeyValues
            rows={[
              { label: "Tenant", value: <Link className="underline" href={`${base}/tenants/${l.client.id}`}>{l.client.name}</Link> },
              { label: "Phone / e-mail", value: [l.client.phone, l.client.email].filter(Boolean).join(" · ") || "—" },
              { label: "Identification", value: l.client.identification || "—" },
              { label: "Office", value: <Link className="underline" href={`${base}/offices/${l.unit.id}`}>{unitTitle(l.unit)}</Link> },
              { label: "Moved in / out", value: `${l.moveInKey || "—"} / ${l.moveOutKey || "—"}` },
              { label: "Notice", value: `${l.noticeDays} days` },
              { label: "Utilities", value: l.utilities || "—" },
              { label: "Conditions", value: l.conditions || "—" },
              { label: "Created by", value: l.createdBy?.name },
              l.endReason ? { label: "Ended", value: l.endReason } : null,
              l.cancelReason ? { label: "Cancelled", value: l.cancelReason } : null,
            ]}
          />
          {l.documents.length ? <ul className="mt-3 space-y-1 text-sm">{l.documents.map((f) => <li key={f.id}><a className="underline" href={f.url} target="_blank" rel="noreferrer">{f.fileName}</a></li>)}</ul> : null}
        </Section>
      </div>

      {l.inspections.length || l.maintenance.length ? (
        <div className="grid gap-5 xl:grid-cols-2">
          <Section title="Inspections"><DataTable dense rows={l.inspections} columns={[{ key: "r", label: "No.", render: (i) => i.referenceNo }, { key: "k", label: "Kind", render: (i) => INSPECTION_KIND_LABELS[i.kind] }, { key: "d", label: "Date", render: (i) => i.doneKey || `planned ${i.scheduledKey}` }, { key: "c", label: "Damages", align: "right", render: (i) => <Money value={i.damageCost} suffix={false} /> }]} /></Section>
          <Section title="Maintenance"><DataTable dense rows={l.maintenance} columns={[{ key: "r", label: "No.", render: (m) => m.referenceNo }, { key: "t", label: "Problem", render: (m) => m.title }, { key: "s", label: "Status", render: (m) => MAINTENANCE_STATUS_LABELS[m.status] }]} /></Section>
        </div>
      ) : null}
    </div>
  );
}
