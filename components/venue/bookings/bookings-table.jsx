"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Money, StatusBadge } from "@/components/kit/primitives";
import { formatDateKey } from "@/lib/timezone";
import { ACTIVE_STATUSES, PAYMENT_STATUS_LABELS } from "@/lib/venue/booking-math";
import { usePendingBookings } from "@/components/venue/use-pending-venue";
import { BookingDialog } from "./booking-dialog";

/** The booking's money in one cell: balance and payment status. */
export function BalanceCell({ booking }) {
  const f = booking.figures;
  return (
    <span className="inline-flex flex-col items-end gap-0.5">
      <Money value={f.balance} className={f.balance > 0 ? "font-semibold" : "text-slate-500"} />
      <StatusBadge status={f.paymentStatus} label={PAYMENT_STATUS_LABELS[f.paymentStatus]} />
    </span>
  );
}

/**
 * Bookings of a list (one page of the server's list), with this computer's records in effect:
 * new bookings not sent yet appear at the top of the active lists.
 */
export function BookingsTable({ departmentId, renderedAt, rows, status, form, canBook, todayKey, currentUserId }) {
  const shown = usePendingBookings(departmentId, renderedAt, rows);
  const [open, setOpen] = useState(false);
  const list = useMemo(() => {
    const pendingNew = shown.filter((b) => b.pending && String(b.id).startsWith("local:"));
    const keep = (b) => !status || status === "ALL" || (status === "ACTIVE" ? ["RESERVED", "CONFIRMED"].includes(b.status) : b.status === status);
    const server = shown.filter((b) => !String(b.id).startsWith("local:")).filter(keep);
    return [...pendingNew.filter(keep), ...server];
  }, [shown, status]);
  const taken = shown.filter((b) => ACTIVE_STATUSES.includes(b.status)).map((b) => b.eventDateKey);
  const base = `/d/${departmentId}`;
  const columns = [
    {
      key: "ref",
      label: "Booking",
      render: (b) =>
        String(b.id).startsWith("local:") ? (
          <span className="font-medium text-amber-700">Not sent yet</span>
        ) : (
          <Link className="font-medium underline-offset-2 hover:underline" href={`${base}/bookings/${b.id}`}>{b.referenceNo}</Link>
        ),
    },
    { key: "date", label: "Event date", render: (b) => <span className="whitespace-nowrap">{formatDateKey(b.eventDateKey)}</span> },
    { key: "client", label: "Client", render: (b) => <span><span className="font-medium">{b.client?.name}</span>{b.client?.phone ? <span className="block text-xs text-slate-500">{b.client.phone}</span> : null}</span> },
    { key: "event", label: "Event", render: (b) => <span>{b.eventType}{b.guests ? <span className="block text-xs text-slate-500">{b.guests} guests</span> : null}</span> },
    {
      key: "status",
      label: "Status",
      render: (b) => (
        <span className="inline-flex flex-col items-start gap-0.5">
          <StatusBadge status={b.status} />
          {b.pending ? <span className="text-[11px] font-medium text-amber-700">Not sent yet</span> : b.holdExpired ? <span className="text-[11px] font-semibold text-rose-700">Hold over</span> : null}
        </span>
      ),
    },
    { key: "price", label: "Price", align: "right", render: (b) => <Money value={b.figures.total} /> },
    { key: "paid", label: "Paid", align: "right", render: (b) => <Money value={b.figures.paid} /> },
    { key: "balance", label: "Balance", align: "right", render: (b) => <BalanceCell booking={b} /> },
  ];
  return (
    <div className="space-y-3">
      {canBook && form.hall ? (
        <div className="flex justify-end">
          <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> New booking</Button>
        </div>
      ) : null}
      <DataTable columns={columns} rows={list} empty="No booking here." rowClassName={(b) => (b.pending ? "bg-amber-50/40" : "")} />
      {open ? (
        <BookingDialog open onOpenChange={setOpen} departmentId={departmentId} hall={form.hall} packages={form.packages} heads={form.heads} takenDates={taken} currentUserId={currentUserId} todayKey={todayKey} />
      ) : null}
    </div>
  );
}
