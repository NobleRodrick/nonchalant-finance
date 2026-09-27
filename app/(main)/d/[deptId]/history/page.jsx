import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { listHistory, HISTORY_TYPES } from "@/lib/history";
import { isDateKey, formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { HistoryBoard } from "@/components/restaurant/history";

export const dynamic = "force-dynamic";
export const metadata = { title: "History" };

export default async function HistoryPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, perms } = await departmentPage(deptId, { module: "history" });
  const { todayKey, timeZone } = pageDate(user, null);
  const fromKey = isDateKey(sp?.from) ? sp.from : todayKey;
  const toKey = isDateKey(sp?.to) ? sp.to : fromKey > todayKey ? fromKey : todayKey;
  const type = HISTORY_TYPES.some((t) => t.id === sp?.type) ? sp.type : "ALL";
  const status = ["ALL", "VALID", "VOIDED"].includes(sp?.status) ? sp.status : "ALL";
  const [history, people] = await Promise.all([
    listHistory({ organizationId: user.organizationId, departmentId: department.id, fromKey, toKey, type, status, q: sp?.q || "", userId: sp?.user || null, timeZone }),
    db.user.findMany({ where: { OR: [{ memberships: { some: { departmentId: department.id } } }, { organizationId: user.organizationId, role: "ADMIN" }] }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader eyebrow={department.name} title="History" description="Every record with its reference number. Open one to see its details, links and who did what." />
      <HistoryBoard
        departmentId={department.id}
        filters={{ from: fromKey, to: toKey, type, status, q: sp?.q || "", user: sp?.user || "" }}
        rangeLabel={fromKey === toKey ? formatDateKey(fromKey) : `${formatDateKey(fromKey)} – ${formatDateKey(toKey)}`}
        types={HISTORY_TYPES}
        people={people}
        todayKey={todayKey}
        rows={serialize(history.rows)}
        totals={history.totals}
      />
    </div>
  );
}
