"use client";

import { useState } from "react";
import { Check, CloudOff, Loader2, Printer, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { StatusBadge, textareaClass } from "@/components/kit/primitives";
import { useOutboxOps, useRecorder } from "@/lib/offline/react";
import { STATUS } from "@/lib/offline/status";

/** Approve a report, or return it with a note (reopens the day for the department head). */
export function ReviewPanel({ reportId, status: serverStatus }) {
  const record = useRecorder();
  const ops = useOutboxOps();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // A decision taken offline is shown at once and sent when the connection is back.
  const waiting = ops.find((o) => o.kind === "report.review" && o.input?.reportId === reportId && (o.status === STATUS.PENDING || o.status === STATUS.SENDING));
  const status = waiting ? waiting.input.decision : serverStatus;
  const act = async (decision) => {
    setBusy(true);
    const ok = await record(
      { kind: "report.review", label: decision === "APPROVED" ? "Report approved" : "Report returned", departmentId: null, input: { reportId, decision, note }, meta: { summary: note || "" } },
      { success: decision === "APPROVED" ? "Report approved." : "Report returned to the department head." }
    );
    setBusy(false);
    if (ok) setOpen(false);
  };
  const canApprove = !waiting && ["SUBMITTED", "REVIEWED"].includes(status);
  const canReturn = !waiting && ["SUBMITTED", "REVIEWED", "APPROVED"].includes(status);
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-xs print:hidden">
      <span className="mr-2 text-sm text-slate-600">Status: <StatusBadge status={status} /></span>
      {waiting ? <span className="inline-flex items-center gap-1 text-xs text-amber-800"><CloudOff className="h-3.5 w-3.5" /> Your decision is saved on this computer and sent when the connection is back.</span> : null}
      {canApprove ? <Button onClick={() => act("APPROVED")} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Approve</Button> : null}
      {canReturn ? <Button variant="outline" onClick={() => setOpen(true)} disabled={busy}><Undo2 className="h-4 w-4" /> Return with a note</Button> : null}
      <Button variant="outline" onClick={() => window.print()}><Printer className="h-4 w-4" /> Print</Button>
      {status === "RETURNED" ? <span className="text-sm text-amber-800">Waiting for the department head to correct and send it again.</span> : null}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Return the report</DialogTitle>
            <DialogDescription>The day is reopened so the department head can correct it and send it again. Say what must change.</DialogDescription>
          </DialogHeader>
          <label htmlFor="return-note" className="text-sm font-medium">Note to the department head <span className="text-rose-600">*</span></label>
          <textarea id="return-note" className={textareaClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: the gas expense is missing" />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
            <Button disabled={busy || !note.trim()} onClick={() => act("RETURNED")}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Return report</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
