"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CheckCircle2, Paperclip, Play, Plus, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Section, StatCard, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useOfflineContext, useRecorder } from "@/lib/offline/react";
import { repairCancelSpec, repairCompleteSpec, repairReportSpec, repairUpdateSpec } from "@/lib/rooms/specs";
import { navigateTo } from "@/lib/navigation";
import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const PRIORITY = { URGENT: ["Urgent", "bg-rose-100 text-rose-800"], HIGH: ["High", "bg-orange-100 text-orange-800"], NORMAL: ["Normal", "bg-sky-100 text-sky-800"], LOW: ["Low", "bg-slate-100 text-slate-700"] };
const METHODS = [["CASH", "Cash"], ["MOMO", "Mobile Money"], ["BANK_TRANSFER", "Bank"]];
const Priority = ({ p }) => <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold", PRIORITY[p][1])}>{PRIORITY[p][0]}</span>;

function ReportDialog({ departmentId, rooms, assets, initialRoom, todayKey, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ roomId: initialRoom || rooms.find((r) => r.isActive)?.id || "", assetId: "", title: "", description: "", priority: "NORMAL", estimatedCost: "", responsibleName: "", reportedOnKey: todayKey, blocksRoom: false, files: [] });
  const [busy, setBusy] = useState(false);
  const valid = f.roomId && f.title.trim();
  const submit = async () => {
    setBusy(true);
    const { files, ...input } = f;
    const out = await record({ ...repairReportSpec(departmentId, { ...input, title: f.title.trim(), assetId: f.assetId || null }, rooms.find((r) => r.id === f.roomId)?.name), files }, { success: (r) => `${r.referenceNo} reported.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="Report a repair" footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Report it</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Apartment" required htmlFor="mr-room">
          <select id="mr-room" className={selectClass} value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value, assetId: "" })}>
            {rooms.filter((r) => r.isActive).map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        <Field label="What needs fixing" required htmlFor="mr-title" className="sm:col-span-2"><input id="mr-title" className={inputClass} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="e.g. Air conditioner leaks" /></Field>
        <Field label="Asset concerned (optional)" htmlFor="mr-asset">
          <select id="mr-asset" className={selectClass} value={f.assetId} onChange={(e) => setF({ ...f, assetId: e.target.value })}>
            <option value="">—</option>
            {assets.filter((a) => a.roomId === f.roomId).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
        </Field>
        <Field label="Priority" htmlFor="mr-prio">
          <select id="mr-prio" className={selectClass} value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value })}>
            {Object.entries(PRIORITY).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Reported on" htmlFor="mr-date"><input id="mr-date" type="date" className={inputClass} max={todayKey} value={f.reportedOnKey} onChange={(e) => setF({ ...f, reportedOnKey: e.target.value })} /></Field>
        <Field label="Estimated cost (FCFA)" htmlFor="mr-est"><input id="mr-est" className={inputClass} inputMode="numeric" value={f.estimatedCost} onChange={(e) => setF({ ...f, estimatedCost: wholeNumber(e.target.value) })} /></Field>
        <Field label="Person responsible" htmlFor="mr-resp" className="sm:col-span-2"><input id="mr-resp" className={inputClass} value={f.responsibleName} onChange={(e) => setF({ ...f, responsibleName: e.target.value })} placeholder="Technician, plumber, caretaker …" /></Field>
      </div>
      <Field label="Details" htmlFor="mr-desc"><textarea id="mr-desc" className={textareaClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} /></Field>
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.blocksRoom} onChange={(e) => setF({ ...f, blocksRoom: e.target.checked })} /> The apartment cannot be let until it is fixed (it goes under maintenance)</label>
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach photos" />
    </FormDialog>
  );
}

function DoneDialog({ departmentId, repair, todayKey, onClose }) {
  const record = useRecorder();
  const me = useOfflineContext();
  const [f, setF] = useState({ actualCost: repair.estimatedCost ? String(repair.estimatedCost) : "", repairedOnKey: todayKey, responsibleName: repair.responsibleName || "", paidFromDrawer: true, counterparty: repair.responsibleName || "", authorizedByName: me.userName || "", paymentMethod: "CASH", reference: "", files: [] });
  const [busy, setBusy] = useState(false);
  const cost = Number(f.actualCost) || 0;
  const paying = f.paidFromDrawer && cost > 0;
  const valid = f.actualCost !== "" && (!paying || ((f.counterparty.trim() || f.responsibleName.trim()) && f.authorizedByName.trim()));
  const submit = async () => {
    setBusy(true);
    const { files, ...input } = f;
    const out = await record({ ...repairCompleteSpec(departmentId, repair, { ...input, actualCost: cost, paidFromDrawer: paying }), files }, { success: (r) => `${r.referenceNo} done${r.transactionReference ? ` · expense ${r.transactionReference}` : ""}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={`Done: ${repair.referenceNo} · ${repair.title}`} description={`${repair.room.name}${repair.estimatedCost ? ` · estimated ${formatMoney(repair.estimatedCost)}` : ""}`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Mark as repaired</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Actual cost (FCFA)" required htmlFor="md-cost"><input id="md-cost" className={inputClass} inputMode="numeric" value={f.actualCost} onChange={(e) => setF({ ...f, actualCost: wholeNumber(e.target.value) })} /></Field>
        <Field label="Repaired on" htmlFor="md-date"><input id="md-date" type="date" className={inputClass} min={repair.reportedOnKey} max={todayKey} value={f.repairedOnKey} onChange={(e) => setF({ ...f, repairedOnKey: e.target.value })} /></Field>
        <Field label="Repaired by" htmlFor="md-resp"><input id="md-resp" className={inputClass} value={f.responsibleName} onChange={(e) => setF({ ...f, responsibleName: e.target.value })} /></Field>
      </div>
      {cost > 0 ? (
        <div className="space-y-3 rounded-lg bg-slate-50 p-3">
          <label className="flex items-center gap-2 text-sm font-medium"><input type="checkbox" checked={f.paidFromDrawer} onChange={(e) => setF({ ...f, paidFromDrawer: e.target.checked })} /> Paid from the cash drawer now ({formatMoney(cost)}: a repair expense of {repair.room.name})</label>
          {f.paidFromDrawer ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Person / vendor paid" required htmlFor="md-vendor"><input id="md-vendor" className={inputClass} value={f.counterparty} onChange={(e) => setF({ ...f, counterparty: e.target.value })} /></Field>
              <Field label="Authorized by" required htmlFor="md-auth"><input id="md-auth" className={inputClass} value={f.authorizedByName} onChange={(e) => setF({ ...f, authorizedByName: e.target.value })} /></Field>
              <Field label="Paid by" htmlFor="md-method">
                <select id="md-method" className={selectClass} value={f.paymentMethod} onChange={(e) => setF({ ...f, paymentMethod: e.target.value })}>
                  {METHODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </Field>
              <Field label="Reference (optional)" htmlFor="md-ref"><input id="md-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} /></Field>
            </div>
          ) : null}
        </div>
      ) : null}
      <ProofUpload value={f.files} onChange={(files) => setF({ ...f, files })} label="Attach the receipt or invoice" />
    </FormDialog>
  );
}

function CancelDialog({ departmentId, repair, onClose }) {
  const record = useRecorder();
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(repairCancelSpec(departmentId, repair, reason.trim()), { success: `${repair.referenceNo} cancelled.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Cancel ${repair.referenceNo}`} footer={<SubmitButton variant="destructive" busy={busy} disabled={!reason.trim()} onClick={submit}>Cancel the repair</SubmitButton>}>
      <Field label="Why" required htmlFor="mc-reason"><input id="mc-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} /></Field>
    </FormDialog>
  );
}

const proofLinks = (r) => (r.proofs?.length ? r.proofs.map((p) => <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer" className="mr-1 inline-flex items-center gap-1 text-xs underline"><Paperclip className="h-3 w-3" />{p.fileName}</a>) : "—");

/** Pending repairs per apartment (most urgent first), the repairs done in the period and their cost. */
export function MaintenanceBoard({ departmentId, open, done, cancelled, totals, rooms, assets, filterRoom, periodLabel, todayKey, canWork }) {
  const record = useRecorder();
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
  const start = (r) => record(repairUpdateSpec(departmentId, r, { status: "IN_PROGRESS" }), { success: `${r.referenceNo} in progress.` });
  const pendingRooms = rooms.filter((r) => totals.byRoom[r.id]?.pending);
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard tone={totals.pending ? "warn" : "default"} label="Repairs pending" value={totals.pending} hint={`${pendingRooms.length} apartment(s) · ${totals.blocking} blocking an apartment`} />
        <StatCard tone={totals.urgent ? "out" : "default"} label="Urgent or high" value={totals.urgent} />
        <StatCard label="Estimated cost pending" value={formatMoney(totals.estimated)} />
        <StatCard label="Spent on repairs" value={formatMoney(totals.spent)} hint={`${totals.done} done · ${periodLabel}`} />
      </div>
      {pendingRooms.length ? (
        <div className="flex flex-wrap gap-2" data-testid="pending-rooms">
          {pendingRooms.map((r) => <button key={r.id} type="button" onClick={() => setRoom(r.id)} className="rounded-full border border-amber-300 bg-amber-50 px-3 py-1 text-sm text-amber-900 hover:bg-amber-100">{r.name}: {totals.byRoom[r.id].pending} pending</button>)}
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3 print:hidden">
        <Field label="Apartment" htmlFor="mf-room">
          <select id="mf-room" className={selectClass} value={filterRoom} onChange={(e) => setRoom(e.target.value)}>
            <option value="">All</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
          </select>
        </Field>
        {canWork ? <Button className="ml-auto" onClick={() => setDialog({ report: true })}><Plus className="h-4 w-4" /> Report a repair</Button> : null}
      </div>
      <Section title="Pending" description="Reported or in progress, most urgent first">
        <DataTable
          dense
          rows={open}
          empty="Nothing to fix."
          columns={[
            { key: "ref", label: "Ref.", render: (r) => <span className="font-medium">{r.referenceNo}</span> },
            { key: "prio", label: "Priority", render: (r) => <Priority p={r.priority} /> },
            { key: "apt", label: "Apartment", render: (r) => <span>{r.room.name}{r.blocksRoom ? <span className="block text-[11px] text-orange-700">Cannot be let</span> : null}</span> },
            { key: "what", label: "What", render: (r) => <span>{r.title}{r.asset ? <span className="text-slate-500"> · {r.asset.name}</span> : null}{r.description ? <span className="block text-xs text-slate-500">{r.description}</span> : null}</span> },
            { key: "since", label: "Reported", render: (r) => <span className="whitespace-nowrap">{formatDateKey(r.reportedOnKey, { weekday: false })}</span> },
            { key: "status", label: "Status", render: (r) => (r.status === "IN_PROGRESS" ? "In progress" : "Reported") },
            { key: "resp", label: "Responsible", render: (r) => r.responsibleName || "—" },
            { key: "est", label: "Estimated", align: "right", render: (r) => (r.estimatedCost != null ? <Money value={r.estimatedCost} suffix={false} /> : "—") },
            { key: "proof", label: "Photos", render: proofLinks },
            {
              key: "act",
              label: "",
              align: "right",
              render: (r) =>
                canWork ? (
                  <span className="inline-flex gap-1">
                    {r.status === "REPORTED" ? <Button size="sm" variant="ghost" onClick={() => start(r)} aria-label={`Start ${r.referenceNo}`}><Play className="h-3.5 w-3.5" /> Start</Button> : null}
                    <Button size="sm" variant="outline" onClick={() => setDialog({ done: r })} aria-label={`Done ${r.referenceNo}`}><CheckCircle2 className="h-3.5 w-3.5" /> Done</Button>
                    <Button size="icon-sm" variant="ghost" className="text-rose-700" onClick={() => setDialog({ cancel: r })} aria-label={`Cancel ${r.referenceNo}`}><XCircle className="h-4 w-4" /></Button>
                  </span>
                ) : null,
            },
          ]}
        />
      </Section>
      <Section title="Repaired" description={periodLabel}>
        <DataTable
          dense
          rows={done}
          empty="No repair done in this period."
          columns={[
            { key: "ref", label: "Ref.", render: (r) => <span className="font-medium">{r.referenceNo}</span> },
            { key: "apt", label: "Apartment", render: (r) => r.room.name },
            { key: "what", label: "What", render: (r) => r.title },
            { key: "dates", label: "Reported → repaired", render: (r) => <span className="whitespace-nowrap">{formatDateKey(r.reportedOnKey, { weekday: false })} → {formatDateKey(r.repairedOnKey, { weekday: false })}</span> },
            { key: "resp", label: "By", render: (r) => r.responsibleName || "—" },
            { key: "est", label: "Estimated", align: "right", render: (r) => (r.estimatedCost != null ? <Money value={r.estimatedCost} suffix={false} /> : "—") },
            { key: "cost", label: "Actual cost", align: "right", render: (r) => <Money value={r.actualCost || 0} /> },
            { key: "proof", label: "Invoice", render: proofLinks },
          ]}
        />
      </Section>
      {cancelled.length ? (
        <Section title="Cancelled" description={periodLabel}>
          <ul className="space-y-1 text-sm">{cancelled.map((r) => <li key={r.id}>{r.referenceNo} · {r.room.name} · {r.title} — {r.cancelReason}</li>)}</ul>
        </Section>
      ) : null}
      {dialog?.report ? <ReportDialog departmentId={departmentId} rooms={rooms} assets={assets} initialRoom={filterRoom} todayKey={todayKey} onClose={() => setDialog(null)} /> : null}
      {dialog?.done ? <DoneDialog departmentId={departmentId} repair={dialog.done} todayKey={todayKey} onClose={() => setDialog(null)} /> : null}
      {dialog?.cancel ? <CancelDialog departmentId={departmentId} repair={dialog.cancel} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
