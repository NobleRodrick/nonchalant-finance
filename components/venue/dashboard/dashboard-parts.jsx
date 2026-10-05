import Link from "next/link";
import { formatDateKey, daysBetweenKeys } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { PAYMENT_STATUS_LABELS } from "@/lib/venue/booking-math";
import { StatusBadge } from "@/components/kit/primitives";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

/** "Oct 26" (or "October 2026" with `long`) for a month key "2026-10". */
export function monthLabel(monthKey, long = false) {
  const [y, m] = monthKey.split("-").map(Number);
  return long ? `${MONTHS_LONG[m - 1]} ${y}` : `${MONTHS[m - 1]} ${String(y).slice(2)}`;
}

/** The next events: date, client, status, what is still owed. */
export function UpcomingList({ base, bookings, todayKey }) {
  if (!bookings.length) return <p className="py-6 text-center text-sm text-slate-500">No upcoming booking. Free dates are on the calendar.</p>;
  return (
    <ul className="divide-y divide-slate-100" data-testid="venue-upcoming">
      {bookings.map((b) => {
        const days = daysBetweenKeys(todayKey, b.eventDateKey);
        return (
          <li key={b.id}>
            <Link href={`${base}/bookings/${b.id}`} className="flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 hover:bg-slate-50">
              <div className="w-28 shrink-0">
                <div className="text-sm font-semibold text-slate-900">{formatDateKey(b.eventDateKey, { weekday: false })}</div>
                <div className="text-xs text-slate-500">{days === 0 ? "Today" : days === 1 ? "Tomorrow" : `In ${days} days`}</div>
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm text-slate-900">{b.client.name} · {b.eventType}</div>
                <div className="text-xs text-slate-500">{b.referenceNo}{b.guests ? ` · ${b.guests} guests` : ""}</div>
              </div>
              <StatusBadge status={b.status} />
              <div className="w-36 text-right text-sm tabular-nums">
                {b.figures.balance > 0 ? <span className="text-amber-800">{formatMoney(b.figures.balance)} owed</span> : <StatusBadge status={b.figures.paymentStatus} label={PAYMENT_STATUS_LABELS[b.figures.paymentStatus]} />}
              </div>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/** The best months and days of the week by profit. */
export function BestPeriods({ best }) {
  if (!best.months.length) return <p className="py-6 text-center text-sm text-slate-500">Appears once events are completed.</p>;
  const row = (label, p) => (
    <li key={label} className="flex items-baseline justify-between gap-2 py-1.5 text-sm">
      <span className="text-slate-700">{label} <span className="text-xs text-slate-400">· {p.events} event(s)</span></span>
      <span className="font-medium tabular-nums text-slate-900">{formatMoney(p.profit)}</span>
    </li>
  );
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Months</h3>
        <ul>{best.months.map((m) => row(monthLabel(m.monthKey, true), m))}</ul>
      </div>
      <div>
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Days of the week</h3>
        <ul>{best.weekdays.map((w) => row(w.label, w))}</ul>
      </div>
      <p className="text-xs text-slate-500">Profit = event revenue − event expenses − asset losses.</p>
    </div>
  );
}
