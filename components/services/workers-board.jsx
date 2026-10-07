"use client";

import { useState } from "react";
import { HandCoins, Pencil, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Pill, Section, inputClass } from "@/components/kit/primitives";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { PaymentFields, paymentReady, METHOD_NAMES } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { workerPaySpec, workerSpec } from "@/lib/trade/specs";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";

function WorkerDialog({ departmentId, worker, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ name: worker?.name || "", phone: worker?.phone || "", isActive: worker ? worker.isActive : true });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(workerSpec(departmentId, { ...(worker ? { id: worker.id } : {}), ...f, name: f.name.trim() }), { success: "Saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={worker ? worker.name : "Add a washer"} footer={<SubmitButton busy={busy} disabled={!f.name.trim()} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required htmlFor="wk-n"><input id="wk-n" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone" htmlFor="wk-p"><input id="wk-p" className={inputClass} value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
        {worker ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Still working here</label> : null}
      </div>
    </FormDialog>
  );
}

function PayDialog({ departmentId, worker, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ amount: String(worker.owed), paymentMethod: "CASH", reference: "", receivedByName: "" });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(workerPaySpec(departmentId, worker, { amount: Number(f.amount), paymentMethod: f.paymentMethod, reference: f.reference.trim() || null }), { success: `${worker.name} paid.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`Pay ${worker.name}`} description={`${formatMoney(worker.owed)} earned and not paid yet.`} footer={<SubmitButton busy={busy} disabled={!paymentReady(f) || Number(f.amount) > worker.owed} onClick={submit}>Record the payment</SubmitButton>}>
      <PaymentFields value={f} onChange={setF} idPrefix="wp" amountLabel="Amount paid (FCFA)" showBy={false} />
    </FormDialog>
  );
}

/** Washers: what each earned (collected washes), was paid and is owed; their work in the period; payouts. */
export function WorkersBoard({ departmentId, workers, payouts, perms }) {
  const [dialog, setDialog] = useState(null);
  return (
    <div className="space-y-5">
      <Section
        title="Washers"
        description="Commissions are earned when the wash is collected (paid or on credit), at the rate of the price list."
        bodyClassName="p-0"
        actions={perms.servicesManage ? <Button size="sm" onClick={() => setDialog({ kind: "edit", worker: null })}><UserPlus className="h-4 w-4" /> Add a washer</Button> : null}
      >
        <DataTable
          rows={workers}
          rowClassName={(w) => (!w.isActive ? "opacity-60" : "")}
          empty="No washer yet."
          columns={[
            { key: "n", label: "Washer", render: (w) => <span className="font-medium">{w.name}{w.phone ? <span className="block text-xs font-normal text-slate-500">{w.phone}</span> : null}{!w.isActive ? <Pill className="ml-1">left</Pill> : null}</span> },
            { key: "t", label: "Washes (period)", align: "right", render: (w) => w.period.tickets },
            { key: "r", label: "Work done (period)", align: "right", render: (w) => <Money value={w.period.revenue} suffix={false} /> },
            { key: "c", label: "Earned (period)", align: "right", render: (w) => <Money value={w.period.commission} suffix={false} /> },
            { key: "e", label: "Earned (all)", align: "right", render: (w) => <Money value={w.earned} suffix={false} /> },
            { key: "p", label: "Paid (all)", align: "right", render: (w) => <Money value={w.paid} suffix={false} /> },
            { key: "o", label: "Owed", align: "right", render: (w) => (w.owed > 0 ? <strong><Money value={w.owed} suffix={false} /></strong> : "—") },
            { key: "x", label: "", render: (w) => <div className="flex justify-end gap-1">{perms.expenses && w.owed > 0 ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "pay", worker: w })}><HandCoins className="h-4 w-4" /> Pay</Button> : null}{perms.servicesManage ? <Button size="sm" variant="ghost" aria-label={`Edit ${w.name}`} onClick={() => setDialog({ kind: "edit", worker: w })}><Pencil className="h-4 w-4" /></Button> : null}</div> },
          ]}
        />
      </Section>
      <Section title="Payouts of the period" bodyClassName="p-0">
        <DataTable dense rows={payouts} rowClassName={(p) => (p.voided ? "opacity-50 line-through" : "")} empty="No payout in this period." columns={[{ key: "r", label: "Reference", render: (p) => <span className="font-mono text-xs">{p.referenceNo}</span> }, { key: "d", label: "Date", render: (p) => formatDateKey(p.dateKey, { weekday: false }) }, { key: "w", label: "Washer", render: (p) => p.worker }, { key: "m", label: "How", render: (p) => METHOD_NAMES[p.method] || p.method }, { key: "a", label: "Amount", align: "right", render: (p) => <Money value={p.amount} suffix={false} /> }]} />
      </Section>
      {dialog?.kind === "edit" ? <WorkerDialog departmentId={departmentId} worker={dialog.worker} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "pay" ? <PayDialog departmentId={departmentId} worker={dialog.worker} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
