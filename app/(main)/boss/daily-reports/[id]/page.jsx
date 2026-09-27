import { notFound } from "next/navigation";
import Link from "next/link";
import { db } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-guards";
import { modelFromSaved } from "@/lib/reports/daily-report";
import { toDateKey, formatDateKey } from "@/lib/timezone";
import { orgTimezone } from "@/lib/access";
import { serialize } from "@/lib/serialize";
import { PageHeader, Section } from "@/components/kit/primitives";
import { DailyReportDocument } from "@/components/reports/daily-report-document";
import { ReviewPanel } from "@/components/boss/review-panel";
import { formatMoney } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata = { title: "Daily report" };

export default async function BossReportPage({ params }) {
  const { id } = await params;
  const user = await requirePageUser({ admin: true });
  const saved = await db.dailyReport.findFirst({
    where: { id, organizationId: user.organizationId },
    include: { department: true, submittedBy: { select: { name: true } }, reviewedBy: { select: { name: true } } },
  });
  if (!saved) notFound();
  const tz = orgTimezone(user);
  const history = await db.auditEvent.findMany({ where: { entityType: "DailyReport", entityId: saved.id }, orderBy: { createdAt: "asc" } });
  const actors = await db.user.findMany({ where: { id: { in: history.map((h) => h.userId).filter(Boolean) } }, select: { id: true, name: true } });
  const sends = history.filter((h) => h.action === "DAILY_REPORT_SENT");
  const dateKey = toDateKey(saved.reportDate, tz);
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={saved.department.name}
        title={`Daily report — ${formatDateKey(dateKey)}`}
        description={<Link className="underline" href="/boss/daily-reports">All daily reports</Link>}
      />
      <ReviewPanel reportId={saved.id} status={saved.status} />
      <DailyReportDocument model={serialize(modelFromSaved(saved))} />
      <Section title="History of this report" className="print:hidden">
        <ol className="space-y-2 text-sm">
          {history.map((h) => (
            <li key={h.id} className="flex flex-wrap justify-between gap-2 border-b border-slate-100 pb-2">
              <span>
                <strong>{h.action.replace("DAILY_REPORT_", "").replace("_", " ").toLowerCase()}</strong>
                {h.afterJson?.version ? ` · version ${h.afterJson.version}` : ""} · {actors.find((a) => a.id === h.userId)?.name || ""}
                {h.afterJson?.note ? ` · “${h.afterJson.note}”` : ""}
              </span>
              <span className="text-xs text-slate-500">
                {h.afterJson?.totals ? `in ${formatMoney(h.afterJson.totals.moneyIn)} · out ${formatMoney(h.afterJson.totals.moneyOut)} · result ${formatMoney(h.afterJson.totals.result)} · ` : ""}
                {new Date(h.createdAt).toLocaleString("en-GB", { timeZone: tz })}
              </span>
            </li>
          ))}
        </ol>
        {sends.length > 1 ? <p className="mt-2 text-xs text-slate-500">The report was sent {sends.length} times; the figures of each version are shown above.</p> : null}
      </Section>
    </div>
  );
}
