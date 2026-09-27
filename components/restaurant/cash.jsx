"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { BellRing, HandCoins, Loader2, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Equation, Field, Money, StatCard, StatusBadge, inputClass } from "@/components/kit/primitives";
import { runWithToast, useIdempotencyKey, useLiveRefresh, wholeNumber } from "@/components/kit/client";
import { ProofUpload } from "@/components/kit/proof-upload";
import { VoidButton } from "@/components/kit/void-button";
import { formatMoney } from "@/lib/format";
import { recordHandover } from "@/actions/handovers";
import { voidRecord } from "@/actions/money";
import { cn } from "@/lib/utils";

function HandoverDialog({ onClose, departmentId, max, request = null }) {
  const router = useRouter();
  const [key, renew] = useIdempotencyKey();
  const suggested = request ? Math.min(max, request.figures.outstanding) : 0;
  const [f, setF] = useState({ amount: suggested > 0 ? String(suggested) : "", recipientName: "Boss", reference: "", note: "", attachmentIds: [] });
  const [busy, setBusy] = useState(false);
  const amount = Number(f.amount) || 0;
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(recordHandover({ departmentId, ...f, cashRequestId: request?.id || null, idempotencyKey: key }), { success: (d) => `Handover ${d.referenceNo} recorded. The Boss will confirm it.` });
    setBusy(false);
    if (ok) {
      renew();
      onClose();
      router.refresh();
    }
  };
  return (
    <Dialog open onOpenChange={(v) => !v && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{request ? `Hand over the cash of ${request.period}` : "Hand over cash"}</DialogTitle>
          <DialogDescription>
            {request ? <>The Boss asked for this cash. Still to hand over for the period: <strong>{formatMoney(request.figures.outstanding)}</strong>. </> : null}
            The drawer should hold {formatMoney(max)} in cash. You cannot hand over more than that.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Amount (FCFA)" required htmlFor="h-amount" error={amount > max ? `At most ${formatMoney(max)}` : null}>
            <input id="h-amount" inputMode="numeric" className={inputClass} value={f.amount} onChange={(e) => setF({ ...f, amount: wholeNumber(e.target.value) })} />
          </Field>
          <Field label="Given to" htmlFor="h-recipient">
            <input id="h-recipient" className={inputClass} value={f.recipientName} onChange={(e) => setF({ ...f, recipientName: e.target.value })} />
          </Field>
          <Field label="Reference" htmlFor="h-ref" hint="Slip or MoMo reference (optional)">
            <input id="h-ref" className={inputClass} value={f.reference} onChange={(e) => setF({ ...f, reference: e.target.value })} />
          </Field>
          <Field label="Note" htmlFor="h-note">
            <input id="h-note" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="Optional" />
          </Field>
          <div className="sm:col-span-2">
            <ProofUpload departmentId={departmentId} value={f.attachmentIds} onChange={(ids) => setF({ ...f, attachmentIds: ids })} label="Attach a photo of the slip (optional)" />
          </div>
        </div>
        {amount > 0 && amount <= max ? <p className="rounded-md bg-slate-50 px-3 py-2 text-sm">After this handover the drawer should hold <strong>{formatMoney(max - amount)}</strong>.</p> : null}
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={busy || !(amount > 0) || amount > max} onClick={submit}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Hand over {amount ? formatMoney(amount) : ""}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Slip({ h, departmentName, onClose }) {
  if (!h) return null;
  return (
    <Dialog open={Boolean(h)} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Handover slip {h.referenceNo}</DialogTitle>
        </DialogHeader>
        <div id="receipt" className="receipt space-y-2 rounded-lg border border-slate-300 p-4 text-sm">
          <div className="text-center text-base font-bold">Cash handover slip</div>
          <div className="text-center text-xs">{departmentName} · {h.referenceNo}</div>
          <div className="flex justify-between"><span>Date</span><span>{h.dateLabel}</span></div>
          <div className="flex justify-between"><span>Handed over by</span><span>{h.by}</span></div>
          <div className="flex justify-between"><span>Given to</span><span>{h.recipient}</span></div>
          <div className="flex justify-between text-lg font-bold"><span>Amount</span><span>{formatMoney(h.amount)}</span></div>
          <div className="grid grid-cols-2 gap-6 pt-8 text-xs">
            <div className="border-t border-slate-500 pt-1">Signature (gives)</div>
            <div className="border-t border-slate-500 pt-1">Signature (receives)</div>
          </div>
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => { document.body.classList.add("print-receipt"); window.print(); document.body.classList.remove("print-receipt"); }}><Printer className="h-4 w-4" /> Print</Button>
          <Button onClick={onClose}>Close</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RequestList({ requests, canHandOver, max, onHandOver }) {
  const open = requests.filter((r) => r.status === "OPEN");
  const done = requests.filter((r) => r.status !== "OPEN").slice(0, 5);
  if (!requests.length) return null;
  return (
    <div className="space-y-3" data-testid="cash-requests">
      {open.map((r) => (
        <div key={r.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4">
          <div className="flex gap-3">
            <BellRing className="mt-0.5 h-5 w-5 shrink-0 text-amber-700" />
            <div>
              <div className="font-semibold text-amber-950">The Boss asks for the cash of {r.period}</div>
              <div className="text-sm text-amber-900">
                Cash taken in {formatMoney(r.figures.cashIn)} − paid out {formatMoney(r.figures.cashOut)} − already handed over {formatMoney(r.figures.handedOver)} ={" "}
                <strong>{formatMoney(r.figures.outstanding)} to hand over</strong>
              </div>
              {r.note ? <div className="mt-1 text-sm text-amber-900">“{r.note}”</div> : null}
              <div className="text-xs text-amber-800/80">Requested by {r.requestedBy}</div>
            </div>
          </div>
          {canHandOver ? (
            <Button onClick={() => onHandOver(r)} disabled={max <= 0}>
              <HandCoins className="h-4 w-4" /> Hand over for this request
            </Button>
          ) : null}
        </div>
      ))}
      {done.length ? (
        <div className="rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm shadow-xs">
          <div className="mb-1 font-semibold">Earlier requests from the Boss</div>
          <ul className="divide-y divide-slate-100">
            {done.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-1.5">
                <span>{r.period}</span>
                <span className="text-slate-600">
                  {r.status === "CANCELLED" ? "Cancelled by the Boss" : `Handed over ${formatMoney(r.figures.againstRequest)} (${r.handovers.map((h) => h.referenceNo).join(", ")})`}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}

export function CashBoard({ departmentId, departmentName, canHandOver, canVoid, drawer, handovers, requests = [] }) {
  useLiveRefresh(30);
  const [open, setOpen] = useState(false);
  const [forRequest, setForRequest] = useState(null);
  const [slip, setSlip] = useState(null);
  const max = Math.max(0, drawer.shouldRemain);
  return (
    <div className="space-y-6">
      <RequestList requests={requests} canHandOver={canHandOver} max={max} onHandOver={(r) => { setForRequest(r); setOpen(true); }} />
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatCard label="Cash in the drawer now" value={<Money value={drawer.shouldRemain} />} tone="dark" hint="What you should be able to count" />
        <StatCard label="Handed to the Boss today" value={<Money value={drawer.handedOver} />} hint={drawer.handoverPending ? `${formatMoney(drawer.handoverPending)} waiting for confirmation` : "All confirmed"} />
        <StatCard label="Cash received today" value={<Money value={drawer.cashIn} />} tone="in" hint="Cash sales, rent, other income, repayments" />
        <StatCard label="Cash paid out today" value={<Money value={drawer.cashOut} />} tone="out" hint="Purchases, expenses, discounts paid in cash" />
      </div>
      <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
        <Equation
          items={[
            { label: "Opening cash", value: formatMoney(drawer.opening) },
            { op: "+" },
            { label: "Cash in", value: formatMoney(drawer.cashIn) },
            { op: "−" },
            { label: "Cash out", value: formatMoney(drawer.cashOut) },
            { op: "−" },
            { label: "Handed over", value: formatMoney(drawer.handedOver) },
            { op: "=" },
            { label: "Should be in the drawer", value: formatMoney(drawer.shouldRemain), strong: true },
          ]}
        />
        {drawer.electronic.MOMO || drawer.electronic.BANK_TRANSFER ? (
          <p className="mt-2 text-xs text-slate-500">
            Also received today, not in the drawer: Mobile Money {formatMoney(drawer.electronic.MOMO)} · Bank {formatMoney(drawer.electronic.BANK_TRANSFER)}.
          </p>
        ) : null}
        {canHandOver ? (
          <Button className="mt-4" onClick={() => { setForRequest(null); setOpen(true); }} disabled={max <= 0}>
            <HandCoins className="h-4 w-4" /> Hand over cash
          </Button>
        ) : null}
      </div>
      <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
        <div className="border-b border-slate-100 px-4 py-3 text-sm font-semibold">Handovers</div>
        {handovers.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-slate-500">No cash handed over yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-left text-xs text-slate-500">
                  <th className="px-4 py-2 font-medium">Ref</th>
                  <th className="px-3 py-2 font-medium">When</th>
                  <th className="px-3 py-2 font-medium">To</th>
                  <th className="px-3 py-2 text-right font-medium">Amount</th>
                  <th className="px-3 py-2 font-medium">Status</th>
                  <th className="px-3 py-2 font-medium">By</th>
                  <th className="px-3 py-2" />
                </tr>
              </thead>
              <tbody>
                {handovers.map((h) => (
                  <tr key={h.id} className={cn("border-b border-slate-100 last:border-0", h.status === "VOIDED" && "text-slate-400")}>
                    <td className="px-4 py-2 font-medium">{h.referenceNo}{h.requestPeriod ? <div className="text-xs font-normal text-slate-500">Request {h.requestPeriod}</div> : null}</td>
                    <td className="whitespace-nowrap px-3 py-2">{h.dateLabel}</td>
                    <td className="px-3 py-2">{h.recipient}</td>
                    <td className="px-3 py-2 text-right font-medium"><Money value={h.amount} /></td>
                    <td className="px-3 py-2">
                      <StatusBadge status={h.status} />
                      {h.reviewNote ? <div className="text-xs text-slate-500">Boss: {h.reviewNote}</div> : null}
                    </td>
                    <td className="px-3 py-2 text-xs">{h.by}</td>
                    <td className="whitespace-nowrap px-3 py-1 text-right">
                      <Button size="sm" variant="ghost" onClick={() => setSlip(h)}><Printer className="h-3.5 w-3.5" /> Slip</Button>
                      {canVoid && h.status === "RECORDED" && h.isToday && h.transactionId ? (
                        <VoidButton what="handover" reference={h.referenceNo} action={(reason) => voidRecord({ transactionId: h.transactionId, reason })} />
                      ) : null}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {open ? <HandoverDialog key={forRequest?.id || "free"} onClose={() => setOpen(false)} departmentId={departmentId} max={max} request={forRequest} /> : null}
      <Slip h={slip} departmentName={departmentName} onClose={() => setSlip(null)} />
    </div>
  );
}
