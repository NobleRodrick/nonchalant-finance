"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, CheckCircle2, CloudOff, Loader2, RefreshCw, Trash2, UploadCloud, WifiOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useOutboxOps, useSyncState } from "@/lib/offline/react";
import { removeOperation, updateOperation } from "@/lib/offline/outbox";
import { syncEngine } from "@/lib/offline/sync-engine";
import { STATUS } from "@/lib/offline/status";
import { cn } from "@/lib/utils";

function when(ms) {
  if (!ms) return "";
  const d = new Date(ms);
  const sameDay = d.toDateString() === new Date().toDateString();
  return sameDay ? d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function OpRow({ op, children }) {
  return (
    <li className="rounded-lg border border-slate-200 p-3 text-sm" data-testid={`outbox-${op.status}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-medium text-slate-900">
            {op.label}
            {op.status === STATUS.APPLIED && op.result?.referenceNo ? <span className="ml-1 text-slate-500">{op.result.referenceNo}</span> : null}
          </div>
          {op.meta?.summary ? <div className="truncate text-slate-600">{op.meta.summary}</div> : null}
          <div className="text-xs text-slate-400">
            {op.meta?.departmentName ? `${op.meta.departmentName} · ` : ""}recorded {when(op.createdAt)}
            {op.status === STATUS.APPLIED && op.syncedAt ? ` · sent ${when(op.syncedAt)}` : ""}
          </div>
          {op.error && op.status !== STATUS.APPLIED ? <div className={cn("mt-1 text-xs", op.status === STATUS.REJECTED ? "text-rose-700" : "text-amber-700")}>{op.error}</div> : null}
          {(op.attachments || []).filter((a) => a.warning).map((a) => (
            <div key={a.localId} className="mt-1 text-xs text-amber-700">Proof “{a.name}” not attached: {a.warning}</div>
          ))}
        </div>
        {children ? <div className="flex shrink-0 gap-1">{children}</div> : null}
      </div>
    </li>
  );
}

/**
 * The connection and sending status in the top bar, and the list of records on this computer:
 * waiting to be sent, needing attention (refused, with the reason), sent recently.
 */
export function SyncStatus() {
  const ops = useOutboxOps();
  const state = useSyncState();
  const [open, setOpen] = useState(false);
  const [confirm, setConfirm] = useState(null);
  const groups = useMemo(() => {
    const waiting = ops.filter((o) => o.status === STATUS.PENDING || o.status === STATUS.SENDING);
    const attention = ops.filter((o) => o.status === STATUS.REJECTED);
    const sent = ops.filter((o) => o.status === STATUS.APPLIED).sort((a, b) => (b.syncedAt || 0) - (a.syncedAt || 0)).slice(0, 15);
    return { waiting, attention, sent };
  }, [ops]);

  const n = groups.waiting.length;
  let tone = "ok";
  let label = "All saved";
  let Icon = CheckCircle2;
  if (state.authRequired && n) {
    tone = "bad";
    label = `Sign in to send ${n}`;
    Icon = AlertTriangle;
  } else if (groups.attention.length) {
    tone = "bad";
    label = `${groups.attention.length} need${groups.attention.length === 1 ? "s" : ""} attention`;
    Icon = AlertTriangle;
  } else if (!state.online) {
    tone = "warn";
    label = n ? `Offline · ${n} waiting` : "Offline";
    Icon = WifiOff;
  } else if (n) {
    tone = "busy";
    label = state.syncing ? `Sending ${n}…` : `${n} waiting`;
    Icon = state.syncing ? Loader2 : UploadCloud;
  }
  const tones = {
    ok: "border-emerald-200 bg-emerald-50 text-emerald-800",
    warn: "border-amber-300 bg-amber-50 text-amber-900",
    busy: "border-sky-200 bg-sky-50 text-sky-800",
    bad: "border-rose-300 bg-rose-50 text-rose-800",
  };

  const retry = async (op) => {
    await updateOperation(op.key, { status: STATUS.PENDING, error: null, code: null });
    syncEngine?.flush();
  };
  const discard = async (op) => {
    await removeOperation(op.key);
    setConfirm(null);
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium", tones[tone])}
        aria-label={`Records on this computer: ${label}`}
        data-testid="sync-status"
        data-state={tone}
      >
        <Icon className={cn("h-3.5 w-3.5", Icon === Loader2 && "animate-spin")} />
        <span className={cn(tone === "ok" && "hidden sm:inline")}>{label}</span>
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Records on this computer</DialogTitle>
            <DialogDescription>
              {state.online ? "Connected. Records are sent to the server as soon as they are made." : "No connection. Keep working: every record is kept on this computer and sent automatically when the connection is back."}
              {state.lastSyncAt ? ` Last sent at ${when(state.lastSyncAt)}.` : ""}
            </DialogDescription>
          </DialogHeader>
          {state.authRequired && n ? (
            <p className="rounded-md bg-rose-50 p-3 text-sm text-rose-900">Your session has ended. Sign in again on this computer to send the records below: nothing is lost.</p>
          ) : null}
          <div className="flex items-center justify-between">
            <span className="flex items-center gap-2 text-sm text-slate-600">
              {state.online ? <CheckCircle2 className="h-4 w-4 text-emerald-600" /> : <CloudOff className="h-4 w-4 text-amber-600" />}
              {n ? `${n} waiting to be sent` : "Nothing waiting"}
            </span>
            <Button size="sm" variant="outline" disabled={!n || state.syncing} onClick={() => syncEngine?.flush()}>
              {state.syncing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />} Send now
            </Button>
          </div>

          {groups.attention.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-rose-800">Needs attention</h3>
              <p className="text-xs text-slate-500">The server refused these records (the reason is shown). They are not in the figures. Try again once the problem is fixed, or discard them and record them again correctly.</p>
              <ul className="space-y-2">
                {groups.attention.map((op) => (
                  <OpRow key={op.key} op={op}>
                    <Button size="sm" variant="outline" onClick={() => retry(op)}>Try again</Button>
                    <Button size="icon-sm" variant="ghost" aria-label={`Discard ${op.label}`} onClick={() => setConfirm(op)}><Trash2 className="h-4 w-4 text-rose-700" /></Button>
                  </OpRow>
                ))}
              </ul>
            </section>
          ) : null}

          {groups.waiting.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Waiting to be sent</h3>
              <ul className="space-y-2">
                {groups.waiting.map((op) => (
                  <OpRow key={op.key} op={op} />
                ))}
              </ul>
            </section>
          ) : null}

          {groups.sent.length ? (
            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-slate-800">Sent recently</h3>
              <ul className="space-y-2">
                {groups.sent.map((op) => (
                  <OpRow key={op.key} op={op} />
                ))}
              </ul>
            </section>
          ) : null}
        </DialogContent>
      </Dialog>
      <Dialog open={Boolean(confirm)} onOpenChange={(v) => !v && setConfirm(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Discard this record?</DialogTitle>
            <DialogDescription>“{confirm?.label}{confirm?.meta?.summary ? ` · ${confirm.meta.summary}` : ""}” was never saved on the server. Discarding removes it from this computer.</DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setConfirm(null)}>Keep it</Button>
            <Button variant="destructive" onClick={() => discard(confirm)}>Discard</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

/** A strip under the top bar while there is no connection. */
export function OfflineBanner() {
  const state = useSyncState();
  if (state.online) return null;
  return (
    <div role="status" className="border-b border-amber-200 bg-amber-50 px-4 py-2 text-center text-sm text-amber-900 print:hidden" data-testid="offline-banner">
      <WifiOff className="mr-1.5 inline h-4 w-4 align-[-3px]" />
      No connection. Keep working: what you record is saved on this computer and sent automatically when the connection is back.
    </div>
  );
}
