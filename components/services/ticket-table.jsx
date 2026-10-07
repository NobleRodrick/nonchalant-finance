import Link from "next/link";
import { Zap } from "lucide-react";
import { DataTable, Money, Pill } from "@/components/kit/primitives";
import { STATUS_TONES } from "@/lib/services/ticket-math";
import { formatDateKey } from "@/lib/timezone";
import { QuickSteps } from "./ticket-actions";

/** Tickets as a table: reference, customer / vehicle, items, status, ready by, total and balance, the next step. */
export function TicketTable({ departmentId, tickets, labels, workers = [], canStep, empty = "No ticket here." }) {
  const base = `/d/${departmentId}/tickets`;
  return (
    <DataTable
      rows={tickets}
      empty={empty}
      rowClassName={(t) => (t.late ? "bg-rose-50/50" : t.unclaimed ? "bg-amber-50/50" : "")}
      columns={[
        { key: "r", label: "Ticket", render: (t) => <Link href={`${base}/${t.id}`} className="font-mono text-xs font-semibold underline">{t.referenceNo}</Link> },
        { key: "c", label: "Customer", render: (t) => <span>{t.plate ? <span className="mr-1 rounded bg-slate-900 px-1.5 py-0.5 font-mono text-xs text-white">{t.plate}</span> : null}{t.customer || (t.plate ? "" : "Walk-in")}{t.phone ? <span className="block text-xs text-slate-500">{t.phone}</span> : null}</span> },
        { key: "w", label: "Items", render: (t) => <span className="text-xs">{t.lines.map((l) => `${l.quantity} × ${l.label}`).join(", ")}{t.tagNo ? <span className="block text-slate-500">tag {t.tagNo}</span> : null}</span> },
        { key: "s", label: "Status", render: (t) => <span className="inline-flex flex-wrap items-center gap-1"><Pill tone={STATUS_TONES[t.status]}>{labels[t.status]}</Pill>{t.express ? <Pill tone="amber"><Zap className="h-3 w-3" /> express</Pill> : null}{t.late ? <Pill tone="rose">late</Pill> : null}{t.unclaimed ? <Pill tone="orange">unclaimed</Pill> : null}</span> },
        { key: "p", label: "Ready by", render: (t) => <span className={t.late ? "font-medium text-rose-700" : "text-xs"}>{t.status === "COLLECTED" ? `collected ${formatDateKey(t.collectedKey, { weekday: false })}` : t.status === "READY" ? `ready ${formatDateKey(t.readyKey, { weekday: false })}` : t.promisedLabel || "—"}</span> },
        { key: "t", label: "Total", align: "right", render: (t) => <Money value={t.total} suffix={false} /> },
        { key: "b", label: "To pay", align: "right", render: (t) => (t.status === "CANCELLED" ? "—" : t.balance > 0 ? <strong className="text-rose-700"><Money value={t.balance} suffix={false} /></strong> : <span className="text-xs text-emerald-700">paid</span>) },
        ...(canStep ? [{ key: "x", label: "", render: (t) => <QuickSteps departmentId={departmentId} ticket={t} workers={workers} /> }] : []),
      ]}
    />
  );
}
