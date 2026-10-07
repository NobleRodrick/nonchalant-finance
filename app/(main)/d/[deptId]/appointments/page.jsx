import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { appointmentsOfDay } from "@/lib/salon/queries";
import { serviceCatalog } from "@/lib/services/queries";
import { serialize } from "@/lib/serialize";
import { formatDateKey, isDateKey } from "@/lib/timezone";
import { PageHeader, StatCard } from "@/components/kit/primitives";
import { DateNav } from "@/components/kit/date-nav";
import { AppointmentsBoard } from "@/components/salon/appointments-board";

export const dynamic = "force-dynamic";
export const metadata = { title: "Appointments" };

/** Salon / spa / gym: the appointments of a day (?date=), by staff member. */
export default async function AppointmentsPage({ params, searchParams }) {
  const { deptId } = await params;
  const sp = (await searchParams) || {};
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "appointments" });
  const { todayKey, timeZone } = pageDate(user, null);
  // Appointments may be booked ahead: any day, past or future.
  const dateKey = isDateKey(sp.date || "") ? sp.date : todayKey;
  const [appointments, items, workers] = await Promise.all([
    appointmentsOfDay({ departmentId: department.id, dateKey, timeZone }),
    serviceCatalog({ departmentId: department.id }),
    db.serviceWorker.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const live = appointments.filter((a) => a.status !== "CANCELLED");
  return (
    <div className="space-y-5">
      <PageHeader eyebrow={`${domain.label} · ${department.name}`} title="Appointments" description={`${formatDateKey(dateKey)}. When the customer arrives, the visit opens with the service's price; it is paid like any visit.`} actions={<DateNav dateKey={dateKey} todayKey={todayKey} allowFuture label="Day" />} />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard tone="dark" label="Appointments" value={live.length} />
        <StatCard tone="in" label="Arrived" value={live.filter((a) => a.status === "ARRIVED").length} />
        <StatCard label="Still to come" value={live.filter((a) => a.status === "BOOKED").length} />
        <StatCard tone={live.some((a) => a.status === "NO_SHOW") ? "warn" : "default"} label="Did not come" value={live.filter((a) => a.status === "NO_SHOW").length} />
      </div>
      <AppointmentsBoard departmentId={department.id} dateKey={dateKey} appointments={serialize(appointments)} items={items} workers={workers} canBook={perms.servicesTicket} />
    </div>
  );
}
