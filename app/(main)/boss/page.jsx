import { db } from "@/lib/prisma";
import { requirePageUser, pageDate } from "@/lib/page-guards";
import { bossOverview } from "@/lib/boss/overview";
import { formatDateKey } from "@/lib/timezone";
import { serialize } from "@/lib/serialize";
import { PageHeader } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { BossOverview } from "@/components/boss/overview";

export const dynamic = "force-dynamic";
export const metadata = { title: "Overview" };

export default async function BossPage({ searchParams }) {
  const sp = await searchParams;
  const user = await requirePageUser({ admin: true });
  const { dateKey, todayKey, isToday, timeZone } = pageDate(user, sp?.date);
  const departments = await db.department.findMany({ where: { organizationId: user.organizationId, isActive: true }, orderBy: { createdAt: "asc" } });
  const data = departments.length ? await bossOverview({ organizationId: user.organizationId, departments, dateKey, timeZone }) : null;
  const hour = Number(new Intl.DateTimeFormat("en-GB", { hour: "2-digit", hourCycle: "h23", timeZone }).format(new Date()));
  const greeting = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return (
    <div>
      <PageHeader
        eyebrow={user.organization?.name}
        title={`${greeting}, ${user.name.split(" ")[0]}`}
        description={`${isToday ? "Today" : "Viewing"} ${formatDateKey(dateKey)}: the whole business at a glance.`}
        actions={<DateNav dateKey={dateKey} todayKey={todayKey} />}
      />
      <BossOverview data={data ? serialize(data) : null} dateKey={dateKey} isToday={isToday} />
    </div>
  );
}
