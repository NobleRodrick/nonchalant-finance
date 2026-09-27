import { db } from "@/lib/prisma";
import { requirePageUser } from "@/lib/page-guards";
import { serialize } from "@/lib/serialize";
import { orgTimezone } from "@/lib/access";
import { summarizeMoney } from "@/lib/finance/money-math";
import { periodRange, rangeBounds, toDateKey } from "@/lib/timezone";
import { PageHeader } from "@/components/kit/primitives";
import { DepartmentsClient } from "@/components/boss/departments-client";

export const dynamic = "force-dynamic";
export const metadata = { title: "Departments" };

export default async function DepartmentsPage() {
  const user = await requirePageUser({ admin: true });
  const departments = await db.department.findMany({
    where: { organizationId: user.organizationId },
    include: { _count: { select: { memberships: true, transactions: true, menuItems: true, dailyReports: true } } },
    orderBy: { createdAt: "asc" },
  });
  const timeZone = orgTimezone(user);
  const todayKey = toDateKey(new Date(), timeZone);
  const month = periodRange("month", todayKey);
  const { start, end } = rangeBounds(month.fromKey, todayKey, timeZone);
  const [members, monthTx, allHeads] = await Promise.all([
    db.userDepartment.findMany({
      where: { department: { organizationId: user.organizationId }, isActive: true, user: { isActive: true } },
      select: { departmentId: true, userId: true, user: { select: { name: true, title: true, role: true } } },
    }),
    db.transaction.findMany({
      where: { organizationId: user.organizationId, date: { gte: start, lte: end } },
      select: { departmentId: true, type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true },
    }),
    db.user.findMany({ where: { organizationId: user.organizationId, role: "HEAD", isActive: true }, select: { id: true, name: true, title: true }, orderBy: { name: "asc" } }),
  ]);
  return (
    <div>
      <PageHeader title="Departments" description="The parts of your business. Each has a type (restaurant, bar, pressing …) that decides its screens and reports, a head who runs it, and its team." />
      <DepartmentsClient
        people={allHeads}
        departments={serialize(
          departments.map((d) => ({
            id: d.id,
            name: d.name,
            description: d.description,
            domain: d.domain,
            code: d.code,
            isActive: d.isActive,
            cashierDiscountLimit: d.cashierDiscountLimit,
            openingCashFloat: d.openingCashFloat,
            heads: members.filter((m) => m.departmentId === d.id && m.user.role === "HEAD").map((m) => ({ id: m.userId, name: m.user.name, title: m.user.title })),
            month: (() => {
              const m = summarizeMoney(monthTx.filter((t) => t.departmentId === d.id));
              return { moneyIn: m.moneyIn, result: m.result };
            })(),
            typeLocked: d._count.transactions + d._count.menuItems + d._count.dailyReports > 0,
          }))
        )}
      />
    </div>
  );
}
