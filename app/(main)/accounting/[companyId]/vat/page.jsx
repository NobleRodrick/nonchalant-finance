import Link from "next/link";
import { notFound } from "next/navigation";
import { accountingPage } from "@/lib/accounting/page";
import { expensesForVat, vatMonth } from "@/lib/accounting/vat";
import { addMonths, monthOf } from "@/lib/property/rent-schedule";
import { categoryLabel } from "@/data/categories";
import { formatDateKey } from "@/lib/timezone";
import { Banner, KeyValues, Money, Section, StatCard } from "@/components/kit/primitives";
import { FilterBar } from "@/components/kit/filter-bar";
import { ExpenseVatTable, VatReturnButton } from "@/components/accounting/vat-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "VAT" };

/** A month's VAT: collected, deductible (typed from the invoices), the return and what to pay. */
export default async function VatPage({ params, searchParams }) {
  const { companyId } = await params;
  const sp = await searchParams;
  const { company, todayKey, timeZone } = await accountingPage(companyId);
  if (!company.vatEnabled) notFound();
  const month = /^\d{4}-\d{2}$/.test(sp?.month || "") ? sp.month : addMonths(monthOf(todayKey), -1);
  const [v, expenses] = await Promise.all([vatMonth({ company, month }), expensesForVat({ company, month, timeZone })]);
  const ended = month < monthOf(todayKey);
  const label = new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${month}-01T00:00:00Z`));
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <FilterBar fields={[{ name: "month", label: "Month", type: "month" }]} />
        <p className="text-xs text-slate-500">VAT {company.vatRateBp / 100} % from {formatDateKey(company.vatSince.toISOString().slice(0, 10), { weekday: false })}. Collected on income and revenue as recorded (amounts include VAT).</p>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="VAT collected" value={<Money value={v.collected} />} hint="On sales, events, nights, rent, charges" />
        <StatCard label="Deductible VAT" value={<Money value={v.deductible} />} hint="From supplier invoices" />
        <StatCard label="Credit from earlier months" value={<Money value={v.creditBefore} />} />
        <StatCard tone={v.toPay ? "out" : "in"} label={v.toPay ? "VAT to pay" : "Credit carried forward"} value={<Money value={v.toPay || v.carried} />} />
      </div>
      <Section title={`Return of ${label}`} description="Clears the month's VAT accounts into VAT to pay (4441) or a credit carried forward (4449).">
        {v.posted ? (
          <Banner tone="ok">Recorded: <Link className="underline" href={`/accounting/${companyId}/entries/${v.posted.id}`}>{v.posted.number || "waiting for approval"}</Link>. Pay it with an entry "VAT paid": debit 4441, credit the bank.</Banner>
        ) : (
          <>
            <KeyValues rows={[
              ...Object.entries(v.collectedByAccount).filter(([, x]) => x).map(([n, x]) => ({ label: `Collected (${n})`, value: <Money value={x} /> })),
              ...Object.entries(v.deductibleByAccount).filter(([, x]) => x).map(([n, x]) => ({ label: `Deductible (${n})`, value: <Money value={x} /> })),
              v.creditUsed ? { label: "Credit used", value: <Money value={v.creditUsed} /> } : null,
              { label: v.toPay ? "To pay" : "Credit carried forward", value: <Money value={v.toPay || v.carried} />, strong: true },
            ]} />
            <div className="mt-3">{ended ? <VatReturnButton companyId={companyId} month={month} disabled={!v.collected && !v.deductible} /> : <p className="text-sm text-slate-500">The return is recorded after the month has ended.</p>}</div>
          </>
        )}
      </Section>
      <Section title="Expenses of the month" description="Type the VAT shown on each supplier's invoice (0 when the invoice has none). The expense is then split into its cost and the deductible VAT." bodyClassName="p-0">
        <ExpenseVatTable companyId={companyId} locked={Boolean(v.posted)} rows={expenses.map((e) => ({ id: e.id, dateKey: e.dateKey, referenceNo: e.referenceNo, department: e.department.name, what: e.description || categoryLabel(e.category), who: e.counterparty || "", amount: e.amount, taxAmount: e.taxAmount || 0 }))} />
      </Section>
    </div>
  );
}
