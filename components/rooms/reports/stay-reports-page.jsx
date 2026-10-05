import { pageDate } from "@/lib/page-guards";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { staysReport } from "@/lib/rooms/reports";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { PrintButton } from "@/components/kit/print-button";
import { StayReport } from "./stay-report";

/**
 * Guest house reports for any period (?period=today|week|month|…|custom): income statement, cash
 * flow, balance sheet, revenue and expense reports, apartment profitability, cash collection and
 * verification, balances owed, bookings and occupancy, assets, maintenance. The daily and weekly
 * reports sent automatically are this page with their period; always current.
 */
export async function StayReportsPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "today");
  const report = await staysReport({ departmentId: department.id, organizationId: user.organizationId, fromKey: range.fromKey, toKey: range.toKey, timeZone, todayKey });
  const label = periodLabel(range);
  return (
    <div className="space-y-6">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Reports" description={`${label}. Revenue counts each night stayed on its date; cash shows money the day it moved.`} actions={<PrintButton />}>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <StayReport base={`/d/${department.id}`} departmentId={department.id} report={serialize(report)} label={label} includesToday={range.fromKey <= todayKey && todayKey <= range.toKey} canCount={perms.handover} />
    </div>
  );
}
