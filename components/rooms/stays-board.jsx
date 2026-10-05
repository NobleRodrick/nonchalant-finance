"use client";

import Link from "next/link";
import { useState } from "react";
import { Gift, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Money, StatusBadge } from "@/components/kit/primitives";
import { formatDateKey } from "@/lib/timezone";
import { PAYMENT_STATUS_LABELS } from "@/lib/finance/booking-money";
import { STAY_STATUS_LABELS } from "@/lib/rooms/stay-math";
import { StayDialog } from "./stay-dialog";

export const STAY_BADGE = { RESERVED: "RESERVED", CONFIRMED: "CONFIRMED", CHECKED_IN: "OPEN", CHECKED_OUT: "COMPLETED", CANCELLED: "CANCELLED" };

/** The bookings of one view (upcoming, current, completed, cancelled) with their money. */
export function StaysBoard({ departmentId, stays, rooms, todayKey, canBook }) {
  const [create, setCreate] = useState(false);
  const base = `/d/${departmentId}`;
  const columns = [
    { key: "ref", label: "Booking", render: (s) => <Link className="font-medium hover:underline" href={`${base}/stays/${s.id}`}>{s.referenceNo}</Link> },
    { key: "room", label: "Apartment", render: (s) => s.room.name },
    { key: "guest", label: "Guest", render: (s) => <span>{s.guestName}{s.guestPhone ? <span className="block text-xs text-slate-500">{s.guestPhone}</span> : null}</span> },
    { key: "dates", label: "Stay", render: (s) => <span className="whitespace-nowrap">{formatDateKey(s.checkInKey, { weekday: false })} → {formatDateKey(s.checkOutKey, { weekday: false })} <span className="text-slate-500">({s.nights})</span></span> },
    {
      key: "price",
      label: "Price",
      align: "right",
      render: (s) =>
        s.complimentary ? (
          <span className="inline-flex flex-col items-end text-xs">
            <span className="inline-flex items-center gap-1 font-semibold text-violet-800"><Gift className="h-3.5 w-3.5" /> Free (venue package)</span>
            {s.sourceVenueBooking ? <Link className="underline" href={`/d/${s.sourceVenueBooking.departmentId}/bookings/${s.sourceVenueBooking.id}`}>{s.sourceVenueBooking.referenceNo} · {s.sourceVenueBooking.department?.name}</Link> : null}
          </span>
        ) : (
          <Money value={s.totalPrice} />
        ),
    },
    { key: "paid", label: "Paid", align: "right", render: (s) => (s.complimentary ? "—" : <Money value={s.figures.paid} suffix={false} />) },
    { key: "balance", label: "Balance", align: "right", render: (s) => (s.complimentary ? "—" : <Money value={s.figures.balance} suffix={false} className={s.figures.balance > 0 ? "font-semibold text-amber-800" : undefined} />) },
    { key: "pay", label: "Payment", render: (s) => (s.complimentary ? null : <StatusBadge status={s.figures.paymentStatus} label={PAYMENT_STATUS_LABELS[s.figures.paymentStatus]} />) },
    { key: "status", label: "Status", render: (s) => <StatusBadge status={STAY_BADGE[s.status]} label={STAY_STATUS_LABELS[s.status]} /> },
  ];
  return (
    <div className="space-y-3">
      {canBook && rooms.length ? <div className="flex justify-end print:hidden"><Button onClick={() => setCreate(true)}><Plus className="h-4 w-4" /> New booking</Button></div> : null}
      <DataTable columns={columns} rows={stays} empty="No booking here." />
      {create ? <StayDialog departmentId={departmentId} rooms={rooms} todayKey={todayKey} onClose={() => setCreate(false)} /> : null}
    </div>
  );
}
