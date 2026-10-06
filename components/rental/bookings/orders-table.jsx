"use client";

import Link from "next/link";
import { DataTable, Money } from "@/components/kit/primitives";
import { ExportMenu } from "@/components/kit/export-menu";
import { exportFileName } from "@/lib/export/table-export";
import { PAYMENT_STATUS_LABELS } from "@/lib/finance/booking-money";
import { formatDateKey } from "@/lib/timezone";
import { PaymentBadge, StageBadge } from "./stage-badge";

const day = (k) => (k ? formatDateKey(k, { weekday: false }) : "");

export const ORDER_EXPORT_COLUMNS = [
  { label: "Booking", value: "referenceNo" },
  { label: "Customer", value: (o) => o.client.name },
  { label: "Phone", value: (o) => o.client.phone },
  { label: "Event", value: "eventType" },
  { label: "Event date", value: "eventDateKey" },
  { label: "Location", value: "eventLocation" },
  { label: "Dispatch", value: "dispatchDateKey" },
  { label: "Return", value: "returnDateKey" },
  { label: "Stage", value: (o) => o.stage.label },
  { label: "Total (FCFA)", value: (o) => o.figures.total },
  { label: "Paid (FCFA)", value: (o) => o.figures.paid },
  { label: "Balance (FCFA)", value: (o) => o.figures.balance },
  { label: "Payment", value: (o) => (o.overdue ? "Overdue" : PAYMENT_STATUS_LABELS[o.figures.paymentStatus]) },
  { label: "Responsible", value: (o) => o.handledBy?.name || "" },
];

/** Bookings with their customer, event, days, stage, money; a row opens the booking. */
export function OrdersTable({ departmentId, orders, canExport, exportName, empty = "No booking matches." }) {
  const base = `/d/${departmentId}/bookings`;
  return (
    <div className="space-y-2">
      {canExport ? <div className="flex justify-end"><ExportMenu fileName={exportFileName(exportName || "bookings")} sheets={{ name: "Bookings", columns: ORDER_EXPORT_COLUMNS, rows: orders }} /></div> : null}
      <DataTable
        rows={orders}
        empty={empty}
        rowClassName={(o) => (o.status === "CANCELLED" ? "opacity-60" : "")}
        columns={[
          { key: "ref", label: "Booking", render: (o) => <Link className="font-medium underline" href={`${base}/${o.id}`} data-testid={`order-${o.referenceNo}`}>{o.referenceNo}</Link> },
          { key: "client", label: "Customer", render: (o) => <div><div className="font-medium">{o.client.name}</div><div className="text-xs text-slate-500">{o.client.phone}</div></div> },
          { key: "event", label: "Event", render: (o) => <div><div>{o.eventType} · {day(o.eventDateKey)}</div><div className="max-w-56 truncate text-xs text-slate-500">{o.eventLocation}</div></div> },
          { key: "days", label: "Out → back", render: (o) => <span className="whitespace-nowrap text-xs text-slate-600">{day(o.dispatchDateKey)} → {day(o.returnDateKey)}{o.lateReturn ? <span className="ml-1 font-semibold text-rose-700">late</span> : null}</span> },
          { key: "stage", label: "Stage", render: (o) => <StageBadge stage={o.stage} /> },
          { key: "total", label: "Total", align: "right", render: (o) => <Money value={o.figures.total} suffix={false} /> },
          { key: "balance", label: "Balance", align: "right", render: (o) => <div className="flex flex-col items-end gap-1"><Money value={o.figures.balance} suffix={false} /><PaymentBadge order={o} /></div> },
        ]}
      />
    </div>
  );
}
