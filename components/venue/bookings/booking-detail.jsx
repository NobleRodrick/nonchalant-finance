"use client";

import Link from "next/link";
import { useMemo } from "react";
import { CalendarDays, Phone } from "lucide-react";
import { Banner, KeyValues, Money, PageHeader, Section, StatCard, StatusBadge } from "@/components/kit/primitives";
import { formatDateKey, daysBetweenKeys } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { PAYMENT_STATUS_LABELS } from "@/lib/venue/booking-math";
import { usePendingBookings } from "@/components/venue/use-pending-venue";
import { BookingActions } from "./booking-actions";
import { BookingMoney } from "./booking-money";
import { PackageRooms } from "./package-rooms";
import { EventChecks } from "@/components/venue/assets/event-checks";

const ACTION_LABELS = {
  VENUE_BOOKING_CREATED: "Booked",
  VENUE_BOOKING_UPDATED: "Changed",
  VENUE_BOOKING_MOVED: "Moved",
  VENUE_BOOKING_CONFIRMED: "Confirmed",
  VENUE_BOOKING_COMPLETED: "Event completed",
  VENUE_BOOKING_CANCELLED: "Cancelled",
  VENUE_BOOKING_HOLD_EXTENDED: "Held longer",
};

function historyText(h) {
  const a = h.afterJson || {};
  const b = h.beforeJson || {};
  switch (h.action) {
    case "VENUE_BOOKING_MOVED":
      return `${formatDateKey(b.eventDate)} → ${formatDateKey(a.eventDate)}${a.reason ? ` · ${a.reason}` : ""}`;
    case "VENUE_BOOKING_CANCELLED":
      return a.reason || "";
    case "VENUE_BOOKING_HOLD_EXTENDED":
      return `held until ${formatDateKey(a.holdUntil)}`;
    case "VENUE_BOOKING_UPDATED":
      return Object.keys(a).map((k) => (k === "agreedPrice" ? `agreed price ${formatMoney(b[k])} → ${formatMoney(a[k])}` : k)).join(", ");
    case "VENUE_BOOKING_CREATED":
      return a.suggested !== undefined ? `price of the date + package: ${formatMoney(a.suggested)}` : "";
    default:
      return "";
  }
}

/**
 * Everything about one booking: event, client, price, money, what can be done now, history.
 * Changes made on this computer show at once (sent when connected).
 */
export function BookingDetail({ departmentId, renderedAt, booking: server, hall, heads, takenDates, todayKey, canBook, domainLabel, departmentName, packageStays = [], roomsDepartments = [], assets = [], checks = { before: null, after: null, incidents: [] } }) {
  const rows = usePendingBookings(departmentId, renderedAt, useMemo(() => [server], [server]));
  const b = rows.find((r) => r.id === server.id) || server;
  const f = b.figures;
  const daysTo = daysBetweenKeys(todayKey, b.eventDateKey);
  const pkg = b.packageSnapshot;
  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow={`${domainLabel} · ${departmentName}`}
        title={`${b.referenceNo} · ${b.eventType}`}
        description={`${formatDateKey(b.eventDateKey)} · ${b.client?.name}`}
        actions={canBook ? <BookingActions booking={b} departmentId={departmentId} hall={hall} heads={heads} takenDates={takenDates} todayKey={todayKey} /> : null}
      >
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <StatusBadge status={b.status} />
          <StatusBadge status={f.paymentStatus} label={PAYMENT_STATUS_LABELS[f.paymentStatus]} />
          {b.pending ? <span className="text-xs font-medium text-amber-700">Changes not sent yet</span> : null}
        </div>
      </PageHeader>

      {b.holdExpired ? <Banner tone="bad">The hold of this reservation ended on {formatDateKey(b.holdUntilKey)} without a deposit. It still holds the date: confirm it, hold it longer or cancel it.</Banner> : null}
      {b.status === "RESERVED" && !b.holdExpired && b.holdUntilKey ? <Banner tone="warn">Reserved: the date is held until {formatDateKey(b.holdUntilKey)} unless a deposit is received.</Banner> : null}
      {b.status === "CANCELLED" ? <Banner tone="info">Cancelled{b.cancelReason ? `: ${b.cancelReason}` : ""}. The date is free.</Banner> : null}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total due" value={<Money value={f.total} />} hint={f.charges ? `incl. ${formatMoney(f.charges)} of charges` : "agreed price"} />
        <StatCard label="Paid" value={<Money value={f.paid} />} tone="in" hint={f.refunded ? `${formatMoney(f.refunded)} refunded` : undefined} />
        <StatCard label={f.balance < 0 ? "Paid too much" : "Balance"} value={<Money value={Math.abs(f.balance)} />} tone={f.balance > 0 ? "warn" : "default"} hint={PAYMENT_STATUS_LABELS[f.paymentStatus]} />
        <StatCard label="Event" value={formatDateKey(b.eventDateKey)} icon={CalendarDays} hint={b.status === "COMPLETED" ? "Completed" : daysTo > 0 ? `in ${daysTo} day(s)` : daysTo === 0 ? "Today" : `${-daysTo} day(s) ago`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Event">
          <KeyValues
            rows={[
              ["Hall", hall?.name || "—"],
              ["Date", formatDateKey(b.eventDateKey)],
              ["Time", b.startTime ? `${b.startTime}${b.endTime ? ` – ${b.endTime}` : ""}` : "—"],
              ["Type of event", b.eventType],
              ["Guests", b.guests ?? "—"],
              ["Booked on", b.bookedAt ? new Date(b.bookedAt).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" }) : "—"],
              ["Handled by", b.handledBy?.name || "—"],
              ["Notes", b.notes || "—"],
            ].map(([label, value]) => ({ label, value }))}
          />
        </Section>
        <Section title="Client">
          <KeyValues
            rows={[
              ["Name", b.client?.name],
              ["Phone", b.client?.phone ? <a className="inline-flex items-center gap-1 underline" href={`tel:${b.client.phone}`}><Phone className="h-3.5 w-3.5" /> {b.client.phone}</a> : "—"],
              ["Other phone", b.client?.phoneAlt || "—"],
              ["E-mail", b.client?.email || "—"],
              ["Company / family", b.client?.company || "—"],
            ].map(([label, value]) => ({ label, value }))}
          />
        </Section>
      </div>

      <Section title="Price">
        <KeyValues
          rows={[
            ["Price of the date", <Money key="h" value={b.hallPrice} />],
            ["Package", pkg ? `${pkg.name} (${formatMoney(b.packagePrice)})${pkg.items?.length ? `: ${pkg.items.map((i) => i.label).join(", ")}` : ""}` : "Hall only"],
            ["Agreed price", <Money key="a" value={b.agreedPrice} className="font-semibold" />],
            ["Price note", b.priceNote || "—"],
          ].map(([label, value]) => ({ label, value }))}
        />
      </Section>

      <PackageRooms departmentId={departmentId} booking={b} stays={packageStays} departments={roomsDepartments} canBook={canBook} />

      <BookingMoney departmentId={departmentId} renderedAt={renderedAt} booking={b} canBook={canBook} />

      <EventChecks departmentId={departmentId} booking={b} assets={assets} checks={checks} canBook={canBook} />

      {b.history?.length ? (
        <Section title="History">
          <ol className="space-y-2 text-sm">
            {b.history.map((h) => (
              <li key={h.id} className="flex flex-wrap items-baseline gap-x-2">
                <span className="text-xs tabular-nums text-slate-500">{new Date(h.createdAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}</span>
                <span className="font-medium">{ACTION_LABELS[h.action] || h.action}</span>
                <span className="text-slate-600">{historyText(h)}</span>
                {h.by ? <span className="text-xs text-slate-500">by {h.by}</span> : null}
              </li>
            ))}
          </ol>
        </Section>
      ) : null}
      <p className="text-xs text-slate-400"><Link className="underline" href={`/d/${departmentId}/calendar?month=${b.eventDateKey.slice(0, 7)}`}>See it in the calendar</Link></p>
    </div>
  );
}
