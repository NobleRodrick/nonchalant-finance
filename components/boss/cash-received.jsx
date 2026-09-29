"use client";

import { useState } from "react";
import { Check, CloudOff, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { EmptyState, Money, Section, StatusBadge, textareaClass } from "@/components/kit/primitives";
import { useOutboxOps, useRecorder } from "@/lib/offline/react";
import { STATUS } from "@/lib/offline/status";

export function CashReceived({ pending: serverPending, recent, perDept, monthLabel }) {
  const record = useRecorder();
  const ops = useOutboxOps();
  const [busy, setBusy] = useState(null);
  const [dispute, setDispute] = useState(null);
  const [note, setNote] = useState("");
  // Confirmations made offline: shown as decided, sent when the connection is back.
  const decided = new Map(ops.filter((o) => o.kind === "handover.review" && (o.status === STATUS.PENDING || o.status === STATUS.SENDING)).map((o) => [o.input?.handoverId, o.input?.status]));
  const pending = serverPending.map((h) => (decided.has(h.id) ? { ...h, decision: decided.get(h.id) } : h));
  const act = async (h, status, reviewNote = null) => {
    setBusy(h.id);
    const ok = await record(
      { kind: "handover.review", label: status === "CONFIRMED" ? "Handover confirmed" : "Handover disputed", departmentId: null, input: { handoverId: h.id, status, note: reviewNote }, meta: { summary: `${h.referenceNo} · ${h.department}` } },
      { success: status === "CONFIRMED" ? `${h.referenceNo} confirmed.` : `${h.referenceNo} disputed.` }
    );
    setBusy(null);
    if (ok) {
      setDispute(null);
      setNote("");
    }
  };
  return (
    <div className="space-y-6">
      <Section title={`Waiting for your confirmation (${pending.length})`} description={pending.length ? `Total ${pending.reduce((s, h) => s + h.amount, 0).toLocaleString("fr-FR")} FCFA` : null}>
        {pending.length === 0 ? (
          <EmptyState title="Nothing to confirm" description="Handovers appear here when a department records cash given to you." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {pending.map((h) => (
              <li key={h.id} className="flex flex-wrap items-center justify-between gap-3 py-3">
                <div>
                  <div className="font-semibold">{h.department} · <Money value={h.amount} /></div>
                  <div className="text-xs text-slate-500">{h.referenceNo} · {h.when} · by {h.by} · to {h.recipient}{h.reference ? ` · ref ${h.reference}` : ""}</div>
                </div>
                {h.decision ? (
                  <span className="inline-flex items-center gap-1 text-sm text-amber-800"><CloudOff className="h-4 w-4" /> {h.decision === "CONFIRMED" ? "Confirmed" : "Disputed"} on this computer, not sent yet</span>
                ) : (
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => act(h, "CONFIRMED")} disabled={busy === h.id}>{busy === h.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} I received it</Button>
                    <Button size="sm" variant="outline" onClick={() => setDispute(h)}><X className="h-4 w-4" /> Dispute</Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {perDept.length ? (
        <Section title="This month by department" description={monthLabel}>
          <table className="w-full text-sm">
            <thead><tr className="border-b border-slate-200 text-left text-xs text-slate-500"><th className="py-2 font-medium">Department</th><th className="py-2 text-right font-medium">Confirmed</th><th className="py-2 text-right font-medium">Waiting</th><th className="py-2 text-right font-medium">Disputed</th></tr></thead>
            <tbody>
              {perDept.map((d) => (
                <tr key={d.id} className="border-b border-slate-100"><td className="py-2">{d.name}</td><td className="py-2 text-right font-semibold"><Money value={d.confirmed} /></td><td className="py-2 text-right"><Money value={d.pending} /></td><td className="py-2 text-right text-rose-700"><Money value={d.disputed} /></td></tr>
              ))}
            </tbody>
          </table>
        </Section>
      ) : null}
      <Section title="Recently reviewed">
        {recent.length === 0 ? <p className="text-sm text-slate-500">Nothing yet.</p> : (
          <table className="w-full text-sm">
            <tbody>
              {recent.map((h) => (
                <tr key={h.id} className="border-b border-slate-100">
                  <td className="py-2 font-medium">{h.referenceNo}</td>
                  <td className="py-2">{h.department}</td>
                  <td className="py-2 text-xs text-slate-500">{h.when} · {h.by}</td>
                  <td className="py-2 text-right"><Money value={h.amount} /></td>
                  <td className="py-2 pl-3"><StatusBadge status={h.status} />{h.note ? <div className="text-xs text-slate-500">{h.note}</div> : null}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
      <Dialog open={Boolean(dispute)} onOpenChange={(v) => !v && setDispute(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Dispute {dispute?.referenceNo}</DialogTitle>
            <DialogDescription>A disputed handover does not count as cash received. The person who handed it over is notified with your note.</DialogDescription>
          </DialogHeader>
          <textarea aria-label="What is wrong" className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: I received only 50 000" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setDispute(null)}>Cancel</Button>
            <Button variant="destructive" disabled={!note.trim() || busy} onClick={() => act(dispute, "DISPUTED", note)}>Dispute</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
