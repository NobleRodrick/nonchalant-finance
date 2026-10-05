import { pageDate } from "@/lib/page-guards";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { venueReport } from "@/lib/venue/reports";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { PrintButton } from "@/components/kit/print-button";
import { VenueReport } from "./venue-report";

/**
 * Event venue reports for any period (?period=today|week|month|…|custom): income statement, cash
 * flow, cash verification and counts, event profitability, balances owed, cancellations, leads and
 * assets. The daily, weekly and monthly reports are this page with their period; always current.
 */
export async function VenueReportsPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "today");
  const report = await venueReport({ departmentId: department.id, organizationId: user.organizationId, fromKey: range.fromKey, toKey: range.toKey, timeZone, todayKey });
  const label = periodLabel(range);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title="Reports"
        description={`${label}. Revenue counts each event on its date once it took place; cash shows money the day it moved.`}
        actions={<PrintButton />}
      >
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <VenueReport
        base={`/d/${department.id}`}
        departmentId={department.id}
        report={serialize(report)}
        label={label}
        includesToday={range.fromKey <= todayKey && todayKey <= range.toKey}
        canCount={perms.handover}
      />
    </div>
  );
}
