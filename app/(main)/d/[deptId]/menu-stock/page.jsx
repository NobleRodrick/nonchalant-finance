import { departmentPage, pageDate } from "@/lib/page-guards";
import { loadDayStock } from "@/lib/restaurant/stock-service";
import { dayStatus } from "@/lib/restaurant/day-status";
import { formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { DayBanner } from "@/components/restaurant/day-banner";
import { MenuStockBoard } from "@/components/restaurant/menu-stock";

export const dynamic = "force-dynamic";
export const metadata = { title: "Menu & Stock" };

export default async function MenuStockPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = await searchParams;
  const { user, department, perms } = await departmentPage(deptId, { module: "menu-stock" });
  const { dateKey, todayKey, isToday, timeZone } = pageDate(user, sp?.date);
  const showRemoved = sp?.removed === "1";
  const [stock, status] = await Promise.all([
    loadDayStock({ departmentId: department.id, dateKey, timeZone, includeArchived: showRemoved }),
    dayStatus(department.id, dateKey, timeZone),
  ]);
  return (
    <div>
      <PageHeader
        eyebrow={department.name}
        title="Menu & Stock"
        description="Your dishes and the plates available. Closing = Opening + Added − Sold. Every number updates the moment a sale or an addition is recorded."
        actions={<DateNav dateKey={dateKey} todayKey={todayKey} />}
      />
      <DayBanner dateKey={dateKey} isToday={isToday} status={status} departmentId={department.id} />
      <MenuStockBoard
        departmentId={department.id}
        departmentName={department.name}
        dateKey={dateKey}
        dateLabel={formatDateKey(dateKey)}
        isToday={isToday}
        locked={status.locked}
        canManage={perms.manageStock}
        canBuy={perms.purchases}
        showRemoved={showRemoved}
        stock={serialize({ rows: stock.rows, totals: stock.totals, showSpoiled: stock.showSpoiled, showCorrected: stock.showCorrected })}
      />
    </div>
  );
}
