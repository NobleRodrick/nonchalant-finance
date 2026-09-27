import { redirect } from "next/navigation";
import { db } from "@/lib/prisma";
import { listCashRequests, periodLabel } from "@/lib/finance/cash-requests";
import { departmentPage, pageDate, requirePageUser } from "@/lib/page-guards";
import { drawerNow } from "@/lib/finance/posting-service";
import { dayStatus } from "@/lib/restaurant/day-status";
import { toDateKey, formatDateKey, formatTimeInZone } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DayBanner } from "@/components/restaurant/day-banner";
import { CashBoard } from "@/components/restaurant/cash";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash to Boss" };

export default async function CashHandoverPage({ params }) {
  const { deptId } = await params;
  // The Boss receives cash; he does not hand it over. His view is Boss → Cash received.
  const viewer = await requirePageUser();
  if (viewer.role === "ADMIN") redirect(`/boss/cash?dept=${deptId}`);
  const { user, department, perms } = await departmentPage(deptId, { module: "cash" });
  const { todayKey, isToday, timeZone } = pageDate(user, null);
  const [drawer, handovers, status, requests] = await Promise.all([
    drawerNow(db, { organizationId: user.organizationId, departmentId: department.id, timeZone }),
    db.cashHandover.findMany({ where: { departmentId: department.id }, include: { user: { select: { name: true } }, cashRequest: { select: { fromKey: true, toKey: true } } }, orderBy: { date: "desc" }, take: 100 }),
    dayStatus(department.id, todayKey, timeZone),
    listCashRequests({ organizationId: user.organizationId, departmentIds: [department.id], take: 20, timeZone }),
  ]);
  const confirmers = await db.user.findMany({ where: { id: { in: handovers.map((h) => h.confirmedById).filter(Boolean) } }, select: { id: true, name: true } });
  return (
    <div>
      <PageHeader eyebrow={department.name} title="Cash to Boss" description="The cash the drawer should hold right now, the Boss's requests for cash, and every handover with its status." />
      <DayBanner dateKey={todayKey} isToday={isToday} status={status} departmentId={department.id} />
      <CashBoard
        departmentId={department.id}
        departmentName={department.name}
        canHandOver={perms.handover && !status.locked}
        canVoid={perms.void && !status.locked}
        drawer={serialize(drawer)}
        requests={serialize(requests)}
        handovers={serialize(
          handovers.map((h) => ({
            id: h.id,
            transactionId: h.transactionId,
            referenceNo: h.referenceNo,
            dateKey: toDateKey(h.date, timeZone),
            dateLabel: `${formatDateKey(toDateKey(h.date, timeZone))} ${formatTimeInZone(h.date, timeZone)}`,
            amount: Number(h.amount),
            recipient: h.recipientName,
            reference: h.reference,
            status: h.status,
            by: h.user?.name,
            reviewNote: h.reviewNote,
            confirmedBy: confirmers.find((c) => c.id === h.confirmedById)?.name || null,
            isToday: toDateKey(h.date, timeZone) === todayKey,
            requestPeriod: h.cashRequest ? periodLabel(h.cashRequest.fromKey, h.cashRequest.toKey) : null,
          }))
        )}
      />
    </div>
  );
}
