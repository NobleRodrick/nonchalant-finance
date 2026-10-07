import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { entryDetail } from "@/lib/accounting/reports";
import { JOURNAL_LABELS } from "@/lib/accounting/chart";
import { formatDateKey } from "@/lib/timezone";
import { Banner, DataTable, KeyValues, Pill, Section, StatementAmount } from "@/components/kit/primitives";
import { EntryActions } from "@/components/accounting/entry-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal entry" };

/** One entry: its lines, where it comes from, who posted or approved it, its reversal. */
export default async function EntryPage({ params }) {
  const { companyId, entryId } = await params;
  const { company, access, user } = await accountingPage(companyId);
  const e = await entryDetail({ company, entryId });
  if (!e) notFound();
  const department = e.departmentId ? await db.department.findUnique({ where: { id: e.departmentId }, select: { name: true } }) : null;
  const deptNames = new Map((await db.department.findMany({ where: { companyId }, select: { id: true, name: true } })).map((d) => [d.id, d.name]));
  const status = { POSTED: ["Posted", "emerald"], PENDING: ["Waiting for the Boss's approval", "amber"], DRAFT: ["Draft", "slate"], REJECTED: ["Rejected", "rose"] }[e.status];
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link href={`/accounting/${companyId}/entries`} className="text-sm text-slate-500 underline">All entries</Link>
          <h2 className="mt-1 text-lg font-semibold">{e.number || "Entry not posted"} · {e.label}</h2>
        </div>
        <div className="flex items-center gap-2">
          <Pill tone={status[1]}>{status[0]}</Pill>
          {e.reversalOf ? <Pill tone="rose">Reversal</Pill> : null}
          {e.reversedAt ? <Pill>Reversed</Pill> : null}
          {e.late ? <Pill tone="amber">Late (closed period)</Pill> : null}
        </div>
      </div>
      {e.status === "REJECTED" ? <Banner tone="bad">Rejected: {e.rejectedReason}</Banner> : null}
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title="Lines" className="lg:col-span-2" bodyClassName="p-0">
          <DataTable
            dense
            rows={e.lines}
            columns={[
              { key: "account", label: "Account", render: (l) => <Link className="font-mono text-xs underline" href={`/accounting/${companyId}/ledger?account=${l.account.number}`}>{l.account.number}</Link> },
              { key: "name", label: "Name", render: (l) => <span>{l.account.label}<span className="block text-[11px] text-slate-400">{l.label || l.account.name}</span></span> },
              { key: "dept", label: "Department", render: (l) => deptNames.get(l.departmentId) || "" },
              { key: "partner", label: "Partner", render: (l) => l.partnerName || "" },
              { key: "debit", label: "Debit", align: "right", render: (l) => (l.debit ? <StatementAmount value={l.debit} /> : null) },
              { key: "credit", label: "Credit", align: "right", render: (l) => (l.credit ? <StatementAmount value={l.credit} /> : null) },
            ]}
            footer={<tr><td className="px-3 py-2" colSpan={4}>Total</td><td className="px-3 py-2 text-right"><StatementAmount value={e.lines.reduce((s, l) => s + l.debit, 0)} /></td><td className="px-3 py-2 text-right"><StatementAmount value={e.lines.reduce((s, l) => s + l.credit, 0)} /></td></tr>}
          />
        </Section>
        <div className="space-y-4">
          <Section title="Details">
            <KeyValues rows={[
              { label: "Date", value: formatDateKey(e.dateKey) },
              { label: "Journal", value: `${e.journal.code} · ${JOURNAL_LABELS[e.journal.code] || e.journal.name}` },
              e.reference ? { label: "Document", value: e.reference } : null,
              department ? { label: "Department", value: department.name } : null,
              { label: "Origin", value: e.isManual ? `Typed by ${e.createdByName || "—"}` : "Generated from the department's records" },
              e.approvedByName && e.isManual ? { label: "Approved by", value: e.approvedByName } : null,
              e.reversalOf ? { label: "Reverses", value: <Link className="underline" href={`/accounting/${companyId}/entries/${e.reversalOf.id}`}>{e.reversalOf.number}</Link> } : null,
              e.reversedBy ? { label: "Reversed by", value: <Link className="underline" href={`/accounting/${companyId}/entries/${e.reversedBy.id}`}>{e.reversedBy.number}</Link> } : null,
              e.note ? { label: "Note", value: e.note } : null,
            ]} />
            {e.source && access.isBoss ? <Link className="mt-3 inline-block text-sm underline" href={e.source.href}>Open the record: {e.source.label}</Link> : null}
            {e.source && !access.isBoss ? <p className="mt-3 text-xs text-slate-500">From: {e.source.label}. Corrections are made by the department (the books follow).</p> : null}
          </Section>
          <EntryActions companyId={companyId} entry={{ id: e.id, status: e.status, isManual: e.isManual, reversed: Boolean(e.reversedAt || e.reversalOf), number: e.number, mine: e.createdById === user.id }} canApprove={access.canApprove} />
        </div>
      </div>
    </div>
  );
}
