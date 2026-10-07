"use client";

import { DataTable, Money, Pill } from "@/components/kit/primitives";
import { VoidButton } from "@/components/kit/void-button";
import { useRecorder } from "@/lib/offline/react";
import { farmEventVoidSpec } from "@/lib/production/specs";
import { formatDateKey } from "@/lib/timezone";

/** A batch's records, newest first; a mistake is voided with a reason (its stock comes back). */
export function BatchEvents({ departmentId, events, canVoid }) {
  const record = useRecorder();
  return (
    <DataTable
      dense
      rows={events}
      empty="Nothing recorded yet."
      rowClassName={(e) => (e.voided ? "opacity-50 line-through" : "")}
      columns={[
        { key: "d", label: "Date", render: (e) => `${formatDateKey(e.dateKey, { weekday: false })} ${e.time}` },
        { key: "k", label: "What", render: (e) => e.label },
        { key: "q", label: "Quantity", align: "right", render: (e) => (e.quantity ? `${e.quantity} ${e.unit || ""}` : "—") },
        { key: "p", label: "Stock", render: (e) => (e.product ? <Pill tone={e.kind === "PRODUCE" ? "emerald" : "amber"}>{e.kind === "PRODUCE" ? "into" : "from"} {e.product}</Pill> : null) },
        { key: "v", label: "Cost", align: "right", render: (e) => (e.value ? <Money value={e.value} suffix={false} /> : "—") },
        { key: "n", label: "Note", render: (e) => <span className="text-xs">{e.voided ? `voided: ${e.voidReason}` : e.note}</span> },
        { key: "b", label: "By", render: (e) => <span className="text-xs">{e.by}</span> },
        { key: "x", label: "", render: (e) => (!e.voided && canVoid && e.kind !== "SALE" ? <VoidButton what="record" reference={e.label} onVoid={(reason) => record(farmEventVoidSpec(departmentId, e, reason), { success: "Voided." })} /> : null) },
      ]}
    />
  );
}
