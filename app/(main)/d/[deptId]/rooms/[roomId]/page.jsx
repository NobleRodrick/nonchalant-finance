import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/lib/prisma";
import { departmentPage, pageDate } from "@/lib/page-guards";
import { rangeBounds, formatDateKey } from "@/lib/timezone";
import { resolvePeriod, periodLabel } from "@/lib/reports/periods";
import { apartmentsNow, roomHistory } from "@/lib/rooms/room-queries";
import { staysReport } from "@/lib/rooms/reports";
import { assetRegister, registerTotals } from "@/lib/rooms/asset-queries";
import { listRepairs } from "@/lib/rooms/repair-queries";
import { ROOM_STATE_LABELS, STAY_STATUS_LABELS } from "@/lib/rooms/stay-math";
import { categoryLabel } from "@/data/categories";
import { PAYMENT_STATUS_LABELS } from "@/lib/finance/booking-money";
import { formatMoney, formatRate } from "@/lib/format";
import { serialize } from "@/lib/serialize";
import { cn } from "@/lib/utils";
import { DataTable, KeyValues, Money, PageHeader, Section, StatCard, StatusBadge } from "@/components/kit/primitives";
import { PeriodPicker } from "@/components/kit/period-picker";
import { Button } from "@/components/ui/button";
import { STATE_TONE } from "@/components/rooms/state-tone";
import { NewStayButton } from "@/components/rooms/new-stay-button";

export const dynamic = "force-dynamic";

const BADGE = { RESERVED: "RESERVED", CONFIRMED: "CONFIRMED", CHECKED_IN: "OPEN", CHECKED_OUT: "COMPLETED", CANCELLED: "CANCELLED" };

/**
 * One apartment: its profile and state, who is in it, its figures for the period (?period=:
 * revenue, occupancy, expenses, repairs, losses, profit), its full booking history, expenses,
 * assets and repairs.
 */
export default async function ApartmentPage({ params, searchParams }) {
  const { deptId, roomId } = await params;
  const sp = await searchParams;
  const { user, department, domain, perms } = await departmentPage(deptId, { module: "rooms" });
  const { todayKey, timeZone } = pageDate(user, null);
  const range = resolvePeriod(sp, todayKey, "month");
  const { start, end } = rangeBounds(range.fromKey, range.toKey, timeZone);
  const cards = await apartmentsNow({ departmentId: department.id, todayKey });
  const room = cards.find((r) => r.id === roomId);
  if (!room) notFound();
  const [report, history, expenses, assets, openRepairs, doneRepairs] = await Promise.all([
    staysReport({ departmentId: department.id, organizationId: user.organizationId, fromKey: range.fromKey, toKey: range.toKey, timeZone, todayKey }),
    roomHistory({ departmentId: department.id, roomId }),
    db.transaction.findMany({ where: { departmentId: department.id, roomId, type: { in: ["EXPENSE", "OTHER_EXPENSE", "OTHER_INCOME"] }, date: { gte: start, lte: end } }, include: { validatedBy: { select: { name: true } } }, orderBy: { date: "desc" }, take: 300 }),
    assetRegister({ departmentId: department.id, roomId }),
    listRepairs({ departmentId: department.id, view: "open", roomId }),
    listRepairs({ departmentId: department.id, view: "done", fromKey: range.fromKey, toKey: range.toKey, roomId }),
  ]);
  const f = report.profitability.rows.find((r) => r.roomId === roomId) || { revenue: 0, nightsSold: 0, occupancyRate: 0, expenses: 0, repairs: 0, assetLosses: 0, profit: 0, adr: 0, margin: null };
  const reg = registerTotals(assets).total;
  const base = `/d/${department.id}`;
  return (
    <div className="space-y-6">
      <Link href={`${base}/rooms`} className="print:hidden"><Button size="sm" variant="ghost">← Apartments</Button></Link>
      <PageHeader
        eyebrow={`${domain.label} · ${department.name}`}
        title={room.name}
        description={[room.roomType, room.capacity ? `${room.capacity} guests` : null, room.description].filter(Boolean).join(" · ") || undefined}
        actions={perms.roomsBook && room.displayState !== "MAINTENANCE" && room.displayState !== "UNAVAILABLE" ? <NewStayButton departmentId={department.id} rooms={serialize(cards.filter((r) => r.isActive))} todayKey={todayKey} initial={{ roomId }} /> : null}
      >
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <span className={cn("rounded-full border px-2.5 py-0.5 text-xs font-semibold", STATE_TONE[room.displayState])}>{ROOM_STATE_LABELS[room.displayState]}</span>
          {room.current ? <span className="text-sm">In it: <Link className="font-medium underline" href={`${base}/stays/${room.current.id}`}>{room.current.guestName}</Link> ({room.current.guestPhone || "no phone"}) until {formatDateKey(room.current.checkOutKey)}</span> : null}
          {room.stateNote && room.state !== "AVAILABLE" ? <span className="text-sm text-orange-800">{room.stateNote}</span> : null}
        </div>
        <div className="mt-3"><PeriodPicker range={range} /></div>
      </PageHeader>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="apartment-figures">
        <StatCard tone="dark" label="Revenue" value={formatMoney(f.revenue)} hint={`${f.nightsSold} night(s) · ${formatMoney(f.adr)} a night`} />
        <StatCard label="Occupancy" value={formatRate(f.occupancyRate)} hint={periodLabel(range)} />
        <StatCard tone="out" label="Costs" value={formatMoney(f.expenses + f.assetLosses)} hint={`Expenses ${formatMoney(f.expenses - f.repairs)} · repairs ${formatMoney(f.repairs)} · losses ${formatMoney(f.assetLosses)}`} />
        <StatCard tone={f.profit < 0 ? "out" : "in"} label="Profit" value={formatMoney(f.profit)} hint={`Margin ${formatRate(f.margin)}`} />
      </div>

      <div className="grid gap-6 xl:grid-cols-3">
        <Section title="Profile">
          <KeyValues rows={[
            { label: "Rate of a night", value: <Money value={room.nightlyRate} /> },
            room.weeklyRate ? { label: "Rate of a week", value: <Money value={room.weeklyRate} /> } : null,
            room.monthlyRate ? { label: "Rate of a month", value: <Money value={room.monthlyRate} /> } : null,
            { label: "Assets", value: `${reg.units} units · ${formatMoney(reg.value)}${reg.damaged ? ` · ${reg.damaged} damaged` : ""}` },
            { label: "Repairs pending", value: openRepairs.length },
            room.notes ? { label: "Notes", value: room.notes } : null,
          ]} />
        </Section>
        <Section title="Repairs" className="xl:col-span-2" actions={<Link className="text-sm underline" href={`${base}/maintenance?room=${roomId}`}>Maintenance</Link>}>
          <DataTable dense rows={[...openRepairs, ...doneRepairs]} empty="No repair pending or done in the period." columns={[
            { key: "ref", label: "Ref.", render: (r) => r.referenceNo },
            { key: "what", label: "What", render: (r) => r.title },
            { key: "status", label: "Status", render: (r) => (r.status === "DONE" ? `Done ${formatDateKey(r.repairedOnKey, { weekday: false })}` : r.status === "IN_PROGRESS" ? "In progress" : "Reported") },
            { key: "prio", label: "Priority", render: (r) => r.priority.toLowerCase() },
            { key: "cost", label: "Cost", align: "right", render: (r) => <Money value={r.actualCost ?? r.estimatedCost ?? 0} /> },
          ]} />
        </Section>
      </div>

      <Section title="Booking history" description="Every booking of this apartment, newest first">
        <DataTable dense rows={serialize(history)} empty="No booking yet." columns={[
          { key: "ref", label: "Booking", render: (s) => <Link className="font-medium hover:underline" href={`${base}/stays/${s.id}`}>{s.referenceNo}</Link> },
          { key: "guest", label: "Guest", render: (s) => s.guestName },
          { key: "dates", label: "Stay", render: (s) => `${formatDateKey(s.checkInKey, { weekday: false })} → ${formatDateKey(s.checkOutKey, { weekday: false })} (${s.nights})` },
          { key: "price", label: "Price", align: "right", render: (s) => (s.complimentary ? "Free (package)" : <Money value={s.totalPrice} suffix={false} />) },
          { key: "paid", label: "Paid", align: "right", render: (s) => (s.complimentary ? "—" : <Money value={s.figures.paid} suffix={false} />) },
          { key: "pay", label: "Payment", render: (s) => (s.complimentary ? null : <StatusBadge status={s.figures.paymentStatus} label={PAYMENT_STATUS_LABELS[s.figures.paymentStatus]} />) },
          { key: "status", label: "Status", render: (s) => <StatusBadge status={BADGE[s.status]} label={STAY_STATUS_LABELS[s.status]} /> },
        ]} />
      </Section>

      <div className="grid gap-6 xl:grid-cols-2">
        <Section title="Expenses and income of this apartment" description={periodLabel(range)}>
          <DataTable dense rows={serialize(expenses)} empty="Nothing in this period." columns={[
            { key: "ref", label: "Ref.", render: (t) => t.referenceNo },
            { key: "date", label: "Date", render: (t) => new Date(t.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) },
            { key: "what", label: "What", render: (t) => <span>{categoryLabel(t.category)}<span className="block text-xs text-slate-500">{t.description}{t.counterparty ? ` · ${t.counterparty}` : ""}</span></span> },
            { key: "check", label: "Validated", render: (t) => (t.type === "OTHER_INCOME" ? null : t.validatedBy ? t.validatedBy.name : <span className="text-xs text-amber-700">To validate</span>) },
            { key: "amount", label: "Amount", align: "right", render: (t) => (t.status === "VOIDED" ? <span className="line-through text-slate-400">{formatMoney(t.amount)}</span> : <Money value={t.type === "OTHER_INCOME" ? Number(t.amount) : -Number(t.amount)} />) },
          ]} />
        </Section>
        <Section title="Assets in this apartment" actions={<Link className="text-sm underline" href={`${base}/assets?room=${roomId}`}>Register</Link>}>
          <DataTable dense rows={serialize(assets)} empty="No asset registered." columns={[
            { key: "name", label: "Asset", render: (a) => a.name },
            { key: "qty", label: "Quantity", align: "right", render: (a) => a.quantity },
            { key: "dmg", label: "Damaged", align: "right", render: (a) => a.damaged },
            { key: "value", label: "Value", align: "right", render: (a) => <Money value={a.value} /> },
          ]} />
        </Section>
      </div>
    </div>
  );
}
