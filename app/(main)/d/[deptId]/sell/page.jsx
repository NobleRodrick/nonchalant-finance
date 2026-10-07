import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { dayStatus } from "@/lib/departments/day-status";
import { dayBounds, startOfDateKey, formatTimeInZone } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { DayBanner } from "@/components/departments/day-banner";
import { PointOfSale } from "@/components/restaurant/pos";
import { TradeSellPage } from "@/components/trade/pages/trade-sell-page";
import { TRADE_DOMAINS } from "@/lib/domains/trade";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sell" };

export default async function SellPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const page = await departmentPage(deptId, { module: "sell" });
  // Shop, bar, other activity: their own till (products, barcodes, tabs).
  if (TRADE_DOMAINS.includes(page.department.domain)) return <TradeSellPage page={page} searchParams={sp} />;
  const { user, department, perms, renderedAt } = page;
  const { dateKey, todayKey, isToday, timeZone } = pageDate(user, sp?.date);
  const { start, end } = dayBounds(startOfDateKey(dateKey, timeZone), timeZone);
  const [dishes, debtors, sales, status] = await Promise.all([
    db.menuItem.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: [{ sortOrder: "asc" }, { name: "asc" }] }),
    db.debtor.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    db.transaction.findMany({
      where: { departmentId: department.id, type: "SALE", date: { gte: start, lte: end } },
      include: { saleLines: { include: { menuItem: { select: { name: true } } } }, user: { select: { name: true } }, debt: { select: { id: true, referenceNo: true } } },
      orderBy: { date: "desc" },
      take: 200,
    }),
    dayStatus(department.id, dateKey, timeZone),
  ]);
  return (
    <div>
      <PageHeader eyebrow={department.name} title="Sell" description="Tap the dishes, choose how the customer pays, record. Plates leave the stock at once." actions={perms.manageStock ? <DateNav dateKey={dateKey} todayKey={todayKey} /> : null} />
      <DayBanner dateKey={dateKey} isToday={isToday} status={status} departmentId={department.id} />
      <PointOfSale
        departmentId={department.id}
        dateKey={isToday ? null : dateKey}
        dayKey={dateKey}
        renderedAt={renderedAt}
        locked={status.locked}
        canDiscount={perms.discount}
        discountLimit={perms.discount ? null : perms.discountLimited ? department.cashierDiscountLimit : 0}
        canVoid={perms.void}
        departmentName={department.name}
        dishes={serialize(dishes.map((d) => ({ id: d.id, name: d.name, price: Number(d.sellingPrice), available: Number(d.currentQuantity), description: d.description })))}
        debtors={debtors}
        sales={serialize(
          sales.map((s) => ({
            id: s.id,
            referenceNo: s.referenceNo,
            time: formatTimeInZone(s.date, timeZone),
            lines: s.saleLines.map((l) => ({ dishId: l.menuItemId, name: l.menuItem?.name, quantity: Number(l.quantity), unitPrice: Number(l.unitPrice), total: Number(l.totalAmount) })),
            gross: Number(s.grossAmount ?? s.amount),
            discount: Number(s.discountAmount || 0),
            net: Number(s.amount),
            method: s.paymentMethod,
            customer: s.customerName,
            debtRef: s.debt?.referenceNo || null,
            debtId: s.debt?.id || null,
            by: s.user?.name,
            voided: s.status === "VOIDED",
            voidReason: s.voidReason,
          }))
        )}
      />
    </div>
  );
}
