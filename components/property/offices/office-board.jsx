"use client";

import Link from "next/link";
import { useState } from "react";
import { Building2, LayoutGrid, List, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Money } from "@/components/kit/primitives";
import { ExportMenu } from "@/components/kit/export-menu";
import { exportFileName } from "@/lib/export/table-export";
import { UNIT_STATUS } from "@/lib/property/unit-math";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";
import { AccountBadge, UnitStatusBadge } from "../status";
import { BuildingDialog, OfficeDialog } from "./office-dialog";

const TILE = {
  AVAILABLE: "border-emerald-300 bg-emerald-50/70",
  OCCUPIED: "border-rose-300 bg-rose-50/60",
  RESERVED: "border-amber-300 bg-amber-50/70",
  MAINTENANCE: "border-sky-300 bg-sky-50/70",
  UNAVAILABLE: "border-slate-300 bg-slate-100",
  AWAITING_HANDOVER: "border-violet-300 bg-violet-50/70",
};

const EXPORT = [
  { label: "Building", value: (r) => r.building.name },
  { label: "Office", value: "name" },
  { label: "Floor", value: "floor" },
  { label: "Category", value: "category" },
  { label: "Size (m²)", value: "size" },
  { label: "Status", value: (r) => UNIT_STATUS[r.status].label },
  { label: "Tenant", value: (r) => r.lease?.client.name || "" },
  { label: "Contract", value: (r) => r.lease?.referenceNo || "" },
  { label: "Contract ends", value: (r) => r.lease?.endKey || "" },
  { label: "List rent (FCFA)", value: "listRent" },
  { label: "Rent paid now (FCFA)", value: (r) => r.lease?.rentNow ?? "" },
  { label: "Deposit required (FCFA)", value: "depositRequired" },
  { label: "Deposit held (FCFA)", value: (r) => r.account?.deposit.held ?? "" },
  { label: "Owed (FCFA)", value: (r) => r.account?.outstanding ?? "" },
  { label: "Months owed", value: (r) => r.account?.monthsOwed ?? "" },
  { label: "Days overdue", value: (r) => r.account?.daysOverdue ?? "" },
];

/** Every office as coloured tiles (or a table) by building, with its tenant and what is owed. */
export function OfficeBoard({ departmentId, rows, buildings, canManage, canExport, todayKey }) {
  const [dialog, setDialog] = useState(null);
  const [view, setView] = useState("tiles");
  const base = `/d/${departmentId}/offices`;
  const groups = buildings.map((b) => ({ ...b, rows: rows.filter((r) => r.building.id === b.id) })).filter((g) => g.rows.length);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <div className="flex flex-wrap gap-2">
          {canManage ? <Button onClick={() => setDialog({ kind: "office" })}><Plus className="h-4 w-4" /> Add an office</Button> : null}
          {canManage ? <Button variant="outline" onClick={() => setDialog({ kind: "building" })}><Building2 className="h-4 w-4" /> Add a building</Button> : null}
        </div>
        <div className="flex gap-2">
          <div className="flex rounded-md border border-slate-200 p-0.5" role="group" aria-label="View">
            <Button size="sm" variant={view === "tiles" ? "secondary" : "ghost"} aria-pressed={view === "tiles"} onClick={() => setView("tiles")}><LayoutGrid className="h-4 w-4" /> Tiles</Button>
            <Button size="sm" variant={view === "table" ? "secondary" : "ghost"} aria-pressed={view === "table"} onClick={() => setView("table")}><List className="h-4 w-4" /> Table</Button>
          </div>
          {canExport ? <ExportMenu fileName={exportFileName("offices", todayKey)} sheets={{ name: "Offices", columns: EXPORT, rows }} /> : null}
        </div>
      </div>

      {!rows.length ? <p className="rounded-lg border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">No office matches. {canManage ? "Add the first one with “Add an office”." : ""}</p> : null}

      {view === "tiles"
        ? groups.map((g) => (
            <section key={g.id} className="space-y-2" data-testid={`building-${g.name}`}>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-semibold text-slate-900">{g.name}</h2>
                <span className="text-sm text-slate-500">{g.rows.length} office(s) · {g.rows.filter((r) => r.status === "OCCUPIED").length} occupied</span>
                {canManage ? <Button size="icon" variant="ghost" aria-label={`Edit ${g.name}`} onClick={() => setDialog({ kind: "building", building: g })}><Pencil className="h-3.5 w-3.5" /></Button> : null}
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {g.rows.map((r) => (
                  <li key={r.id}>
                    <Link href={`${base}/${r.id}`} className={cn("block rounded-xl border p-3 transition hover:shadow-sm", TILE[r.status])} data-testid={`office-${r.name}`}>
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="text-base font-semibold text-slate-900">{r.name}</div>
                          <div className="text-xs text-slate-500">{[r.floor && `Floor ${r.floor}`, r.category, r.size && `${r.size} m²`].filter(Boolean).join(" · ") || "—"}</div>
                        </div>
                        <UnitStatusBadge status={r.status} />
                      </div>
                      <div className="mt-2 text-sm">
                        {r.lease ? (
                          <>
                            <div className="truncate font-medium text-slate-800">{r.lease.client.name}</div>
                            <div className="flex items-center justify-between gap-2 text-xs text-slate-600">
                              <span>{formatMoney(r.lease.rentNow)} / month</span>
                              {r.account?.outstanding ? <span className="font-semibold text-rose-700">owes {formatMoney(r.account.outstanding)}</span> : <AccountBadge status={r.account?.status} />}
                            </div>
                          </>
                        ) : (
                          <div className="text-xs text-slate-600">{formatMoney(r.listRent)} / month{r.stateNote ? ` · ${r.stateNote}` : ""}{r.availableFromKey ? ` · from ${r.availableFromKey}` : ""}</div>
                        )}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          ))
        : (
          <div className="rounded-xl border border-slate-200 bg-white">
            <DataTable
              stickyHeader
              rows={rows}
              columns={[
                { key: "building", label: "Building", render: (r) => r.building.name },
                { key: "name", label: "Office", render: (r) => <Link className="font-medium hover:underline" href={`${base}/${r.id}`}>{r.name}</Link> },
                { key: "status", label: "Status", render: (r) => <UnitStatusBadge status={r.status} /> },
                { key: "tenant", label: "Tenant", render: (r) => r.lease?.client.name || "—" },
                { key: "rent", label: "Rent", align: "right", render: (r) => <Money value={r.lease?.rentNow ?? r.listRent} suffix={false} /> },
                { key: "deposit", label: "Deposit held", align: "right", render: (r) => (r.account ? <Money value={r.account.deposit.held} suffix={false} /> : "—") },
                { key: "owed", label: "Owed", align: "right", render: (r) => (r.account?.outstanding ? <Money value={r.account.outstanding} className="font-semibold text-rose-700" suffix={false} /> : "—") },
                { key: "months", label: "Months owed", align: "right", render: (r) => r.account?.monthsOwed || "—" },
              ]}
            />
          </div>
        )}

      {dialog?.kind === "office" ? <OfficeDialog departmentId={departmentId} buildings={buildings} thisMonth={todayKey.slice(0, 7)} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "building" ? <BuildingDialog departmentId={departmentId} building={dialog.building} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
