"use client";

import { useState } from "react";
import { Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Money, Section } from "@/components/kit/primitives";
import { VoidButton } from "@/components/kit/void-button";
import { ExportMenu } from "@/components/kit/export-menu";
import { useRecorder } from "@/lib/offline/react";
import { purchaseVoidSpec } from "@/lib/rental/specs";
import { attachmentUrl } from "@/lib/attachments-url";
import { exportFileName } from "@/lib/export/table-export";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { PurchaseDialog } from "./purchase-dialog";

/** The purchases of the period, each with its lines, receipt and the assets it registered. */
export function PurchasesBoard({ departmentId, purchases, items, canRecord, canVoid, canExport, currentUserName, periodKey }) {
  const record = useRecorder();
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-between gap-2 print:hidden">
        {canRecord ? <Button onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Record a purchase</Button> : <span />}
        {canExport ? (
          <ExportMenu
            fileName={exportFileName("purchases", periodKey)}
            sheets={{
              name: "Purchases",
              columns: [
                { label: "Date", value: "dateKey" },
                { label: "No.", value: "referenceNo" },
                { label: "Supplier", value: "supplier" },
                { label: "Items", value: (p) => p.lines.map((l) => `${l.quantity} × ${l.name} @ ${l.unitCost}`).join("; ") },
                { label: "Total (FCFA)", value: "total" },
                { label: "Paid by", value: "method" },
                { label: "Reference", value: "reference" },
                { label: "Bought by", value: "boughtBy" },
                { label: "Assets", value: (p) => p.assets.join(", ") },
                { label: "Status", value: (p) => (p.voided ? "Void" : "") },
              ],
              rows: purchases,
            }}
          />
        ) : null}
      </div>
      <Section bodyClassName="p-0">
        <DataTable
          rows={purchases}
          empty="No purchase in this period."
          rowClassName={(p) => (p.voided ? "opacity-50" : "")}
          columns={[
            { key: "d", label: "Date", render: (p) => <span className="whitespace-nowrap">{formatDateKey(p.dateKey, { weekday: false })}<span className="block font-mono text-xs text-slate-400">{p.referenceNo}</span></span> },
            { key: "s", label: "Supplier", render: (p) => <span className="font-medium">{p.supplier}<span className="block text-xs font-normal text-slate-500">{p.method}{p.reference ? ` · ${p.reference}` : ""}</span></span> },
            { key: "l", label: "Items", render: (p) => <ul className="text-xs">{p.lines.map((l, i) => <li key={i}>{l.quantity} × {l.name} @ {formatMoney(l.unitCost)}</li>)}</ul> },
            { key: "a", label: "Assets", render: (p) => <span className="text-xs">{p.assets.join(", ") || "—"}</span> },
            { key: "by", label: "Bought by", render: (p) => <span className="text-xs text-slate-600">{p.boughtBy}</span> },
            { key: "t", label: "Total", align: "right", render: (p) => <Money value={p.total} suffix={false} className={p.voided ? "line-through" : ""} /> },
            {
              key: "x",
              label: "",
              align: "right",
              render: (p) => (
                <span className="inline-flex items-center gap-1">
                  {p.proofs.map((f) => <a key={f.id} href={attachmentUrl(f.id)} target="_blank" rel="noreferrer" aria-label={`Proof ${f.fileName}`}><Paperclip className="h-4 w-4 text-slate-500" /></a>)}
                  {!p.voided && canVoid ? <VoidButton reference={p.referenceNo} what="purchase" onVoid={(reason) => record(purchaseVoidSpec(departmentId, p, reason), { success: `${p.referenceNo} voided: its items left the stock.` })} /> : null}
                </span>
              ),
            },
          ]}
        />
      </Section>
      {open ? <PurchaseDialog departmentId={departmentId} items={items} currentUserName={currentUserName} onClose={() => setOpen(false)} /> : null}
    </div>
  );
}
