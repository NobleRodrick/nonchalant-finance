import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { dayStatus } from "@/lib/departments/day-status";
import { openTabs, productList, salesOfDay } from "@/lib/trade/queries";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { DayBanner } from "@/components/departments/day-banner";
import { TradePOS } from "@/components/trade/pos";

/** Shop, bar, other activity: the till (and the bar's tabs), and the sales of the day. */
export async function TradeSellPage({ page, searchParams: sp }) {
  const { user, department, domain, perms } = page;
  const { dateKey, todayKey, isToday, timeZone } = pageDate(user, sp?.date);
  const [products, debtors, tabs, sales, status] = await Promise.all([
    productList({ departmentId: department.id }),
    db.debtor.findMany({ where: { departmentId: department.id, isActive: true }, orderBy: { name: "asc" }, select: { id: true, name: true, phone: true } }),
    domain.tabs ? openTabs({ departmentId: department.id, timeZone }) : [],
    salesOfDay({ departmentId: department.id, dateKey, timeZone }),
    dayStatus(department.id, dateKey, timeZone),
  ]);
  return (
    <div>
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title={domain.tabs ? "Sell & tabs" : "Sell"}
        description={domain.tabs ? "Scan or tap the drinks, then take the payment — or put the round on a table's tab and take the payment when the customers leave. Bottles leave the stock at once." : "Search, tap or scan the products, choose how the customer pays, record. Goods leave the stock at once; a sale on credit becomes the customer's debt."}
        actions={perms.manageStock ? <DateNav dateKey={dateKey} todayKey={todayKey} /> : null}
      />
      <DayBanner dateKey={dateKey} isToday={isToday} status={status} departmentId={department.id} />
      <TradePOS
        departmentId={department.id}
        domain={department.domain}
        dateKey={isToday ? null : dateKey}
        locked={status.locked || !perms.sell}
        products={serialize(products.filter((p) => p.isActive && p.kind !== "RAW"))}
        debtors={debtors}
        tabs={serialize(tabs)}
        sales={serialize(sales)}
        canPrice={perms.prices}
        canDiscount={perms.discount && perms.prices}
        discountLimit={perms.discountLimited ? Number(department.cashierDiscountLimit || 0) : 0}
        canVoid={perms.void}
        words={domain.words}
      />
    </div>
  );
}
