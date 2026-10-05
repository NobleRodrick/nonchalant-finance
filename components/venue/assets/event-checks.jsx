"use client";

import { useState } from "react";
import { ClipboardCheck, Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, DataTable, Money, Section, StatusBadge, inputClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { ProofUpload } from "@/components/kit/proof-upload";
import { useRecorder } from "@/lib/offline/react";
import { CATEGORY_LABELS, compareChecks, incidentTotals, normalizeLine } from "@/lib/venue/asset-math";
import { cn } from "@/lib/utils";
import { formatMoney } from "@/lib/format";
import { SettleDialog } from "./settle-dialog";

const STATUS_LABEL = { OPEN: "To settle", CHARGED: "Charged to the client", LOSS: "Loss of the hall", RESOLVED: "Resolved" };
const STATUS_BADGE = { OPEN: "RESERVED", CHARGED: "PAID", LOSS: "LOST", RESOLVED: "COMPLETED" };

function CheckDialog({ departmentId, booking, phase, assets, previous, current, onClose }) {
  const record = useRecorder();
  const start = (a) => {
    const line = current?.lines.find((l) => l.assetId === a.id) || (phase === "AFTER" ? previous?.lines.find((l) => l.assetId === a.id) : null);
    return { assetId: a.id, good: line ? String(line.good) : String(a.quantity), damaged: line ? String(line.damaged) : "0", note: line?.note || "" };
  };
  const [lines, setLines] = useState(() => assets.map(start));
  const [notes, setNotes] = useState(current?.notes || "");
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(false);
  const rows = assets.map((a, i) => ({ asset: a, line: lines[i], n: normalizeLine({ expected: a.quantity, good: lines[i].good, damaged: lines[i].damaged }) }));
  const valid = rows.every((r) => r.n.good + r.n.damaged <= r.n.expected);
  const diffs = phase === "AFTER" ? compareChecks(previous?.lines || [], rows.map((r) => ({ assetId: r.asset.id, damaged: r.n.damaged, missing: r.n.missing }))) : [];
  const set = (i, k, v) => setLines(lines.map((l, n) => (n === i ? { ...l, [k]: v } : l)));
  const submit = async () => {
    setBusy(true);
    const out = await record(
      {
        kind: "venue.check.save",
        label: "Asset check",
        departmentId,
        files,
        input: { departmentId, bookingId: booking.id, phase, notes, lines: rows.map((r) => ({ assetId: r.asset.id, good: r.n.good, damaged: r.n.damaged, missing: r.n.missing, note: r.line.note })) },
        meta: { summary: `${booking.referenceNo} · check ${phase === "AFTER" ? "after" : "before"} the event` },
      },
      { success: (r) => (r.incidents?.length ? `Check saved: ${r.incidents.length} difference(s) to settle.` : "Check saved: nothing missing or damaged.") }
    );
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog
      open
      wide
      onOpenChange={(v) => !v && onClose()}
      title={phase === "AFTER" ? "Check after the event" : "Check before the event"}
      description="Count each asset: good, damaged; what is not there is missing. Attach photos when something is damaged or missing."
      footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Save the check</SubmitButton>}
    >
      <div className="max-h-[50vh] overflow-y-auto">
        <table className="w-full text-sm">
          <thead className="sticky top-0 bg-white text-xs text-slate-500">
            <tr><th className="py-1.5 text-left">Asset</th><th className="text-right">Owned</th><th className="text-right">Good</th><th className="text-right">Damaged</th><th className="text-right">Missing</th>{phase === "AFTER" ? <th className="text-right">Since before</th> : null}</tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const d = diffs.find((x) => x.assetId === r.asset.id);
              const bad = r.n.good + r.n.damaged > r.n.expected;
              return (
                <tr key={r.asset.id} className="border-t border-slate-100">
                  <td className="py-1.5 pr-2"><span className="font-medium">{r.asset.name}</span><span className="block text-xs text-slate-500">{CATEGORY_LABELS[r.asset.category]}</span></td>
                  <td className="text-right tabular-nums">{r.asset.quantity}</td>
                  <td className="pl-2"><input aria-label={`${r.asset.name} good`} className={cn(inputClass, "h-8 w-20 text-right", bad && "border-rose-400")} inputMode="numeric" value={r.line.good} onChange={(e) => set(i, "good", String(wholeNumber(e.target.value)))} /></td>
                  <td className="pl-2"><input aria-label={`${r.asset.name} damaged`} className={cn(inputClass, "h-8 w-20 text-right", bad && "border-rose-400")} inputMode="numeric" value={r.line.damaged} onChange={(e) => set(i, "damaged", String(wholeNumber(e.target.value)))} /></td>
                  <td className={cn("text-right tabular-nums", r.n.missing && "font-semibold text-rose-700")}>{bad ? "—" : r.n.missing}</td>
                  {phase === "AFTER" ? <td className="text-right text-xs">{d && (d.newDamaged || d.newMissing) ? <span className="font-semibold text-rose-700">{[d.newDamaged ? `+${d.newDamaged} damaged` : null, d.newMissing ? `+${d.newMissing} missing` : null].filter(Boolean).join(", ")}</span> : <span className="text-slate-400">no change</span>}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <textarea aria-label="Notes of the check" className={textareaClass} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Notes (who was present, condition of the hall …)" />
      <ProofUpload value={files} onChange={setFiles} label="Attach photos (proof)" />
    </FormDialog>
  );
}

function CheckSummary({ title, check }) {
  if (!check) return <div className="rounded-lg border border-dashed border-slate-300 p-3 text-sm text-slate-500">{title}: not done yet.</div>;
  const totals = check.lines.reduce((s, l) => ({ damaged: s.damaged + l.damaged, missing: s.missing + l.missing }), { damaged: 0, missing: 0 });
  return (
    <div className="rounded-lg border border-slate-200 p-3 text-sm">
      <div className="font-medium text-slate-900">{title}</div>
      <div className="text-xs text-slate-500">{new Date(check.checkedAt).toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })} · {check.checkedBy?.name}</div>
      <div className="mt-1">{totals.damaged} damaged · {totals.missing} missing</div>
      {check.proofs?.length ? (
        <div className="mt-1 flex flex-wrap gap-1">
          {check.proofs.map((p) => <a key={p.id} href={`/api/attachments/${p.id}`} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 rounded border border-slate-200 px-1.5 py-0.5 text-xs"><Paperclip className="h-3 w-3" /> {p.fileName}</a>)}
        </div>
      ) : null}
    </div>
  );
}

/** The booking's assets: the checks before and after the event, the differences and how they were settled. */
export function EventChecks({ departmentId, booking, assets, checks, canBook }) {
  const [dialog, setDialog] = useState(null);
  const [settle, setSettle] = useState(null);
  const totals = incidentTotals(checks.incidents);
  const open = booking.status !== "CANCELLED";
  return (
    <Section
      title="Assets before and after the event"
      description="Chairs, tables, decorations, sound and lighting counted before and after: what changed is charged to the client, recorded as a loss or resolved."
      actions={
        canBook && open && assets.length ? (
          <span className="flex flex-wrap gap-2">
            {!checks.after ? <Button size="sm" variant={checks.before ? "outline" : "default"} onClick={() => setDialog("BEFORE")}><ClipboardCheck className="h-4 w-4" /> {checks.before ? "Redo the check before" : "Check before the event"}</Button> : null}
            {checks.before && !checks.incidents.some((i) => i.status !== "OPEN") ? <Button size="sm" onClick={() => setDialog("AFTER")}><ClipboardCheck className="h-4 w-4" /> {checks.after ? "Redo the check after" : "Check after the event"}</Button> : null}
          </span>
        ) : null
      }
    >
      {!assets.length ? <Banner tone="info">Add the hall&apos;s assets in Assets to check them before and after events.</Banner> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <CheckSummary title="Before the event" check={checks.before} />
        <CheckSummary title="After the event" check={checks.after} />
      </div>
      {checks.incidents.length ? (
        <div className="mt-4">
          <DataTable
            dense
            rows={checks.incidents}
            columns={[
              { key: "what", label: "Difference", render: (i) => <span className="font-medium">{i.quantity} × {i.asset.name} {i.kind === "MISSING" ? "missing" : "damaged"}</span> },
              { key: "cost", label: "Cost", align: "right", render: (i) => <Money value={i.cost} /> },
              { key: "status", label: "Settled", render: (i) => <span className="inline-flex flex-col"><StatusBadge status={STATUS_BADGE[i.status]} label={STATUS_LABEL[i.status]} />{i.charge ? <span className="text-xs text-slate-500">{i.charge.referenceNo}</span> : null}{i.note ? <span className="text-xs text-slate-500">{i.note}</span> : null}</span> },
              { key: "actions", label: "", align: "right", render: (i) => (canBook && i.status === "OPEN" ? <Button size="sm" variant="outline" onClick={() => setSettle(i)}>Settle</Button> : null) },
            ]}
          />
          <p className="mt-2 text-xs text-slate-600">To settle {formatMoney(totals.open)} · charged {formatMoney(totals.charged)} · loss {formatMoney(totals.loss)}</p>
        </div>
      ) : checks.after ? <p className="mt-3 text-sm text-emerald-700">Nothing missing or damaged after the event.</p> : null}
      {dialog ? <CheckDialog departmentId={departmentId} booking={booking} phase={dialog} assets={assets} previous={checks.before} current={dialog === "AFTER" ? checks.after : checks.before} onClose={() => setDialog(null)} /> : null}
      {settle ? <SettleDialog departmentId={departmentId} incident={settle} onClose={() => setSettle(null)} /> : null}
    </Section>
  );
}
