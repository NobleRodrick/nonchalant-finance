import Link from "next/link";
import { notFound } from "next/navigation";
import { FilePlus2 } from "lucide-react";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { buildingsOf, unitDetail } from "@/lib/property/unit-queries";
import { inspectionList, maintenanceList } from "@/lib/property/work-queries";
import { BILLING_METHOD_LABELS, CONDITION_LABELS } from "@/lib/property/unit-math";
import { CHARGE_KIND_LABELS } from "@/lib/property/account";
import { INSPECTION_KIND_LABELS as INSPECTION_KINDS, MAINTENANCE_STATUS_LABELS } from "@/lib/property/unit-math";
import { monthLabel } from "@/lib/property/rent-schedule";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { DataTable, KeyValues, Money, PageHeader, Section, StatCard } from "@/components/kit/primitives";
import { AccountBadge, DepositBadge, LeaseStatusBadge, UnitStatusBadge } from "@/components/property/status";
import { OfficeActions } from "@/components/property/offices/office-actions";
import { ReportMaintenanceButton } from "@/components/property/work/maintenance";
import { InspectionButton } from "@/components/property/work/inspection";
import { depositStatus } from "@/lib/property/account";

export const dynamic = "force-dynamic";
export const metadata = { title: "Office" };

/** One office: status, tenant and what is owed, charges, price history, every contract, maintenance, inspections, photos. */
export default async function OfficePage({ params }) {
  const { deptId, unitId } = await params;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "offices" });
  const { todayKey, timeZone } = pageDate(user, null);
  const [u, buildings, maintenance, inspections] = await Promise.all([
    unitDetail({ departmentId: department.id, unitId, todayKey }),
    buildingsOf(department.id),
    maintenanceList({ departmentId: department.id, unitId, status: "all", timeZone }),
    inspectionList({ departmentId: department.id, unitId, timeZone }),
  ]);
  if (!u) notFound();
  const base = `/d/${department.id}`;
  const live = u.leases.find((l) => l.status === "ACTIVE") || u.leases.find((l) => l.status === "RESERVED") || null;
  const unit = serialize({ ...u, lease: live });
  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow={`${domain.label} · ${u.building.name}`}
        title={`Office ${u.name}`}
        description={[u.floor && `Floor ${u.floor}`, u.category, u.size && `${u.size} m²`, u.condition && `Condition: ${CONDITION_LABELS[u.condition]}`].filter(Boolean).join(" · ")}
        actions={
          <div className="flex flex-wrap gap-2">
            {!live && perms.propertyLease && u.isActive ? <Link href={`${base}/contracts/new?unit=${u.id}`}><Button><FilePlus2 className="h-4 w-4" /> New contract</Button></Link> : null}
            {perms.propertyLease ? <ReportMaintenanceButton departmentId={department.id} unit={unit} /> : null}
            {perms.propertyLease ? <InspectionButton departmentId={department.id} unit={unit} currentUserName={user.name} /> : null}
            <OfficeActions departmentId={department.id} unit={unit} buildings={serialize(buildings)} thisMonth={todayKey.slice(0, 7)} canManage={perms.propertyManage} canArchive={perms.archive} />
          </div>
        }
      >
        <div className="mt-2"><UnitStatusBadge status={u.status} />{u.stateNote ? <span className="ml-2 text-sm text-slate-600">{u.stateNote}</span> : null}{u.availableFromKey ? <span className="ml-2 text-sm text-slate-600">· available from {u.availableFromKey}</span> : null}</div>
      </PageHeader>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Monthly rent" value={formatMoney(live ? live.rentNow : u.listRentNow)} hint={live ? `Contract ${live.referenceNo}` : "List price"} />
        <StatCard label="Tenant" value={live ? live.client.name : "—"} hint={live ? `${live.status === "RESERVED" ? "Reserved from" : "Since"} ${live.moveInKey || live.startKey}${live.endKey ? ` · ends ${live.endKey}` : ""}` : "No tenant"} href={live ? `${base}/contracts/${live.id}` : undefined} />
        <StatCard tone={live?.account?.outstanding ? "out" : "default"} label="Outstanding" value={formatMoney(live?.account?.outstanding || 0)} hint={live?.account?.monthsOwed ? `${live.account.monthsOwed} month(s) of rent` : undefined} />
        <StatCard label="Deposit" value={formatMoney(live?.account?.deposit.held || 0)} hint={`Required ${formatMoney(live?.depositRequired ?? u.depositRequired)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Charges" description="How each utility or charge of this office is billed">
          {u.chargeSettings.length ? (
            <KeyValues rows={u.chargeSettings.map((c) => ({ label: c.kind === "OTHER" ? c.label || "Other" : CHARGE_KIND_LABELS[c.kind], value: `${BILLING_METHOD_LABELS[c.method]}${c.method === "INCLUDED" ? "" : c.method === "METER" ? ` · ${c.rate} FCFA / unit${c.meterNumber ? ` · meter ${c.meterNumber}` : ""}${c.lastReading !== null ? ` · last reading ${c.lastReading}` : ""}` : c.method === "SHARE" ? ` · ${c.rate}%` : ` · ${formatMoney(c.rate)} a month`}` }))} />
          ) : <p className="text-sm text-slate-500">Rent only: no utility or charge billed apart.</p>}
        </Section>
        <Section title="Price history" description="The list rent of the office from each month (old prices stay)">
          <DataTable dense rowKey={(r) => r.id} rows={u.rates} empty="No price recorded." columns={[{ key: "fromMonth", label: "From", render: (r) => monthLabel(r.fromMonth) }, { key: "amount", label: "Monthly rent", align: "right", render: (r) => <Money value={r.amount} /> }, { key: "note", label: "Why", render: (r) => r.note || "—" }]} />
        </Section>
      </div>

      <Section title="Contracts" description="Every tenant of this office, newest first">
        <DataTable
          dense
          rows={u.leases}
          empty="Never let yet."
          columns={[
            { key: "ref", label: "Contract", render: (l) => <Link className="font-medium hover:underline" href={`${base}/contracts/${l.id}`}>{l.referenceNo}</Link> },
            { key: "tenant", label: "Tenant", render: (l) => <Link className="hover:underline" href={`${base}/tenants/${l.client.id}`}>{l.client.name}</Link> },
            { key: "dates", label: "Dates", render: (l) => `${l.moveInKey || l.startKey} → ${l.moveOutKey || l.endKey || "open"}` },
            { key: "rent", label: "Rent", align: "right", render: (l) => <Money value={l.rent} suffix={false} /> },
            { key: "status", label: "Status", render: (l) => <span className="flex flex-wrap gap-1"><LeaseStatusBadge status={l.status} /><AccountBadge status={l.account?.status} /></span> },
            { key: "owed", label: "Owed", align: "right", render: (l) => (l.account ? <Money value={l.account.outstanding} suffix={false} /> : "—") },
            { key: "deposit", label: "Deposit", render: (l) => (l.account ? <DepositBadge status={depositStatus(l.account.deposit)} /> : null) },
          ]}
        />
      </Section>

      <div className="grid gap-5 xl:grid-cols-2">
        <Section title="Maintenance" description={`${maintenance.filter((m) => !["COMPLETED", "CANCELLED"].includes(m.status)).length} open`}>
          <DataTable dense rows={maintenance} empty="No maintenance request." columns={[{ key: "ref", label: "No.", render: (m) => m.referenceNo }, { key: "date", label: "Reported", render: (m) => m.reportedKey }, { key: "title", label: "Problem" }, { key: "status", label: "Status", render: (m) => MAINTENANCE_STATUS_LABELS[m.status] }, { key: "cost", label: "Cost", align: "right", render: (m) => <Money value={m.cost} suffix={false} /> }]} />
        </Section>
        <Section title="Inspections">
          <DataTable dense rows={inspections} empty="No inspection." columns={[{ key: "ref", label: "No.", render: (i) => i.referenceNo }, { key: "kind", label: "Kind", render: (i) => INSPECTION_KINDS[i.kind] }, { key: "date", label: "Date", render: (i) => i.doneKey || `planned ${i.scheduledKey}` }, { key: "condition", label: "Condition", render: (i) => CONDITION_LABELS[i.condition] || "—" }, { key: "damage", label: "Damages", align: "right", render: (i) => <Money value={i.damageCost} suffix={false} /> }]} />
        </Section>
      </div>

      {u.photos.length ? (
        <Section title="Photos">
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {u.photos.map((p) => <a key={p.id} href={p.url} target="_blank" rel="noreferrer"><img src={p.url} alt={p.fileName} className="h-36 w-full rounded-lg object-cover" /></a>)}
          </div>
        </Section>
      ) : null}
      {u.description || u.notes ? <Section title="Notes"><p className="whitespace-pre-line text-sm text-slate-700">{[u.description, u.notes].filter(Boolean).join("\n\n")}</p></Section> : null}
    </div>
  );
}

