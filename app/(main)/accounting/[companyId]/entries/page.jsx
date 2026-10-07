import Link from "next/link";
import { Plus } from "lucide-react";
import { accountingPage } from "@/lib/accounting/page";
import { journalEntries } from "@/lib/accounting/reports";
import { JOURNALS } from "@/lib/accounting/chart";
import { fiscalYearStart } from "@/lib/accounting/balances";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { formatDateKey } from "@/lib/timezone";
import { Button } from "@/components/ui/button";
import { Pill, Section, StatementAmount } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { FilterBar } from "@/components/kit/filter-bar";
import { ExportMenu } from "@/components/kit/export-menu";

export const dynamic = "force-dynamic";
export const metadata = { title: "Journal entries" };

const STATUS = { POSTED: ["Posted", "emerald"], PENDING: ["Waiting for approval", "amber"], DRAFT: ["Draft", "slate"], REJECTED: ["Rejected", "rose"] };

/** The journals: every entry with its lines, by journal, status or text. */
export default async function EntriesPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, todayKey } = await accountingPage(companyId);
  const range = resolvePeriod(sp, todayKey, "month");
  if (range.preset === "year") range.fromKey = fiscalYearStart(todayKey, company.fiscalYearStartMonth);
  const journal = JOURNALS.some((j) => j.code === sp?.journal) ? sp.journal : null;
  const status = STATUS[sp?.status] ? sp.status : null;
  const q = typeof sp?.q === "string" && sp.q.trim() ? sp.q.trim().slice(0, 60) : null;
  const page = Math.max(1, Number(sp?.page) || 1);
  const { total, rows } = await journalEntries({ company, journal, status, q, fromKey: status === "PENDING" ? "2000-01-01" : range.fromKey, toKey: status === "PENDING" ? "2999-12-31" : range.toKey, take: 100, skip: (page - 1) * 100 });
  const pages = Math.ceil(total / 100);
  const qs = (patch) => `?${new URLSearchParams({ ...Object.fromEntries(Object.entries(sp || {}).filter(([, v]) => typeof v === "string")), ...patch })}`;
  return (
    <div className="space-y-4">
      <PeriodPicker range={range} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar fields={[
          { name: "q", label: "Search", type: "search", placeholder: "Number, label, reference (S-0142, RC-0003 …)" },
          { name: "journal", label: "Journal", type: "select", options: [{ value: "", label: "All journals" }, ...JOURNALS.map((j) => ({ value: j.code, label: `${j.code} · ${j.label}` }))] },
          { name: "status", label: "Status", type: "select", options: [{ value: "", label: "Posted and waiting" }, ...Object.entries(STATUS).map(([k, [l]]) => ({ value: k, label: l }))] },
        ]} />
        <div className="flex gap-2">
          <ExportMenu fileName={`${company.name}-entries-${range.fromKey}-${range.toKey}`} sheets={[{ name: "Écritures", columns: [{ label: "Date", value: "date" }, { label: "Journal", value: "journal" }, { label: "Entry", value: "number" }, { label: "Account", value: "account" }, { label: "Label", value: "label" }, { label: "Partner", value: "partner" }, { label: "Debit", value: "debit" }, { label: "Credit", value: "credit" }], rows: rows.flatMap((e) => e.lines.map((l) => ({ date: e.dateKey, journal: e.journal.code, number: e.number || e.status, account: l.account.number, label: l.label || e.label, partner: l.partnerName || "", debit: l.debit, credit: l.credit }))) }]} />
          <Button asChild><Link href={`/accounting/${companyId}/entries/new`}><Plus className="h-4 w-4" /> New entry</Link></Button>
        </div>
      </div>
      <Section title={`${total} entr${total === 1 ? "y" : "ies"}`} description={status === "PENDING" ? "Every entry waiting for approval" : periodLabel(range)} bodyClassName="p-0">
        <div className="divide-y divide-slate-100" data-testid="entries">
          {rows.length === 0 ? <p className="px-4 py-8 text-center text-sm text-slate-500">No entries.</p> : rows.map((e) => (
            <Link key={e.id} href={`/accounting/${companyId}/entries/${e.id}`} className="block px-4 py-3 hover:bg-slate-50">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="text-xs text-slate-500">{formatDateKey(e.dateKey, { weekday: false })}</span>
                  <span className="font-mono text-xs">{e.number || "—"}</span>
                  <span className="truncate text-sm font-medium">{e.label}</span>
                  {e.reference ? <span className="text-xs text-slate-500">{e.reference}</span> : null}
                </div>
                <div className="flex items-center gap-2">
                  {e.isManual ? <Pill>Manual</Pill> : null}
                  {e.reversalOfId ? <Pill tone="rose">Reversal</Pill> : e.reversedAt ? <Pill tone="slate">Reversed</Pill> : null}
                  {e.late ? <Pill tone="amber">Late</Pill> : null}
                  {e.status !== "POSTED" ? <Pill tone={STATUS[e.status][1]}>{STATUS[e.status][0]}</Pill> : null}
                  <StatementAmount value={e.total} className="text-sm font-semibold" />
                </div>
              </div>
              <div className="mt-1 grid gap-x-6 text-xs text-slate-500 sm:grid-cols-2">
                {e.lines.slice(0, 6).map((l) => (
                  <div key={l.id} className="flex justify-between gap-2">
                    <span className="truncate"><span className="font-mono">{l.account.number}</span> {l.account.label}{l.partnerName ? ` · ${l.partnerName}` : ""}</span>
                    <span className="tabular-nums">{l.debit ? `D ${l.debit.toLocaleString("fr-FR")}` : `C ${l.credit.toLocaleString("fr-FR")}`}</span>
                  </div>
                ))}
                {e.lines.length > 6 ? <div>… {e.lines.length - 6} more line(s)</div> : null}
              </div>
            </Link>
          ))}
        </div>
        {pages > 1 ? (
          <div className="flex justify-between border-t border-slate-100 px-4 py-2 text-sm">
            {page > 1 ? <Link className="underline" href={qs({ page: String(page - 1) })}>Previous</Link> : <span />}
            <span className="text-slate-500">Page {page} of {pages}</span>
            {page < pages ? <Link className="underline" href={qs({ page: String(page + 1) })}>Next</Link> : <span />}
          </div>
        ) : null}
      </Section>
    </div>
  );
}
