import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { statementDetail } from "@/lib/accounting/reconciliation";
import { formatDateKey } from "@/lib/timezone";
import { Banner, KeyValues, Money, Section } from "@/components/kit/primitives";
import { StatementLines } from "@/components/accounting/reconciliation-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Statement" };

/** One statement: each line matched with the books, or set aside, or posted from it. */
export default async function StatementPage({ params }) {
  const { companyId, statementId } = await params;
  const { company, access } = await accountingPage(companyId);
  if (!access.companyWide) notFound();
  const st = await statementDetail({ company, statementId });
  if (!st) notFound();
  const accounts = await db.ledgerAccount.findMany({ where: { companyId, isActive: true }, select: { number: true, label: true }, orderBy: { number: "asc" } });
  const unmatched = st.lines.filter((l) => l.status === "UNMATCHED").length;
  const diff = st.closingBalance ? st.closingBalance - st.bookBalance : null;
  return (
    <div className="space-y-4">
      <Link href={`/accounting/${companyId}/reconciliation`} className="text-sm text-slate-500 underline">All statements</Link>
      <div className="grid gap-4 lg:grid-cols-3">
        <Section title={st.name} description={`Account ${st.accountNumber} · ${formatDateKey(st.fromKey, { weekday: false })} – ${formatDateKey(st.toKey, { weekday: false })}`} className="lg:col-span-2">
          {unmatched ? <Banner tone="warn">{unmatched} line(s) not matched yet.</Banner> : <Banner tone="ok">Every line is matched or set aside.</Banner>}
        </Section>
        <Section title="Balances">
          <KeyValues rows={[
            { label: "Statement closing balance", value: st.closingBalance ? <Money value={st.closingBalance} /> : "not given" },
            { label: `Books at ${formatDateKey(st.toKey, { weekday: false })}`, value: <Money value={st.bookBalance} /> },
            diff !== null ? { label: "Difference", value: <Money value={diff} />, strong: true } : null,
          ]} />
        </Section>
      </div>
      <StatementLines companyId={companyId} statementId={st.id} lines={st.lines.map((l) => ({ id: l.id, dateKey: l.dateKey, label: l.label, reference: l.reference, amount: l.amount, status: l.status, entry: l.entry }))} openLedger={st.openLedger} accounts={accounts} />
    </div>
  );
}
