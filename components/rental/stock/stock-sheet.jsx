"use client";

import Link from "next/link";
import { useState } from "react";
import { ImageIcon, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Money, Pill } from "@/components/kit/primitives";
import { ExportMenu } from "@/components/kit/export-menu";
import { exportFileName } from "@/lib/export/table-export";
import { CONDITION_LABELS } from "@/lib/rental/stock-math";
import { cn } from "@/lib/utils";
import { ItemDialog } from "./item-dialog";

const ALERT = { LOW: ["Low", "amber"], EMPTY: ["None in store", "rose"] };

/** The columns of the stock sheet export (every field of a line). */
export const STOCK_EXPORT_COLUMNS = [
  { label: "Code", value: "code" },
  { label: "Item", value: "name" },
  { label: "Category", value: "category" },
  { label: "Description", value: "description" },
  { label: "Owned", value: "owned" },
  { label: "In store", value: "inStock" },
  { label: "Rented out", value: "out" },
  { label: "Damaged", value: "damaged" },
  { label: "Under repair", value: "inRepair" },
  { label: "Missing", value: "missing" },
  { label: "Rental price (FCFA)", value: "rentalPrice" },
  { label: "Purchase price (FCFA)", value: "purchasePrice" },
  { label: "Replacement value (FCFA)", value: "lossValue" },
  { label: "Stock value (FCFA)", value: "value" },
  { label: "Date purchased", value: (r) => (r.purchasedOn ? String(r.purchasedOn).slice(0, 10) : "") },
  { label: "Supplier", value: "supplier" },
  { label: "Condition", value: (r) => CONDITION_LABELS[r.condition] },
  { label: "Storage place", value: "location" },
  { label: "Status", value: (r) => (r.archivedAt ? "Archived" : "Active") },
];

/**
 * The stock sheet: one row per item with its units by state (in the store, out at events,
 * damaged, in repair, missing), prices and value. A row opens the item's page.
 */
export function StockSheet({ departmentId, items, categories, canManage, canExport, todayKey }) {
  const [adding, setAdding] = useState(false);
  const base = `/d/${departmentId}/stock`;
  const n = (v, tone) => (v ? <span className={cn("tabular-nums font-medium", tone)}>{v}</span> : <span className="text-slate-300">0</span>);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        {canManage ? <Button onClick={() => setAdding(true)}><Plus className="h-4 w-4" /> Add an item</Button> : <span />}
        {canExport ? <ExportMenu fileName={exportFileName("stock", todayKey)} sheets={{ name: "Stock", columns: STOCK_EXPORT_COLUMNS, rows: items }} /> : null}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs" data-testid="stock-sheet">
        <DataTable
          stickyHeader
          rows={items}
          empty="No item matches. Add the first one with “Add an item”."
          rowClassName={(r) => (r.archivedAt ? "opacity-60" : "")}
          columns={[
            {
              key: "name",
              label: "Item",
              render: (r) => (
                <Link href={`${base}/${r.id}`} className="flex min-w-48 items-center gap-3 hover:underline" data-testid={`item-${r.name}`}>
                  {r.photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={r.photoUrl} alt="" className="h-9 w-9 shrink-0 rounded-md border object-cover" loading="lazy" />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-dashed text-slate-300"><ImageIcon className="h-4 w-4" /></span>
                  )}
                  <span className="min-w-0">
                    <span className="block font-medium text-slate-900">{r.name}</span>
                    <span className="block text-xs text-slate-500">{r.code} · {r.category}{r.location ? ` · ${r.location}` : ""}</span>
                  </span>
                </Link>
              ),
            },
            { key: "inStock", label: "In store", align: "right", render: (r) => <span className="tabular-nums font-semibold">{r.inStock}<span className="font-normal text-slate-400"> / {r.owned}</span></span> },
            { key: "out", label: "Rented out", align: "right", render: (r) => n(r.out, "text-sky-700") },
            { key: "damaged", label: "Damaged", align: "right", render: (r) => n(r.damaged, "text-amber-700") },
            { key: "inRepair", label: "In repair", align: "right", render: (r) => n(r.inRepair, "text-violet-700") },
            { key: "missing", label: "Missing", align: "right", render: (r) => n(r.missing, "text-rose-700") },
            { key: "rentalPrice", label: "Rental price", align: "right", render: (r) => <Money value={r.rentalPrice} suffix={false} /> },
            { key: "value", label: "Stock value", align: "right", render: (r) => <Money value={r.value} suffix={false} /> },
            { key: "alert", label: "", render: (r) => (r.archivedAt ? <Pill>Archived</Pill> : r.alert ? <Pill tone={ALERT[r.alert][1]}>{ALERT[r.alert][0]}</Pill> : null) },
          ]}
        />
      </div>
      {adding ? <ItemDialog departmentId={departmentId} categories={categories} onClose={() => setAdding(false)} /> : null}
    </div>
  );
}
