import Link from "next/link";
import { BadgePlus, CalendarPlus, Search } from "lucide-react";
import { db } from "@/lib/prisma";
import { pageDate } from "@/lib/page-guards";
import { serviceDashboard } from "@/lib/services/queries";
import { salonDashboard } from "@/lib/salon/queries";
import { APPOINTMENT_LABELS, APPOINTMENT_TONES } from "@/lib/salon/salon-math";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { PageHeader, Pill, Section, StatCard } from "@/components/kit/primitives";
import { AttentionList } from "@/components/kit/attention-list";
import { ServiceSections } from "@/components/services/service-home";

/** Dashboard of a salon, spa or gym: today's appointments, members, visits, money. */
export async function SalonHome({ page }) {
  const { user, department, domain, perms } = page;
  const { todayKey, timeZone } = pageDate(user, null);
  const [s, d, workers] = await Promise.all([
    salonDashboard({ department, todayKey, timeZone }),
    serviceDashboard({ department, todayKey, timeZone }),
    db.serviceWorker.findMany({ where: { departmentId: department.id, isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const base = `/d/${department.id}`;
  const warnings = [...s.warnings, ...d.warnings];
  const upcoming = s.appointments.filter((a) => a.status !== "CANCELLED");
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={domain.label}
        title={department.name}
        description={formatDateKey(todayKey)}
        actions={
          <div className="flex flex-wrap gap-2">
            <Link href={`${base}/search`}><Button variant="outline"><Search className="h-4 w-4" /> Search</Button></Link>
            {perms.sell ? <Link href={`${base}/memberships`}><Button variant="outline"><BadgePlus className="h-4 w-4" /> Memberships</Button></Link> : null}
            {perms.servicesTicket ? <Link href={`${base}/appointments`}><Button><CalendarPlus className="h-4 w-4" /> Appointments</Button></Link> : null}
          </div>
        }
      />
      <Section title="Alerts" description={warnings.length ? `${warnings.length} point(s) to look at` : undefined}>
        <AttentionList warnings={warnings} base={base} empty="Nothing needs attention: appointments marked, members up to date, nobody left owing." />
      </Section>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" data-testid="salon-today">
        <StatCard tone="dark" label="Appointments today" value={upcoming.length} hint={`${upcoming.filter((a) => a.status === "ARRIVED").length} arrived · ${upcoming.filter((a) => a.status === "BOOKED").length} to come`} href={`${base}/appointments`} />
        <StatCard label="Active members" value={s.members.active} hint={`${s.members.checkIns} check-in(s) today`} href={`${base}/memberships`} />
        <StatCard tone={s.members.renew ? "warn" : "default"} label="To renew soon" value={s.members.renew} href={`${base}/memberships?view=renew`} />
        <StatCard tone="in" label="Memberships sold this month" value={formatMoney(s.memberships.soldMonth)} hint={`${s.memberships.countMonth} sold`} />
      </div>
      <Section title="Today's appointments" actions={<Link className="text-sm underline" href={`${base}/appointments`}>Diary</Link>}>
        {upcoming.length ? <ul className="divide-y divide-slate-100 text-sm">{upcoming.map((a) => <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2"><span><strong className="tabular-nums">{a.time}</strong> · {a.customer} · {a.service || "service to decide"}{a.worker ? ` · ${a.worker}` : ""}</span><Pill tone={APPOINTMENT_TONES[a.status]}>{APPOINTMENT_LABELS[a.status]}</Pill></li>)}</ul> : <p className="text-sm text-slate-500">No appointment today.</p>}
      </Section>
      <ServiceSections page={page} d={d} workers={workers} title="Visits" />
    </div>
  );
}
