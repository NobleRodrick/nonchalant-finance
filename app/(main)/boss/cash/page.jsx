import { db } from "@/lib/prisma";
import { requirePageUser, pageDate } from "@/lib/page-guards";
import { periodRange, rangeBounds, toDateKey, formatDateKey, formatTimeInZone } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { CashReceived } from "@/components/boss/cash-received";
import { CashRequests } from "@/components/boss/cash-requests";
import { listCashRequests } from "@/lib/finance/cash-requests";

export const dynamic = "force-dynamic";
export const metadata = { title: "Cash received" };

export default async function CashReceivedPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requirePageUser({ admin: true });
  const { todayKey, timeZone } = pageDate(user, null);
  const month = periodRange("month", todayKey);
  const { start } = rangeBounds(month.fromKey, month.toKey, timeZone);
  const [pending, recent, departments] = await Promise.all([
    db.cashHandover.findMany({ where: { organizationId: user.organizationId, status: "RECORDED" }, include: { department: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { date: "asc" } }),
    db.cashHandover.findMany({ where: { organizationId: user.organizationId, status: { not: "RECORDED" } }, include: { department: { select: { name: true } }, user: { select: { name: true } } }, orderBy: { date: "desc" }, take: 60 }),
    db.department.findMany({ where: { organizationId: user.organizationId }, select: { id: true, name: true, domain: true, isActive: true }, orderBy: { createdAt: "asc" } }),
  ]);
  const requests = await listCashRequests({ organizationId: user.organizationId, take: 40, timeZone });
  const requestable = departments.filter((d) => d.isActive && d.domain === "RESTAURANT").map((d) => ({ id: d.id, name: d.name }));
  const focusDeptId = requestable.some((d) => d.id === sp?.dept) ? sp.dept : null;
  const monthRows = await db.cashHandover.groupBy({ by: ["departmentId", "status"], where: { organizationId: user.organizationId, date: { gte: start } }, _sum: { amount: true } });
  const perDept = departments.map((d) => {
    const g = (s) => Number(monthRows.find((r) => r.departmentId === d.id && r.status === s)?._sum.amount || 0);
    return { id: d.id, name: d.name, confirmed: g("CONFIRMED"), pending: g("RECORDED"), disputed: g("DISPUTED") };
  }).filter((d) => d.confirmed || d.pending || d.disputed);
  const map = (h) => ({
    id: h.id,
    referenceNo: h.referenceNo,
    department: h.department.name,
    when: `${formatDateKey(toDateKey(h.date, timeZone))} ${formatTimeInZone(h.date, timeZone)}`,
    amount: Number(h.amount),
    by: h.user?.name,
    recipient: h.recipientName,
    reference: h.reference,
    status: h.status,
    note: h.reviewNote,
  });
  return (
    <div>
      <PageHeader title="Cash received" description="Ask your department heads for the cash of a day or a period, and see every amount they hand over to you. Confirm what you received, or dispute an amount." />
      <div className="mb-6">
        <CashRequests departments={requestable} requests={serialize(requests)} todayKey={todayKey} focusDeptId={focusDeptId} />
      </div>
      <CashReceived pending={serialize(pending.map(map))} recent={serialize(recent.map(map))} perDept={perDept} monthLabel={`${formatDateKey(month.fromKey)} – ${formatDateKey(todayKey)}`} />
    </div>
  );
}
