"use client";

import Link from "next/link";
import { useState } from "react";
import { Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, StatCard, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { saveVenueAsset } from "@/actions/venue";
import { CATEGORY_LABELS, incidentTotals } from "@/lib/venue/asset-math";
import { SettleDialog } from "./settle-dialog";

function AssetDialog({ departmentId, asset, onClose }) {
  const [f, setF] = useState({ name: asset?.name || "", category: asset?.category || "CHAIRS", quantity: asset?.quantity ?? "", unitValue: asset?.unitValue ?? "", notes: asset?.notes || "", isActive: asset ? asset.isActive : true });
  const [busy, setBusy] = useState(false);
  const valid = f.name.trim() && f.quantity !== "";
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(saveVenueAsset({ departmentId, id: asset?.id, ...f, name: f.name.trim() }), { success: asset ? "Asset updated." : "Asset added." });
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={asset ? asset.name : "New asset"} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>{asset ? "Save" : "Add the asset"}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Name" required htmlFor="as-name"><input id="as-name" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Chiavari chairs" /></Field>
        <Field label="Category" htmlFor="as-cat">
          <select id="as-cat" className={selectClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.entries(CATEGORY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </Field>
        <Field label="Units owned" required htmlFor="as-qty"><input id="as-qty" className={inputClass} inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: wholeNumber(e.target.value) })} /></Field>
        <Field label="Value of one unit (FCFA)" htmlFor="as-value" hint="To estimate what a damaged or missing unit costs."><input id="as-value" className={inputClass} inputMode="numeric" value={f.unitValue} onChange={(e) => setF({ ...f, unitValue: wholeNumber(e.target.value) })} /></Field>
      </div>
      <Field label="Notes" htmlFor="as-notes"><input id="as-notes" className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {asset ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Checked at every event</label> : null}
    </FormDialog>
  );
}

/** The hall's inventory, the differences found after events and how they were settled. */
export function AssetsBoard({ departmentId, assets, incidents, canManage, canBook }) {
  const [editing, setEditing] = useState(null);
  const [settle, setSettle] = useState(null);
  const totals = incidentTotals(incidents);
  const openBy = (assetId, kind) => incidents.filter((i) => i.assetId === assetId && i.status === "OPEN" && i.kind === kind).reduce((s, i) => s + i.quantity, 0);
  const value = assets.reduce((s, a) => s + a.quantity * a.unitValue, 0);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-4">
        <StatCard label="Inventory value" value={<Money value={value} />} hint={`${assets.length} asset(s)`} />
        <StatCard label="To settle" value={<Money value={totals.open} />} tone={totals.open ? "warn" : "default"} hint="damaged or missing after events" />
        <StatCard label="Charged to clients" value={<Money value={totals.charged} />} tone="in" />
        <StatCard label="Losses of the hall" value={<Money value={totals.loss} />} tone="out" />
      </div>
      <Section title="Inventory" actions={canManage ? <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add an asset</Button> : null}>
        <DataTable
          rows={assets}
          empty="No asset yet: add the chairs, tables, decorations, sound and lighting equipment."
          columns={[
            { key: "name", label: "Asset", render: (a) => <span><span className="font-medium">{a.name}</span><span className="block text-xs text-slate-500">{CATEGORY_LABELS[a.category]}</span></span> },
            { key: "qty", label: "Owned", align: "right", render: (a) => a.quantity },
            { key: "dmg", label: "Damaged (to settle)", align: "right", render: (a) => openBy(a.id, "DAMAGED") || "—" },
            { key: "miss", label: "Missing (to settle)", align: "right", render: (a) => openBy(a.id, "MISSING") || "—" },
            { key: "value", label: "Unit value", align: "right", render: (a) => <Money value={a.unitValue} /> },
            { key: "status", label: "", render: (a) => (a.isActive ? null : <StatusBadge status="INACTIVE" label="Not checked" />) },
            { key: "actions", label: "", align: "right", render: (a) => (canManage ? <Button size="icon-sm" variant="ghost" aria-label={`Change ${a.name}`} onClick={() => setEditing(a)}><Pencil className="h-4 w-4" /></Button> : null) },
          ]}
        />
      </Section>
      <Section title="Differences after events">
        <DataTable
          rows={incidents}
          empty="No damaged or missing asset after an event."
          columns={[
            { key: "event", label: "Event", render: (i) => <Link className="underline-offset-2 hover:underline" href={`/d/${departmentId}/bookings/${i.booking.id}`}>{i.booking.referenceNo} · {i.booking.client.name}</Link> },
            { key: "what", label: "Difference", render: (i) => `${i.quantity} × ${i.asset.name} ${i.kind === "MISSING" ? "missing" : "damaged"}` },
            { key: "who", label: "Responsible", render: (i) => ({ CLIENT: "Client", STAFF: "Staff", UNKNOWN: "Unknown" })[i.responsibility] },
            { key: "cost", label: "Cost", align: "right", render: (i) => <Money value={i.cost} /> },
            { key: "status", label: "Settled", render: (i) => <StatusBadge status={{ OPEN: "RESERVED", CHARGED: "PAID", LOSS: "LOST", RESOLVED: "COMPLETED" }[i.status]} label={{ OPEN: "To settle", CHARGED: `Charged ${i.charge?.referenceNo || ""}`, LOSS: "Loss", RESOLVED: "Resolved" }[i.status]} /> },
            { key: "actions", label: "", align: "right", render: (i) => (canBook && i.status === "OPEN" ? <Button size="sm" variant="outline" onClick={() => setSettle(i)}>Settle</Button> : null) },
          ]}
        />
      </Section>
      {editing ? <AssetDialog key={editing === "new" ? "new" : editing.id} departmentId={departmentId} asset={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {settle ? <SettleDialog departmentId={departmentId} incident={settle} onClose={() => setSettle(null)} /> : null}
    </div>
  );
}
