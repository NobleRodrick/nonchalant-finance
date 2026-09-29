import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { dayStatus } from "@/lib/restaurant/day-status";
import { dayBounds, startOfDateKey, formatTimeInZone } from "@/lib/timezone";
import { summarizeMoney, TYPE_LABELS, METHOD_LABELS } from "@/lib/finance/money-math";
import { categoryLabel } from "@/data/categories";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { DayBanner } from "@/components/restaurant/day-banner";
import { MoneyBoard } from "@/components/restaurant/money";

export const dynamic = "force-dynamic";
export const metadata = { title: "Money in / out" };

export default async function MoneyPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, perms, renderedAt } = await departmentPage(deptId, { module: "money" });
  const { dateKey, todayKey, isToday, timeZone } = pageDate(user, sp?.date);
  const { start, end } = dayBounds(startOfDateKey(dateKey, timeZone), timeZone);
  const [transactions, dishes, status] = await Promise.all([
    db.transaction.findMany({
      where: { departmentId: department.id, date: { gte: start, lte: end } },
      include: { user: { select: { name: true } }, purchase: { include: { lines: true, stockAdds: { include: { menuItem: { select: { name: true } } } } } } },
      orderBy: { date: "desc" },
    }),
    db.menuItem.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, sellingPrice: true, currentQuantity: true } }),
    dayStatus(department.id, dateKey, timeZone),
  ]);
  const money = summarizeMoney(transactions);
  const records = transactions
    .filter((t) => ["RENT_INCOME", "OTHER_INCOME", "DISCOUNT", "PURCHASE", "EXPENSE", "OTHER_EXPENSE", "INCOME"].includes(t.type))
    .map((t) => ({
      id: t.id,
      referenceNo: t.referenceNo,
      type: t.type,
      typeLabel: TYPE_LABELS[t.type] || t.type,
      direction: ["RENT_INCOME", "OTHER_INCOME", "INCOME"].includes(t.type) ? "in" : "out",
      time: formatTimeInZone(t.date, timeZone),
      category: categoryLabel(t.category),
      categoryId: t.category,
      methodCode: t.paymentMethod,
      description: t.description,
      counterparty: t.counterparty,
      method: METHOD_LABELS[t.paymentMethod] || t.paymentMethod,
      amount: Number(t.amount),
      by: t.user?.name,
      voided: t.status === "VOIDED",
      voidReason: t.voidReason,
      purchaseLines: t.purchase?.lines.map((l) => l.description).filter(Boolean) || [],
      platesAdded: t.purchase?.stockAdds.filter((m) => Number(m.quantity) > 0).map((m) => `${Number(m.quantity)} × ${m.menuItem?.name}`) || [],
      stockAdds: t.purchase?.stockAdds.filter((m) => Number(m.quantity) > 0 && !m.voidedAt).map((m) => ({ dishId: m.menuItemId, plates: Number(m.quantity) })) || [],
    }));
  return (
    <div>
      <PageHeader
        eyebrow={department.name}
        title="Money in / out"
        description="Money comes in three ways (sales, rent, other income) and goes out four ways (discounts, purchases, expenses, other expenses)."
        actions={<DateNav dateKey={dateKey} todayKey={todayKey} />}
      />
      <DayBanner dateKey={dateKey} isToday={isToday} status={status} departmentId={department.id} />
      <MoneyBoard
        departmentId={department.id}
        dateKey={isToday ? null : dateKey}
        dayKey={dateKey}
        renderedAt={renderedAt}
        locked={status.locked}
        perms={{ moneyIn: perms.moneyIn, purchases: perms.purchases, expenses: perms.expenses, discounts: perms.discounts, void: perms.void, manageStock: perms.manageStock }}
        summary={serialize({
          salesGross: money.salesGross, saleDiscounts: money.saleDiscounts, standaloneDiscounts: money.standaloneDiscounts, rentIncome: money.rentIncome, otherIncome: money.otherIncome,
          moneyIn: money.moneyIn, discounts: money.discounts, purchases: money.purchases, expenses: money.expenses, otherExpenses: money.otherExpenses, moneyOut: money.moneyOut, result: money.result,
        })}
        records={serialize(records)}
        dishes={serialize(dishes.map((d) => ({ id: d.id, name: d.name, price: Number(d.sellingPrice), available: Number(d.currentQuantity) })))}
      />
    </div>
  );
}
