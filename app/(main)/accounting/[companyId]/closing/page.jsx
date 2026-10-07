import Link from "next/link";
import { db } from "@/lib/prisma";
import { accountingPage } from "@/lib/accounting/page";
import { closingChecks, monthEnd, monthsOf, openingSuggestions } from "@/lib/accounting/closing";
import { ledgerResult } from "@/lib/accounting/balances";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";
import { Banner, Money, Pill, Section } from "@/components/kit/primitives";
import { Button } from "@/components/ui/button";
import { ClosingActions, AllocationForm } from "@/components/accounting/closing-actions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Closing" };

/** Months open and closed, what to check before closing, opening balances, the year's result. */
export default async function ClosingPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, access, todayKey, timeZone } = await accountingPage(companyId);
  const months = await monthsOf({ company, timeZone });
  const lastEnded = addMonths(monthOf(todayKey), -1);
  const openPast = months.filter((m) => m.status === "OPEN" && m.month <= lastEnded).map((m) => m.month).sort();
  const target = /^\d{4}-\d{2}$/.test(sp?.month || "") && openPast.includes(sp.month) ? sp.month : openPast.at(-1) || null;
  const [checks, opening, lastYear] = await Promise.all([
    target ? closingChecks({ company, month: target, timeZone }) : null,
    openingSuggestions({ company, timeZone }),
    ledgerResult({ companyId, fromKey: `${Number(todayKey.slice(0, 4)) - 1}-${String(company.fiscalYearStartMonth).padStart(2, "0")}-01`, toKey: `${todayKey.slice(0, 4)}-${String(company.fiscalYearStartMonth).padStart(2, "0")}-01` }),
  ]);
  const allocated = await db.journalEntry.findFirst({ where: { companyId, isManual: true, label: { startsWith: "Allocation of the result" }, status: "POSTED", reversedAt: null }, orderBy: { date: "desc" }, select: { label: true, number: true } });
  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Section title="Close the books" description="A closed month is frozen in every department of the company: nothing can be recorded or voided in it, and its figures never change. Months close in order.">
          {!target ? <p className="text-sm text-slate-600">Every past month is closed.</p> : (
            <div className="space-y-3">
              {checks.blocking.map((b) => <Banner key={b} tone="bad">{b}</Banner>)}
              {checks.warnings.map((w) => <Banner key={w} tone="warn">{w}</Banner>)}
              {!checks.blocking.length && !checks.warnings.length ? <Banner tone="ok">Nothing stands in the way.</Banner> : null}
              <ClosingActions companyId={companyId} months={openPast} target={target} canSettle={access.canSettle} blocked={checks.blocking.length > 0} hasClosed={months.some((m) => m.status === "CLOSED")} />
            </div>
          )}
          {target && openPast.length ? null : <ClosingActions companyId={companyId} months={[]} target={null} canSettle={access.canSettle} blocked hasClosed={months.some((m) => m.status === "CLOSED")} />}
        </Section>
        <Section title="Months" bodyClassName="p-0">
          <ul className="divide-y divide-slate-100 text-sm" data-testid="months">
            {months.map((m) => (
              <li key={m.month} className="flex items-center justify-between px-4 py-2">
                <span>{m.label}</span>
                <span className="flex items-center gap-2">
                  {m.status === "CLOSED" ? <Pill tone="slate">Closed</Pill> : m.month > lastEnded ? <Pill tone="sky">Current</Pill> : <Pill tone="amber">Open</Pill>}
                  <Link className="text-xs underline" href={`/accounting/${companyId}/statements?period=custom&from=${m.month}-01&to=${monthEnd(m.month)}`}>Statements</Link>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
      <div className="space-y-5">
        <Section title="Opening balances" description="What the business owned and owed before its first record in the app (bank, Mobile Money, cash in the drawers, equipment, loans, capital).">
          {opening.existing ? (
            <p className="text-sm">Recorded: <Link className="underline" href={`/accounting/${companyId}/entries/${opening.existing.id}`}>{opening.existing.number || "draft"}</Link></p>
          ) : (
            <Button asChild size="sm"><Link href={`/accounting/${companyId}/entries/new?opening=1`}>Record the opening balances</Link></Button>
          )}
        </Section>
        {lastYear.result ? <Section title="Result of last year" description="After the owners decide: part to reserves, part paid as dividends; the rest stays in retained earnings.">
          <p className="mb-3 text-sm">Result: <Money value={lastYear.result} /></p>
          {allocated ? <p className="text-sm text-slate-600">Recorded: {allocated.label} ({allocated.number}).</p> : access.canSettle && lastYear.result > 0 ? <AllocationForm companyId={companyId} year={Number(todayKey.slice(0, 4)) - 1} /> : null}
        </Section> : null}
      </div>
    </div>
  );
}
