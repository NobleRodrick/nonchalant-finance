import { departmentPage, pageDate } from "@/lib/page-guards";
import { periodLabel, resolvePeriod } from "@/lib/reports/periods";
import { workerBoard } from "@/lib/services/queries";
import { serialize } from "@/lib/serialize";
import { formatMoney } from "@/lib/format";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { WorkersBoard } from "@/components/services/workers-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Washers" };

/** Car wash: washers, their commissions and payouts. */
export default async function WorkersPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "workers" });
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const b = await workerBoard({ departmentId: department.id, fromKey: range.fromKey, toKey: range.toKey, timeZone });
  const active = b.workers.filter((w) => w.isActive);
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Washers" description={`${periodLabel(range)}. Each wash names its washer; the commission of each service is set on the price list.`}>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Washers" value={active.length} />
        <StatCard label="Washes in the period" value={b.workers.reduce((s, w) => s + w.period.tickets, 0)} />
        <StatCard label="Commissions earned (period)" value={formatMoney(b.workers.reduce((s, w) => s + w.period.commission, 0))} />
        <StatCard tone={b.workers.some((w) => w.owed > 0) ? "warn" : "default"} label="Owed to washers" value={formatMoney(b.workers.reduce((s, w) => s + Math.max(0, w.owed), 0))} />
      </div>
      <WorkersBoard departmentId={department.id} workers={serialize(b.workers)} payouts={serialize(b.payouts)} perms={perms} />
    </div>
  );
}
