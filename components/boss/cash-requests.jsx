"use client";

import { useState } from "react";
import { BellRing, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, Money, Pill, Section, inputClass } from "@/components/kit/primitives";
import { useOutboxOps, useRecorder } from "@/lib/offline/react";
import { STATUS } from "@/lib/offline/status";
import { addDaysToKey, periodRange } from "@/lib/timezone";
import { cn } from "@/lib/utils";

const PERIODS = [
  { id: "today", label: "Today" },
  { id: "yesterday", label: "Yesterday" },
  { id: "week", label: "This week" },
  { id: "custom", label: "Custom" },
];

function rangeFor(period, todayKey, custom) {
  if (period === "yesterday") return { fromKey: addDaysToKey(todayKey, -1), toKey: addDaysToKey(todayKey, -1) };
  if (period === "week") {
    const w = periodRange("week", todayKey);
    return { fromKey: w.fromKey, toKey: todayKey < w.toKey ? todayKey : w.toKey };
  }
  if (period === "custom") return custom;
  return { fromKey: todayKey, toKey: todayKey };
}

const REQUEST_PILL = {
  OPEN: ["Waiting for the head", "amber"],
  ANSWERED: ["Cash handed over", "emerald"],
  CANCELLED: ["Cancelled", "slate"],
};

/** The Boss asks departments for the cash of a period, and follows his requests. */
export function CashRequests({ departments, requests: serverRequests, todayKey, focusDeptId = null }) {
  const record = useRecorder();
  const ops = useOutboxOps();
  const waitingOps = ops.filter((o) => (o.kind === "cash.request" || o.kind === "cash.request.cancel") && (o.status === STATUS.PENDING || o.status === STATUS.SENDING));
  const cancelled = new Set(waitingOps.filter((o) => o.kind === "cash.request.cancel").map((o) => o.input?.requestId));
  const requests = serverRequests.map((r) => (cancelled.has(r.id) ? { ...r, status: "CANCELLED", pending: true } : r));
  const waitingRequests = waitingOps.filter((o) => o.kind === "cash.request");
  const [scope, setScope] = useState(focusDeptId ? [focusDeptId] : []);
  const [period, setPeriod] = useState("today");
  const [custom, setCustom] = useState({ fromKey: todayKey, toKey: todayKey });
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [cancelling, setCancelling] = useState(null);
  const range = rangeFor(period, todayKey, custom);
  const toggle = (id) => setScope((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const send = async () => {
    setBusy(true);
    const names = scope.length ? departments.filter((d) => scope.includes(d.id)).map((d) => d.name).join(", ") : "all departments";
    const ok = await record(
      { kind: "cash.request", label: "Cash request", departmentId: null, input: { departmentIds: scope, ...range, note }, meta: { summary: `${names} · ${range.fromKey === range.toKey ? range.fromKey : `${range.fromKey} – ${range.toKey}`}` } },
      {
        success: (d) =>
          `${d.created.length ? `Request sent to ${d.created.map((c) => c.department).join(", ")}.` : "No new request sent."}${d.skipped.length ? ` Already waiting: ${d.skipped.join(", ")}.` : ""}`,
      }
    );
    setBusy(false);
    if (ok) setNote("");
  };
  const cancel = async (r) => {
    setCancelling(r.id);
    await record({ kind: "cash.request.cancel", label: "Cash request cancelled", departmentId: null, input: { requestId: r.id }, meta: { summary: `${r.department} · ${r.period}` } }, { success: "Request cancelled." });
    setCancelling(null);
  };
  const open = requests.filter((r) => r.status === "OPEN");

  return (
    <div className="space-y-6">
      {waitingRequests.length ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900" data-testid="requests-waiting">
          {waitingRequests.length} request(s) saved on this computer ({waitingRequests.map((o) => o.meta?.summary).join("; ")}): the heads are notified when the connection is back.
        </p>
      ) : null}
      <Section title="Request cash" description="Ask department heads to hand over the cash of a period. They are notified at once and see the amount due." >
        <div className="grid gap-4 lg:grid-cols-[1fr_1fr]" data-testid="request-cash">
          <div className="space-y-3">
            <div>
              <div className="mb-1.5 text-sm font-medium">From</div>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => setScope([])} className={cn("rounded-full border px-3 py-1 text-sm", scope.length === 0 ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50")} aria-pressed={scope.length === 0}>
                  All departments
                </button>
                {departments.map((d) => (
                  <button key={d.id} type="button" onClick={() => toggle(d.id)} aria-pressed={scope.includes(d.id)} className={cn("rounded-full border px-3 py-1 text-sm", scope.includes(d.id) ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50")}>
                    {d.name}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <div className="mb-1.5 text-sm font-medium">Cash of</div>
              <div className="flex flex-wrap gap-2">
                {PERIODS.map((p) => (
                  <button key={p.id} type="button" onClick={() => setPeriod(p.id)} aria-pressed={period === p.id} className={cn("rounded-full border px-3 py-1 text-sm", period === p.id ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 hover:bg-slate-50")}>
                    {p.label}
                  </button>
                ))}
              </div>
              {period === "custom" ? (
                <div className="mt-3 grid grid-cols-2 gap-3">
                  <Field label="From" htmlFor="rq-from"><input id="rq-from" type="date" max={todayKey} className={inputClass} value={custom.fromKey} onChange={(e) => setCustom({ ...custom, fromKey: e.target.value })} /></Field>
                  <Field label="To" htmlFor="rq-to"><input id="rq-to" type="date" max={todayKey} className={inputClass} value={custom.toKey} onChange={(e) => setCustom({ ...custom, toKey: e.target.value })} /></Field>
                </div>
              ) : null}
            </div>
          </div>
          <div className="space-y-3">
            <Field label="Message to the head" htmlFor="rq-note" hint="Optional">
              <input id="rq-note" className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: bring it before 20:00" />
            </Field>
            <Button onClick={send} disabled={busy || !range.fromKey || !range.toKey}>
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Send request
            </Button>
          </div>
        </div>
      </Section>

      <Section title={`Your requests${open.length ? ` (${open.length} waiting)` : ""}`}>
        {requests.length === 0 ? (
          <EmptyState title="No requests yet" description="Requests you send appear here with the amount due and what was handed over." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm" data-testid="cash-request-list">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="py-2 pr-3 font-medium">Department</th>
                  <th className="py-2 pr-3 font-medium">Cash of</th>
                  <th className="py-2 pr-3 text-right font-medium">Taken in (net)</th>
                  <th className="py-2 pr-3 text-right font-medium">Handed over</th>
                  <th className="py-2 pr-3 text-right font-medium">Still due</th>
                  <th className="py-2 pr-3 font-medium">Status</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {requests.map((r) => {
                  const [label, tone] = REQUEST_PILL[r.status] || [r.status, "slate"];
                  return (
                    <tr key={r.id} className={cn("border-b border-slate-100 last:border-0", r.status === "CANCELLED" && "text-slate-400")}>
                      <td className="py-2 pr-3 font-medium">{r.department}</td>
                      <td className="py-2 pr-3">{r.period}{r.note ? <div className="text-xs text-slate-500">“{r.note}”</div> : null}</td>
                      <td className="py-2 pr-3 text-right"><Money value={r.figures.net} /></td>
                      <td className="py-2 pr-3 text-right">
                        <Money value={r.figures.handedOver} />
                        {r.handovers.length ? <div className="text-xs text-slate-500">{r.handovers.map((h) => h.referenceNo).join(", ")}</div> : null}
                      </td>
                      <td className="py-2 pr-3 text-right font-semibold"><Money value={r.status === "CANCELLED" ? 0 : r.figures.outstanding} /></td>
                      <td className="py-2 pr-3"><Pill tone={tone}>{label}</Pill></td>
                      <td className="py-2 text-right">
                        {r.status === "OPEN" ? (
                          <Button size="sm" variant="ghost" onClick={() => cancel(r)} disabled={cancelling === r.id} aria-label={`Cancel the request to ${r.department}`}>
                            {cancelling === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />} Cancel
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Section>
    </div>
  );
}
