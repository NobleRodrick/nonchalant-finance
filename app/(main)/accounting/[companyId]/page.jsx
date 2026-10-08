import Link from "next/link";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { balanceSheetAt, incomeStatementFor } from "@/lib/accounting/reports";
import { fiscalYearStart, trialBalance } from "@/lib/accounting/balances";
import { entryScope } from "@/lib/accounting/access";
import { partnerLedger } from "@/lib/accounting/partners";
import { monthsOf } from "@/lib/accounting/closing";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { Banner, DataTable, Money, Section, StatCard } from "@/components/kit/primitives";
import { SyncBooksButton } from "@/components/accounting/sync-books-button";

export const dynamic = "force-dynamic";
export const metadata = { title: "Accounting" };

/** The books at a glance: the year's result, treasury, who owes whom, what needs doing. */
export default async function BooksOverview({ params }) {
  const { companyId } = await params;
  const { company, access, todayKey, timeZone } = await accountingPage(companyId);
  const yearFrom = fiscalYearStart(todayKey, company.fiscalYearStartMonth);
  if (access.scoped) return <DepartmentBooksOverview companyId={companyId} company={company} access={access} todayKey={todayKey} timeZone={timeZone} yearFrom={yearFrom} />;
  const [is, bs, recent, pending, months, departments] = await Promise.all([
    incomeStatementFor({ company, fromKey: yearFrom, toKey: todayKey, compare: false }),
    balanceSheetAt({ company, toKey: todayKey }),
    db.journalEntry.findMany({ where: { companyId, status: "POSTED" }, orderBy: [{ date: "desc" }, { number: "desc" }], take: 8, select: { id: true, number: true, date: true, label: true, total: true, isManual: true, reversalOfId: true } }),
    db.journalEntry.count({ where: { companyId, status: "PENDING" } }),
    monthsOf({ company, timeZone }),
    db.department.findMany({ where: { companyId }, select: { name: true, ledgerSyncedAt: true } }),
  ]);
  const A = bs.assets;
  const P = bs.liabilities;
  const toClose = months.filter((m) => m.status === "OPEN" && m.month < todayKey.slice(0, 7));
  const synced = departments.map((d) => d.ledgerSyncedAt).filter(Boolean).sort().at(0);
  return (
    <div className="space-y-5">
      {pending && access.isBoss ? <Banner tone="warn" action={<Link className="font-medium underline" href={`/accounting/${companyId}/entries?status=PENDING`}>Review</Link>}>{pending} entr{pending > 1 ? "ies wait" : "y waits"} for your approval.</Banner> : null}
      {toClose.length > 1 ? <Banner tone="info" action={<Link className="font-medium underline" href={`/accounting/${companyId}/closing`}>Closing</Link>}>{toClose.length} past months are still open. Closing a month freezes its figures.</Banner> : null}
      {!bs.balanced ? <Banner tone="bad">The balance sheet does not balance: contact support.</Banner> : null}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone="dark" label={`Result since ${formatDateKey(yearFrom, { weekday: false })}`} value={<Money value={is.lines.XI} />} hint={`Turnover ${formatMoney(is.lines.XB)}`} href={`/accounting/${companyId}/statements?period=custom&from=${yearFrom}&to=${todayKey}`} />
        <StatCard label="Bank, Mobile Money and cash" value={<Money value={A.BS - P.DR} />} hint="Net treasury today" href={`/accounting/${companyId}/ledger?account=5`} />
        <StatCard tone="in" label="Owed by customers and tenants" value={<Money value={A.BI} />} hint={`Paid ahead by customers: ${formatMoney(P.DI)}`} href={`/accounting/${companyId}/partners`} />
        <StatCard tone="out" label="Owed to suppliers, taxes, others" value={<Money value={P.DJ + P.DK + P.DM + P.DH} />} hint={`Deposits held: ${formatMoney(P.DA)}`} href={`/accounting/${companyId}/partners?side=suppliers`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Latest entries" className="lg:col-span-2" actions={<Link className="text-sm underline" href={`/accounting/${companyId}/entries`}>All entries</Link>} bodyClassName="p-0">
          <DataTable
            dense
            rows={recent.map((e) => ({ ...e, dateKey: e.date.toISOString().slice(0, 10) }))}
            empty="No entries yet."
            columns={[
              { key: "dateKey", label: "Date", render: (e) => formatDateKey(e.dateKey, { weekday: false }) },
              { key: "number", label: "No.", render: (e) => <Link className="font-mono text-xs underline" href={`/accounting/${companyId}/entries/${e.id}`}>{e.number}</Link> },
              { key: "label", label: "Label", render: (e) => <span className="line-clamp-1">{e.label}{e.isManual ? <span className="ml-1 text-xs text-slate-500">(manual)</span> : null}</span> },
              { key: "total", label: "Amount", align: "right", render: (e) => <Money value={e.total} suffix={false} /> },
            ]}
          />
        </Section>
        <Section title="The books" description="Kept by the app from every department's records.">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Departments</dt><dd>{departments.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Last update</dt><dd>{synced ? new Date(synced).toLocaleString("en-GB", { timeZone }) : "—"}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Open months</dt><dd>{toClose.length + 1}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Equity</dt><dd><Money value={P.CP} /></dd></div>
          </dl>
          <div className="mt-4"><SyncBooksButton companyId={companyId} /></div>
        </Section>
      </div>
    </div>
  );
}

/** A head keeping only his departments' books: their result, treasury, customers and latest entries. */
async function DepartmentBooksOverview({ companyId, company, access, todayKey, timeZone, yearFrom }) {
  const departmentIds = access.departmentIds;
  const [is, tb, customers, recent, departments] = await Promise.all([
    incomeStatementFor({ company, fromKey: yearFrom, toKey: todayKey, departmentIds, compare: false }),
    trialBalance({ company, fromKey: yearFrom, toKey: todayKey, departmentIds }),
    partnerLedger({ company, side: "customers", asOfKey: todayKey, departmentIds }),
    db.journalEntry.findMany({ where: { companyId, status: "POSTED", ...entryScope(access) }, orderBy: [{ date: "desc" }, { number: "desc" }], take: 8, select: { id: true, number: true, date: true, label: true, total: true, isManual: true } }),
    db.department.findMany({ where: { id: { in: departmentIds } }, select: { name: true, ledgerSyncedAt: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const treasury = tb.rows.filter((r) => r.number.startsWith("5")).reduce((s, r) => s + r.closing, 0);
  const synced = departments.map((d) => d.ledgerSyncedAt).filter(Boolean).sort().at(0);
  return (
    <div className="space-y-5">
      <Banner tone="info">You keep the books of {departments.map((d) => d.name).join(", ")}. The company's balance sheet, VAT return and closing are kept by the Boss.</Banner>
      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard tone="dark" label={`Result since ${formatDateKey(yearFrom, { weekday: false })}`} value={<Money value={is.lines.XI} />} hint={`Turnover ${formatMoney(is.lines.XB)}`} href={`/accounting/${companyId}/statements?period=custom&from=${yearFrom}&to=${todayKey}`} />
        <StatCard label="Cash, Mobile Money and bank" value={<Money value={treasury} />} hint="Your departments' treasury accounts (class 5)" href={`/accounting/${companyId}/ledger?account=5`} />
        <StatCard tone="in" label="Owed by customers" value={<Money value={customers.totals.owed} />} hint={`Paid ahead: ${formatMoney(customers.totals.ahead)}`} href={`/accounting/${companyId}/partners`} />
      </div>
      <div className="grid gap-5 lg:grid-cols-3">
        <Section title="Latest entries" className="lg:col-span-2" actions={<Link className="text-sm underline" href={`/accounting/${companyId}/entries`}>All entries</Link>} bodyClassName="p-0">
          <DataTable
            dense
            rows={recent.map((e) => ({ ...e, dateKey: e.date.toISOString().slice(0, 10) }))}
            empty="No entries yet."
            columns={[
              { key: "dateKey", label: "Date", render: (e) => formatDateKey(e.dateKey, { weekday: false }) },
              { key: "number", label: "No.", render: (e) => <Link className="font-mono text-xs underline" href={`/accounting/${companyId}/entries/${e.id}`}>{e.number}</Link> },
              { key: "label", label: "Label", render: (e) => <span className="line-clamp-1">{e.label}{e.isManual ? <span className="ml-1 text-xs text-slate-500">(manual)</span> : null}</span> },
              { key: "total", label: "Amount", align: "right", render: (e) => <Money value={e.total} suffix={false} /> },
            ]}
          />
        </Section>
        <Section title="The books" description="Kept by the app from your departments' records.">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-500">Departments</dt><dd>{departments.length}</dd></div>
            <div className="flex justify-between"><dt className="text-slate-500">Last update</dt><dd>{synced ? new Date(synced).toLocaleString("en-GB", { timeZone }) : "—"}</dd></div>
          </dl>
          <div className="mt-4"><SyncBooksButton companyId={companyId} /></div>
        </Section>
      </div>
    </div>
  );
}
