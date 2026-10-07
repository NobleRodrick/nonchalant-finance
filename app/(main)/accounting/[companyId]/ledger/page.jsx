import Link from "next/link";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { generalLedger } from "@/lib/accounting/reports";
import { fiscalYearStart } from "@/lib/accounting/balances";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { formatDateKey } from "@/lib/timezone";
import { Banner, DataTable, EmptyState, Section, StatementAmount } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { ExportMenu } from "@/components/kit/export-menu";
import { AccountPicker } from "@/components/accounting/account-picker";

export const dynamic = "force-dynamic";
export const metadata = { title: "General ledger" };

/** Grand livre: the lines of an account (or of a class / group: "5", "41") with the running balance. */
export default async function LedgerPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, todayKey } = await accountingPage(companyId);
  const range = resolvePeriod(sp, todayKey, "year");
  if (range.preset === "year") range.fromKey = fiscalYearStart(todayKey, company.fiscalYearStartMonth);
  const accounts = await db.ledgerAccount.findMany({ where: { companyId }, select: { number: true, label: true, isActive: true }, orderBy: { number: "asc" } });
  const number = /^\d{1,10}$/.test(sp?.account || "") ? sp.account : null;
  const partnerKey = typeof sp?.partner === "string" ? sp.partner : null;
  const gl = number ? await generalLedger({ company, number, fromKey: range.fromKey, toKey: range.toKey, partnerKey }) : null;
  const title = number ? (accounts.find((a) => a.number === number)?.label ? `${number} · ${accounts.find((a) => a.number === number).label}` : `Accounts ${number}…`) : "Choose an account";
  return (
    <div className="space-y-4">
      <PeriodPicker range={range} />
      <AccountPicker accounts={accounts.map((a) => ({ number: a.number, label: a.label }))} value={number || ""} />
      {partnerKey && gl?.lines[0] ? <Banner tone="info">Only the lines of {gl.lines.find((l) => l.partnerName)?.partnerName || "this partner"}.</Banner> : null}
      {!gl ? (
        <EmptyState title="Choose an account" description="Type a number (e.g. 5711 cash, 411 customers, 6 for every expense) to see its lines and running balance." />
      ) : (
        <Section
          title={title}
          description={`${periodLabel(range)}${gl.accounts.length > 1 ? ` · ${gl.accounts.length} accounts` : ""}`}
          actions={<ExportMenu fileName={`${company.name}-ledger-${number}-${range.fromKey}-${range.toKey}`} sheets={[{ name: `Grand livre ${number}`, columns: [{ label: "Date", value: "dateKey" }, { label: "Entry", value: "entryNo" }, { label: "Account", value: "account" }, { label: "Label", value: "text" }, { label: "Partner", value: "partnerName" }, { label: "Debit", value: "debit" }, { label: "Credit", value: "credit" }, { label: "Balance", value: "balance" }], rows: gl.lines.map((l) => ({ dateKey: l.dateKey, entryNo: l.entry.number, account: l.account.number, text: l.label || l.entry.label, partnerName: l.partnerName || "", debit: l.debit, credit: l.credit, balance: l.balance })) }]} />}
          bodyClassName="p-0"
        >
          {gl.truncated ? <p className="px-4 pt-3 text-xs text-amber-700">Only the first 2 000 lines are shown: choose a shorter period.</p> : null}
          <DataTable
            dense
            rows={gl.lines}
            empty="No lines in this period."
            columns={[
              { key: "dateKey", label: "Date", render: (l) => formatDateKey(l.dateKey, { weekday: false }) },
              { key: "entry", label: "Entry", render: (l) => <Link className="font-mono text-xs underline" href={`/accounting/${companyId}/entries/${l.entry.id}`}>{l.entry.number}</Link> },
              ...(gl.accounts.length > 1 ? [{ key: "account", label: "Account", render: (l) => <span className="font-mono text-xs">{l.account.number}</span> }] : []),
              { key: "label", label: "Label", render: (l) => <span className="line-clamp-2">{l.label || l.entry.label}{l.entry.reference ? <span className="ml-1 text-xs text-slate-500">· {l.entry.reference}</span> : null}</span> },
              { key: "partnerName", label: "Partner", render: (l) => (l.partnerKey ? <Link className="text-xs underline" href={`?${new URLSearchParams({ ...sp, partner: l.partnerKey })}`}>{l.partnerName}</Link> : null) },
              { key: "debit", label: "Debit", align: "right", render: (l) => (l.debit ? <StatementAmount value={l.debit} /> : null) },
              { key: "credit", label: "Credit", align: "right", render: (l) => (l.credit ? <StatementAmount value={l.credit} /> : null) },
              { key: "balance", label: "Balance", align: "right", render: (l) => <StatementAmount value={l.balance} /> },
            ]}
            footer={
              <>
                <tr><td className="px-3 py-1.5" colSpan={gl.accounts.length > 1 ? 5 : 4}>Opening balance</td><td colSpan={2} /><td className="px-3 py-1.5 text-right"><StatementAmount value={gl.opening} /></td></tr>
                <tr><td className="px-3 py-1.5" colSpan={gl.accounts.length > 1 ? 5 : 4}>Movements of the period</td><td className="px-3 py-1.5 text-right"><StatementAmount value={gl.debit} /></td><td className="px-3 py-1.5 text-right"><StatementAmount value={gl.credit} /></td><td /></tr>
                <tr data-testid="ledger-closing"><td className="px-3 py-1.5" colSpan={gl.accounts.length > 1 ? 5 : 4}>Closing balance (debit − credit)</td><td colSpan={2} /><td className="px-3 py-1.5 text-right"><StatementAmount value={gl.closing} /></td></tr>
              </>
            }
          />
        </Section>
      )}
    </div>
  );
}
