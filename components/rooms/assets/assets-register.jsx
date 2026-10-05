"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { MoreHorizontal, Paperclip, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, StatCard, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useOfflineContext, useRecorder } from "@/lib/offline/react";
import { assetAddSpec, assetMoveSpec } from "@/lib/rooms/specs";
import { ASSET_CATEGORIES, MOVEMENT_LABELS } from "@/lib/rooms/asset-labels";
import { navigateTo } from "@/lib/navigation";
import { formatMoney } from "@/lib/format";

const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"]];
const KINDS = {
  transfer: "Move to another apartment",
  damaged: "Damaged / broken",
  repaired: "Repaired",
  missing: "Missing",
  replaced: "Replaced by new ones",
  removed: "Removed from the register (thrown away, sold …)",
};

/** Paid from the cash drawer: vendor, method, reference, who authorized it (the proof goes with it). */
function Payment({ f, setF, label }) {
  return (
    <div className="space-y-3 rounded-lg bg-slate-50 p-3">
      <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.paidFromDrawer} onChange={(e) => setF({ ...f, paidFromDrawer: e.target.checked })} /> {label}</label>
      {f.paidFromDrawer ? (
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Person / vendor paid" required htmlFor="ap-vendor"><input id="ap-vendor" className={inputClass} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></Field>
          <Field label="Authorized by" required htmlFor="ap-auth"><input id="ap-auth" className={inputClass} value={f.authorizedByName} onChange={(e) => setF({ ...f, authorizedByName: e.target.value })} /></Field>
          <Field label="Paid by" htmlFor="ap-method">
            <select id="ap-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
              {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
          <Field label="Reference (optional)" htmlFor="ap-ref"><input id="ap-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
        </div>
      ) : null}
    </div>
  );
}

const payOk = (f) => !f.paidFromDrawer || (f.counterparty.trim() && f.authorizedByName.trim());

function AddDialog({ departmentId, rooms, initialRoom, onClose }) {
  const record = useRecorder();
  const me = useOfflineContext();
  const [f, setF] = useState({ roomId: initialRoom || "", name: "", category: "BED", quantity: "1", unitValue: "", alreadyOwned: false, paidFromDrawer: false, counterparty: "", authorizedByName: me.userName || "", paymentMethod: "CASH", reference: "", note: "", files: [] });
  const [busy, setBusy] = useState(false);
  const value = (Number(f.quantity) || 0) * (Number(f.unitValue) || 0);
  const valid = f.name.trim() && Number(f.quantity) > 0 && f.unitValue !== "" && payOk(f);
  const submit = async () => {
    setBusy(true);
    const room = rooms.find((r) => r.id === f.roomId);
    const { files, ...input } = f;
    const out = await record({ ...assetAddSpec(departmentId, { ...input, name: f.name.trim(), roomId: f.roomId || null, quantity: Number(f.quantity), unitValue: Number(f.unitValue), paidFromDrawer: f.paidFromDrawer && !f.alreadyOwned }, room?.name), files }, { success: (r) => `${r.referenceNo} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="Add assets" description="New furniture or equipment bought, or what an apartment already has (initial count)." footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Add {value ? `(${formatMoney(value)})` : ""}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Apartment" htmlFor="aa-room">
          <select id="aa-room" className={selectClass} value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            <option value="">Storage (no apartment)</option>
            {rooms.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="Kind" htmlFor="aa-cat">
          <select id="aa-cat" className={selectClass} value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })}>
            {Object.entries(ASSET_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Name" required htmlFor="aa-name"><input id="aa-name" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder='e.g. Samsung TV 43"' /></Field>
        <Field label="Quantity" required htmlFor="aa-qty"><input id="aa-qty" className={inputClass} inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: wholeNumber(e.target.value) })} /></Field>
        <Field label="Value of one (FCFA)" required htmlFor="aa-value" hint="Purchase price."><input id="aa-value" className={inputClass} inputMode="numeric" value={f.unitValue} onChange={(e) => setF({ ...f, unitValue: wholeNumber(e.target.value) })} /></Field>
        <Field label="Note" htmlFor="aa-note"><input id="aa-note" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field>
      </div>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.alreadyOwned} onChange={(e) => setF({ ...f, alreadyOwned: e.target.checked, paidFromDrawer: false })} /> Already owned (initial count: nothing is paid now)</label>
      {!f.alreadyOwned ? <Payment f={f} setF={setF} label={`Paid from the cash drawer now (${formatMoney(value)}, an investment: it does not lower the profit)`} /> : null}
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach the invoice or a photo" />
    </FormDialog>
  );
}

function MoveDialog({ departmentId, asset, rooms, onClose }) {
  const record = useRecorder();
  const me = useOfflineContext();
  const [f, setF] = useState({ kind: asset.damaged ? "repaired" : "damaged", quantity: "1", toRoomId: "", cost: "", newUnitValue: String(asset.unitValue), note: "", paidFromDrawer: false, counterparty: "", authorizedByName: me.userName || "", paymentMethod: "CASH", reference: "", files: [] });
  const [busy, setBusy] = useState(false);
  const n = Number(f.quantity) || 0;
  const limit = { transfer: asset.good, damaged: asset.good, repaired: asset.damaged, missing: asset.quantity, replaced: asset.quantity, removed: asset.quantity }[f.kind];
  const needsNote = ["missing", "removed"].includes(f.kind);
  const paying = f.kind === "repaired" || f.kind === "replaced";
  const amount = f.kind === "repaired" ? Number(f.cost) || 0 : n * (Number(f.newUnitValue) || 0);
  const valid = n > 0 && n <= limit && (!needsNote || f.note.trim()) && (f.kind !== "transfer" || f.toRoomId !== (asset.roomId || "")) && (!paying || payOk(f));
  const submit = async () => {
    setBusy(true);
    const { files, ...input } = f;
    const out = await record({ ...assetMoveSpec(departmentId, asset, { ...input, quantity: n, toRoomId: f.toRoomId || null, cost: Number(f.cost) || 0, newUnitValue: Number(f.newUnitValue) || 0, paidFromDrawer: paying && f.paidFromDrawer }), files }, { success: (r) => `${r.referenceNo} recorded.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={`${asset.name} · ${asset.room?.name || "storage"}`} description={`${asset.quantity} registered: ${asset.good} good, ${asset.damaged} damaged · ${formatMoney(asset.unitValue)} each`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Record</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="What happened" htmlFor="am-kind" className="sm:col-span-2">
          <select id="am-kind" className={selectClass} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })}>
            {Object.entries(KINDS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="How many" required htmlFor="am-qty" error={n > limit ? `At most ${limit}.` : null}><input id="am-qty" className={inputClass} inputMode="numeric" value={f.quantity} onChange={(e) => setF({ ...f, quantity: wholeNumber(e.target.value) })} /></Field>
        {f.kind === "transfer" ? (
          <Field label="To" htmlFor="am-to" className="sm:col-span-3">
            <select id="am-to" className={selectClass} value={f.toRoomId} onChange={(e) => setF({ ...f, toRoomId: e.target.value })}>
              <option value="">Storage (no apartment)</option>
              {rooms.filter((r) => r.isActive && r.id !== asset.roomId).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </Field>
        ) : null}
        {f.kind === "repaired" ? <Field label="Cost of the repair (FCFA)" htmlFor="am-cost"><input id="am-cost" className={inputClass} inputMode="numeric" value={f.cost} onChange={(e) => setF({ ...f, cost: wholeNumber(e.target.value) })} /></Field> : null}
        {f.kind === "replaced" ? <Field label="Value of one new unit (FCFA)" htmlFor="am-new"><input id="am-new" className={inputClass} inputMode="numeric" value={f.newUnitValue} onChange={(e) => setF({ ...f, newUnitValue: wholeNumber(e.target.value) })} /></Field> : null}
        <Field label="Note" required={needsNote} htmlFor="am-note" className="sm:col-span-3"><input id="am-note" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder={f.kind === "missing" ? "When it was noticed, who stayed in the apartment …" : ""} /></Field>
      </div>
      {["missing", "removed", "replaced"].includes(f.kind) ? <p className="rounded-md bg-rose-50 p-2 text-sm text-rose-900">{formatMoney(Math.min(n, limit) * asset.unitValue)} leaves the register: a loss in the income statement.</p> : null}
      {paying ? <Payment f={f} setF={setF} label={`Paid from the cash drawer now (${formatMoney(amount)})`} /> : null}
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach photos or the invoice" />
    </FormDialog>
  );
}

/** The register by apartment, its totals, and the movements of the period. */
export function AssetsRegister({ departmentId, lines, totals, movements, movementTotals: mt, rooms, filterRoom, periodLabel, canManage, canMove }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const [dialog, setDialog] = useState(null);
  const setRoom = (v) => {
    const p = new URLSearchParams(search.toString());
    if (v) p.set("room", v);
    else p.delete("room");
    navigateTo(router, `${pathname}${p.toString() ? `?${p}` : ""}`);
  };
  const groups = [...new Set(lines.map((l) => l.roomId || ""))].map((k) => ({ key: k, name: k ? lines.find((l) => l.roomId === k).room.name : "Storage", lines: lines.filter((l) => (l.roomId || "") === k) }));
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Value of the register" value={formatMoney(totals.total.value)} hint={`${totals.total.units} units at purchase value`} />
        <StatCard tone={totals.total.damaged ? "warn" : "default"} label="Damaged now" value={`${totals.total.damaged} unit(s)`} hint={formatMoney(totals.total.damagedValue)} />
        <StatCard tone={mt.loss ? "out" : "default"} label="Lost in the period" value={formatMoney(mt.loss)} hint={`${mt.missing} missing · ${mt.removed} removed · ${mt.replaced} replaced`} />
        <StatCard label="Spent in the period" value={formatMoney(mt.purchaseCost + mt.repairCost)} hint={`Bought ${formatMoney(mt.purchaseCost)} · repairs ${formatMoney(mt.repairCost)}`} />
      </div>
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Apartment" htmlFor="af-room">
          <select id="af-room" className={selectClass} value={filterRoom} onChange={(e) => setRoom(e.target.value)}>
            <option value="">All</option>
            <option value="storage">Storage</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        {canManage ? <Button className="ml-auto" onClick={() => setDialog({ add: true })}><Plus className="h-4 w-4" /> Add assets</Button> : null}
      </div>
      {!groups.length ? <p className="text-sm text-slate-500">No asset registered yet.</p> : null}
      {groups.map((g) => (
        <Section key={g.key || "storage"} title={g.name} description={`${formatMoney(totals.byRoom[g.key]?.value || 0)} · ${totals.byRoom[g.key]?.units || 0} units${totals.byRoom[g.key]?.damaged ? ` · ${totals.byRoom[g.key].damaged} damaged` : ""}`} bodyClassName="p-0">
          <DataTable
            dense
            rows={g.lines}
            columns={[
              { key: "name", label: "Asset", render: (a) => <span className="font-medium">{a.name}</span> },
              { key: "cat", label: "Kind", render: (a) => ASSET_CATEGORIES[a.category] || a.category },
              { key: "qty", label: "Quantity", align: "right" , render: (a) => a.quantity },
              { key: "good", label: "Good", align: "right", render: (a) => a.good },
              { key: "dmg", label: "Damaged", align: "right", render: (a) => (a.damaged ? <span className="font-semibold text-amber-800">{a.damaged}</span> : 0) },
              { key: "unit", label: "Value of one", align: "right", render: (a) => <Money value={a.unitValue} suffix={false} /> },
              { key: "value", label: "Value", align: "right", render: (a) => <Money value={a.value} /> },
              { key: "act", label: "", align: "right", render: (a) => (canMove ? <Button size="sm" variant="ghost" onClick={() => setDialog({ move: a })} aria-label={`Record a change of ${a.name} in ${g.name}`}><MoreHorizontal className="h-4 w-4" /> Change</Button> : null) },
            ]}
          />
        </Section>
      ))}
      <Section title="Movements" description={periodLabel}>
        <DataTable
          dense
          rows={movements}
          empty="No movement in this period."
          columns={[
            { key: "ref", label: "Ref.", render: (m) => <span className="font-medium">{m.referenceNo}</span> },
            { key: "date", label: "Date", render: (m) => new Date(m.date).toLocaleDateString("en-GB", { day: "numeric", month: "short" }) },
            { key: "kind", label: "What", render: (m) => `${MOVEMENT_LABELS[m.kind]}${m.otherRoomName || (["TRANSFER_OUT", "TRANSFER_IN"].includes(m.kind) && !m.otherRoomId) ? ` ${m.kind === "TRANSFER_OUT" ? "to" : "from"} ${m.otherRoomName || "storage"}` : ""}` },
            { key: "asset", label: "Asset", render: (m) => `${m.quantity} × ${m.asset.name}` },
            { key: "apt", label: "Apartment", render: (m) => m.asset.room?.name || "Storage" },
            { key: "money", label: "Value / cost / loss", align: "right", render: (m) => (m.loss ? <Money value={-m.loss} /> : m.cost ? <Money value={m.cost} /> : <Money value={m.value} className="text-slate-500" />) },
            { key: "note", label: "Note", render: (m) => <span className="text-xs text-slate-600">{m.note || "—"}{m.createdBy ? ` · ${m.createdBy.name}` : ""}</span> },
            { key: "proof", label: "Proof", render: (m) => (m.proofs.length ? m.proofs.map((p) => <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs underline"><Paperclip className="h-3 w-3" />{p.fileName}</a>) : "—") },
          ]}
        />
      </Section>
      {dialog?.add ? <AddDialog departmentId={departmentId} rooms={rooms} initialRoom={filterRoom && filterRoom !== "storage" ? filterRoom : ""} onClose={() => setDialog(null)} /> : null}
      {dialog?.move ? <MoveDialog departmentId={departmentId} asset={dialog.move} rooms={rooms} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
