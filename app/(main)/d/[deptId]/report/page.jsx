import Link from "next/link";
import { db } from "@/lib/prisma";
import { Button } from "@/components/ui/button";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { buildDailyReport, modelFromSaved, LOCKED_STATUSES } from "@/lib/reports/daily-report";
import { startOfDateKey, formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { LiveReport } from "@/components/reports/live-report";

export const dynamic = "force-dynamic";
export const metadata = { title: "Today's report" };

export default async function ReportPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, perms, renderedAt } = await departmentPage(deptId, { module: "report" });
  const { dateKey, todayKey, isToday, timeZone } = pageDate(user, sp?.date);
  const saved = await db.dailyReport.findUnique({
    where: { departmentId_reportDate: { departmentId: department.id, reportDate: startOfDateKey(dateKey, timeZone) } },
    include: { submittedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
  });
  // A sent report is shown exactly as the Boss received it (frozen snapshot); otherwise live.
  const frozen = saved && LOCKED_STATUSES.includes(saved.status) && saved.snapshotJson?.schemaVersion === 2;
  const model = frozen
    ? serialize(modelFromSaved(saved))
    : serialize(await buildDailyReport({ organizationId: user.organizationId, departmentId: department.id, dateKey, timeZone }));
  return (
    <div>
      <PageHeader
        eyebrow={department.name}
        title={isToday ? "Today's report" : `Report of ${formatDateKey(dateKey)}`}
        description={perms.boss ? "The department's day, live. When the head sends it, you review it: approve it or return it with a note." : "Always up to date and printable at any time. At the end of the day, count the cash and send the report to the Boss."}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {perms.boss && saved && ["SUBMITTED", "REVIEWED", "APPROVED", "RETURNED"].includes(saved.status) ? (
              <Link href={`/boss/daily-reports/${saved.id}`}><Button>{saved.status === "APPROVED" || saved.status === "RETURNED" ? "Open review" : "Review this report"}</Button></Link>
            ) : null}
            <DateNav dateKey={dateKey} todayKey={todayKey} />
          </div>
        }
      />
      <LiveReport
        departmentId={department.id}
        dateKey={dateKey}
        renderedAt={renderedAt}
        model={model}
        frozen={Boolean(frozen) || LOCKED_STATUSES.includes(model.status)}
        canSubmit={perms.reportSubmit}
        notes={saved?.notes || ""}
        reviewNotes={saved?.status === "RETURNED" ? saved.reviewNotes : null}
      />
    </div>
  );
}
