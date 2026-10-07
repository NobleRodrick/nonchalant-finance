import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { formatDateKey } from "@/lib/timezone";
import { DataTable, Money, Section } from "@/components/kit/primitives";
import { ImportStatement } from "@/components/accounting/reconciliation-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Reconciliation" };

/** Bank and MoMo statements imported, how many lines are matched, and a new import. */
export default async function ReconciliationPage({ params }) {
  const { companyId } = await params;
  const { company } = await accountingPage(companyId);
  if (!company.reconciliationEnabled) notFound();
  const [accounts, statements] = await Promise.all([
    db.ledgerAccount.findMany({ where: { companyId, reconcilable: true, isActive: true }, select: { number: true, label: true }, orderBy: { number: "asc" } }),
    db.bankStatement.findMany({ where: { companyId }, orderBy: { toDate: "desc" }, take: 100, include: { lines: { select: { status: true } } } }),
  ]);
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <Section title="Statements" className="lg:col-span-2" bodyClassName="p-0">
        <DataTable
          rows={statements}
          empty="No statement imported yet."
          columns={[
            { key: "name", label: "Statement", render: (s) => <Link className="underline" href={`/accounting/${companyId}/reconciliation/${s.id}`}>{s.name}</Link> },
            { key: "acc", label: "Account", render: (s) => <span className="font-mono text-xs">{s.accountNumber}</span> },
            { key: "period", label: "Period", render: (s) => `${formatDateKey(s.fromDate.toISOString().slice(0, 10), { weekday: false })} – ${formatDateKey(s.toDate.toISOString().slice(0, 10), { weekday: false })}` },
            { key: "lines", label: "Matched", align: "right", render: (s) => `${s.lines.filter((l) => l.status !== "UNMATCHED").length} / ${s.lines.length}` },
            { key: "closing", label: "Closing balance", align: "right", render: (s) => <Money value={s.closingBalance} suffix={false} /> },
          ]}
        />
      </Section>
      <Section title="Import a statement" description="The CSV file downloaded from the bank or the MoMo account: a line of column names (date, label, reference, amount — or debit and credit), then one line per movement.">
        <ImportStatement companyId={companyId} accounts={accounts} />
      </Section>
    </div>
  );
}
