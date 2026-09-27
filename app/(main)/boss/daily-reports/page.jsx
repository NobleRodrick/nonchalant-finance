import { db } from "@/lib/prisma";
import { requirePageUser, pageDate } from "@/lib/page-guards";
import { reportCalendar } from "@/lib/boss/overview";
import { addDaysToKey, daysBetweenKeys, isDateKey, startOfDateKey, toDateKey, formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader, Section } from "@/components/kit/primitives";
import { ReportCalendar } from "@/components/boss/report-calendar";
import { DailyReportsList } from "@/components/boss/daily-reports-list";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily reports" };

export default async function DailyReportsPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requirePageUser({ admin: true });
  const { todayKey, timeZone } = pageDate(user, null);
  let toKey = isDateKey(sp?.to) && sp.to <= todayKey ? sp.to : todayKey;
  let fromKey = isDateKey(sp?.from) ? sp.from : addDaysToKey(toKey, -13);
  if (fromKey > toKey) [fromKey, toKey] = [toKey, fromKey];
  const departments = await db.department.findMany({ where: { organizationId: user.organizationId, domain: "RESTAURANT" }, orderBy: { createdAt: "asc" } });
  const deptFilter = departments.some((d) => d.id === sp?.dept) ? sp.dept : null;
  const status = ["SUBMITTED", "APPROVED", "RETURNED", "DRAFT"].includes(sp?.status) ? sp.status : null;
  const scope = deptFilter ? departments.filter((d) => d.id === deptFilter) : departments;
  const calFrom = daysBetweenKeys(fromKey, toKey) > 30 ? addDaysToKey(toKey, -30) : fromKey;
  const [calendar, reports] = await Promise.all([
    reportCalendar({ organizationId: user.organizationId, departments: scope, fromKey: calFrom, toKey, timeZone }),
    db.dailyReport.findMany({
      where: {
        organizationId: user.organizationId,
        departmentId: { in: scope.map((d) => d.id) },
        reportDate: { gte: startOfDateKey(fromKey, timeZone), lte: startOfDateKey(toKey, timeZone) },
        ...(status ? { status: status === "SUBMITTED" ? { in: ["SUBMITTED", "REVIEWED"] } : status } : {}),
      },
      include: { department: { select: { name: true, code: true } }, submittedBy: { select: { name: true } } },
      orderBy: [{ reportDate: "desc" }],
    }),
  ]);
  return (
    <div className="space-y-6">
      <PageHeader title="Daily reports" description="The reports your departments send at the end of each day. Open one to read it, print it, approve it or return it with a note." />
      <DailyReportsList
        departments={departments.map((d) => ({ id: d.id, name: d.name }))}
        filters={{ from: fromKey, to: toKey, dept: deptFilter || "", status: status || "" }}
        todayKey={todayKey}
        rows={serialize(
          reports.map((r) => ({
            id: r.id,
            dateKey: toDateKey(r.reportDate, timeZone),
            dateLabel: formatDateKey(toDateKey(r.reportDate, timeZone)),
            department: r.department.name,
            referenceNo: r.referenceNo,
            status: r.status,
            version: r.version,
            submittedBy: r.submittedBy?.name,
            submittedAt: r.submittedAt,
            totals: r.totalsJson || {},
          }))
        )}
      />
      <Section title={`Calendar ${formatDateKey(calFrom)} – ${formatDateKey(toKey)}`}>
        <ReportCalendar calendar={serialize(calendar)} />
      </Section>
    </div>
  );
}
