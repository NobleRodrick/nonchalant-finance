import { pageDate } from "@/lib/page-guards";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { propertyReport, propertyTrends } from "@/lib/property/reports";
import { serialize } from "@/lib/serialize";
import { exportFileName } from "@/lib/export/table-export";
import { PageHeader } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { PrintButton } from "@/components/kit/print-button";
import { PropertyReport } from "./property-report";
import { PropertyReportExport } from "./report-export";

/**
 * Property rental reports for any period (?period=today|week|month|…|custom): income statement
 * by building, office and tenant, rent expected / collected / outstanding, cash flow and cash
 * verification, arrears, deposits held, occupancy, activity, the last 12 months. The automatic
 * daily, weekly and monthly reports are this report with their period.
 */
export async function PropertyReportsPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const [report, trends] = await Promise.all([
    propertyReport({ departmentId: department.id, organizationId: user.organizationId, fromKey: range.fromKey, toKey: range.toKey, timeZone, todayKey }),
    propertyTrends({ department, toKey: range.toKey, months: 12, timeZone }),
  ]);
  const label = periodLabel(range);
  const data = serialize(report);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title="Reports"
        description={`${label}. Rent counts for the days of each month it covers, charges on their bill date; cash shows money the day it moved. Deposits are never income.`}
        actions={<div className="flex gap-2">{perms.export ? <PropertyReportExport report={data} trends={trends} fileName={exportFileName(department.name, "report", range.fromKey, range.toKey)} /> : null}<PrintButton /></div>}
      >
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <PropertyReport base={`/d/${department.id}`} departmentId={department.id} report={data} trends={trends} label={label} includesToday={range.fromKey <= todayKey && todayKey <= range.toKey} canCount={perms.handover} />
    </div>
  );
}
