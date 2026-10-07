"use client";

import { useState } from "react";
import { BadgePlus, LogIn, MessageCircle, Pencil, Plus, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DataTable, Field, Money, Pill, Section, inputClass, selectClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { VoidButton } from "@/components/kit/void-button";
import { CheckoutFields, checkoutInput, checkoutReady } from "@/components/trade/pos";
import { useRecorder } from "@/lib/offline/react";
import { membershipCancelSpec, membershipSpec, planSpec, visitSpec } from "@/lib/production/specs";
import { MEMBERSHIP_LABELS, MEMBERSHIP_TONES, renewalMessage } from "@/lib/salon/salon-math";
import { whatsappLink } from "@/lib/property/reminder-text";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

function PlanDialog({ departmentId, plan, canPrice, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ name: plan?.name || "", kind: plan?.kind || "PERIOD", days: plan?.days ? String(plan.days) : "30", sessions: plan?.sessions ? String(plan.sessions) : "", price: plan ? String(plan.price) : "", isActive: plan ? plan.isActive : true });
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: ["days", "sessions", "price"].includes(k) ? wholeNumber(e.target.value) : e.target.value });
  const valid = f.name.trim() && f.price !== "" && (f.kind === "PERIOD" ? Number(f.days) > 0 : Number(f.sessions) > 0);
  const submit = async () => {
    setBusy(true);
    const out = await record(planSpec(departmentId, { ...(plan ? { id: plan.id } : {}), name: f.name.trim(), kind: f.kind, days: Number(f.days) || null, sessions: Number(f.sessions) || null, price: Number(f.price), isActive: f.isActive }), { success: "Plan saved." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={plan ? plan.name : "Add a membership plan"} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Save</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name" required htmlFor="pl-n" className="sm:col-span-2"><input id="pl-n" className={inputClass} value={f.name} onChange={set("name")} placeholder="Gym – 1 month, 10 sessions, Monthly hair care…" /></Field>
        <Field label="Kind" htmlFor="pl-k"><select id="pl-k" className={selectClass} value={f.kind} onChange={set("kind")}><option value="PERIOD">Unlimited for a number of days</option><option value="SESSIONS">A number of sessions</option></select></Field>
        {f.kind === "SESSIONS" ? <Field label="Sessions" required htmlFor="pl-s"><input id="pl-s" className={inputClass} inputMode="numeric" value={f.sessions} onChange={set("sessions")} /></Field> : null}
        <Field label={f.kind === "PERIOD" ? "Days" : "Valid for (days, optional)"} required={f.kind === "PERIOD"} htmlFor="pl-d"><input id="pl-d" className={inputClass} inputMode="numeric" value={f.days} onChange={set("days")} /></Field>
        <Field label="Price (FCFA)" required htmlFor="pl-p"><input id="pl-p" className={inputClass} inputMode="numeric" value={f.price} onChange={set("price")} disabled={plan && !canPrice} /></Field>
        {plan ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> Still sold</label> : null}
      </div>
    </FormDialog>
  );
}

function SellDialog({ departmentId, plans, debtors, todayKey, prefill, onClose }) {
  const record = useRecorder();
  const active = plans.filter((p) => p.isActive);
  const [f, setF] = useState({ planId: prefill?.planId || active[0]?.id || "", name: prefill?.customer || "", phone: prefill?.phone || "", startKey: prefill?.startKey || todayKey });
  const [pay, setPay] = useState({ paymentMethod: "CASH", tendered: "", reference: "", debtorId: "", debtorName: "", debtorPhone: "", discount: "", discountReason: "" });
  const [busy, setBusy] = useState(false);
  const plan = plans.find((p) => p.id === f.planId);
  const valid = plan && f.name.trim() && (pay.paymentMethod === "CREDIT" || checkoutReady(pay, plan.price));
  const submit = async () => {
    setBusy(true);
    const c = checkoutInput(pay);
    const out = await record(membershipSpec(departmentId, { planId: plan.id, client: { name: f.name.trim(), phone: f.phone.trim() || null }, startKey: f.startKey, paymentMethod: c.paymentMethod, reference: c.reference }, plan.name), { success: (d) => `${d?.referenceNo || "Membership"} sold${d?.endKey ? ` · until ${d.endKey}` : ""}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={prefill ? `Renew ${prefill.customer}` : "Sell a membership"} description={plan ? `${formatMoney(plan.price)} · ${plan.kind === "SESSIONS" ? `${plan.sessions} sessions${plan.days ? ` within ${plan.days} days` : ""}` : `${plan.days} days`}` : undefined} footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}><BadgePlus className="h-4 w-4" /> Sell</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Plan" required htmlFor="ms-p"><select id="ms-p" className={selectClass} value={f.planId} onChange={(e) => setF({ ...f, planId: e.target.value })}>{active.map((p) => <option key={p.id} value={p.id}>{p.name} · {formatMoney(p.price)}</option>)}</select></Field>
        <Field label="Starts on" htmlFor="ms-s"><input id="ms-s" type="date" className={inputClass} value={f.startKey} onChange={(e) => setF({ ...f, startKey: e.target.value })} /></Field>
        <Field label="Member" required htmlFor="ms-n"><input id="ms-n" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Phone (WhatsApp)" htmlFor="ms-ph"><input id="ms-ph" className={inputClass} inputMode="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
      </div>
      {plan ? <CheckoutFields value={pay} onChange={(v) => setPay({ ...v, debtorId: "", debtorName: f.name, debtorPhone: f.phone })} total={plan.price} debtors={debtors} canDiscount={false} discountLimit={0} idPrefix="ms" /> : null}
    </FormDialog>
  );
}

const nextDay = (key) => (key ? new Date(Date.parse(`${key}T00:00:00Z`) + 86400000).toISOString().slice(0, 10) : null);

/** Membership plans, and the memberships with their state, check-ins, renewal and cancellation. */
export function MembershipsBoard({ departmentId, business, plans, memberships, debtors, todayKey, perms, view }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const shown = memberships.filter((m) => (view === "renew" ? m.renew : view === "all" ? true : view === "ended" ? ["EXPIRED", "USED_UP", "CANCELLED"].includes(m.state.status) : ["ACTIVE", "NOT_STARTED"].includes(m.state.status)));
  return (
    <div className="space-y-5">
      <Section title="Members" bodyClassName="p-0" actions={perms.sell && plans.some((p) => p.isActive) ? <Button size="sm" onClick={() => setDialog({ kind: "sell" })}><BadgePlus className="h-4 w-4" /> Sell a membership</Button> : null}>
        <DataTable
          rows={shown}
          empty={view === "renew" ? "Nobody to remind." : "No membership here."}
          rowClassName={(m) => (m.state.status === "CANCELLED" ? "opacity-50" : "")}
          columns={[
            { key: "n", label: "Member", render: (m) => <span className="font-medium">{m.customer}{m.phone ? <span className="block text-xs font-normal text-slate-500">{m.phone}</span> : null}</span> },
            { key: "p", label: "Plan", render: (m) => <span>{m.plan}<span className="block font-mono text-xs text-slate-500">{m.referenceNo}</span></span> },
            { key: "d", label: "Valid", render: (m) => <span className="text-xs">{formatDateKey(m.startKey, { weekday: false })}{m.endKey ? ` → ${formatDateKey(m.endKey, { weekday: false })}` : ""}{m.state.daysLeft !== null && m.state.status === "ACTIVE" ? <span className="block">{m.state.daysLeft} day(s) left</span> : null}</span> },
            { key: "s", label: "Sessions", align: "right", render: (m) => (m.sessionsTotal ? <span className={cn(m.state.sessionsLeft <= 1 && "font-semibold text-amber-700")}>{m.used} / {m.sessionsTotal}</span> : <span className="text-xs">{m.used} visit(s)</span>) },
            { key: "st", label: "State", render: (m) => <span className="inline-flex flex-wrap gap-1"><Pill tone={MEMBERSHIP_TONES[m.state.status]}>{MEMBERSHIP_LABELS[m.state.status]}</Pill>{m.onCredit ? <Pill tone="rose">on credit</Pill> : null}{m.renew ? <Pill tone="amber">renew soon</Pill> : null}</span> },
            { key: "pr", label: "Price", align: "right", render: (m) => <Money value={m.price} suffix={false} /> },
            {
              key: "x",
              label: "",
              render: (m) => {
                const wa = m.phone && (m.renew || ["EXPIRED", "USED_UP"].includes(m.state.status)) ? whatsappLink(m.phone, renewalMessage({ business, customer: m.customer, plan: m.plan, endKey: m.endKey, sessionsLeft: m.state.sessionsLeft })) : null;
                return (
                  <div className="flex flex-wrap justify-end gap-1">
                    {m.state.usable && perms.servicesTicket ? <Button size="sm" onClick={() => record(visitSpec(departmentId, m), { success: `${m.customer} checked in.` })}><LogIn className="h-4 w-4" /> Check in</Button> : null}
                    {wa ? <a href={wa} target="_blank" rel="noreferrer" aria-label={`Remind ${m.customer} on WhatsApp`}><Button size="sm" variant="outline"><MessageCircle className="h-4 w-4" /></Button></a> : null}
                    {perms.sell && m.state.status !== "CANCELLED" && (m.renew || ["EXPIRED", "USED_UP"].includes(m.state.status)) ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "sell", prefill: { planId: m.planId, customer: m.customer, phone: m.phone, startKey: m.state.status === "ACTIVE" && m.endKey ? nextDay(m.endKey) : todayKey } })}><RefreshCw className="h-4 w-4" /> Renew</Button> : null}
                    {perms.void && m.state.status !== "CANCELLED" ? <VoidButton label="Cancel" what="membership (its sale is refunded)" reference={m.referenceNo} onVoid={(reason) => record(membershipCancelSpec(departmentId, m, reason), { success: `${m.referenceNo} cancelled and refunded.` })} /> : null}
                  </div>
                );
              },
            },
          ]}
        />
      </Section>
      <Section title="Plans" bodyClassName="p-0" actions={perms.servicesManage ? <Button size="sm" variant="outline" onClick={() => setDialog({ kind: "plan", plan: null })}><Plus className="h-4 w-4" /> Add a plan</Button> : null}>
        <DataTable dense rows={plans} rowClassName={(p) => (!p.isActive ? "opacity-50" : "")} empty="No plan yet: add a monthly membership or a pack of sessions." columns={[{ key: "n", label: "Plan", render: (p) => p.name }, { key: "k", label: "What", render: (p) => (p.kind === "SESSIONS" ? `${p.sessions} sessions${p.days ? ` within ${p.days} days` : ""}` : `${p.days} days, unlimited`) }, { key: "p", label: "Price", align: "right", render: (p) => <Money value={p.price} suffix={false} /> }, { key: "s", label: "Sold", align: "right", render: (p) => p.sold }, { key: "x", label: "", render: (p) => (perms.servicesManage ? <Button size="sm" variant="ghost" onClick={() => setDialog({ kind: "plan", plan: p })} aria-label={`Edit ${p.name}`}><Pencil className="h-4 w-4" /></Button> : null) }]} />
      </Section>
      {dialog?.kind === "plan" ? <PlanDialog departmentId={departmentId} plan={dialog.plan} canPrice={perms.prices} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === "sell" ? <SellDialog departmentId={departmentId} plans={plans} debtors={debtors} todayKey={todayKey} prefill={dialog.prefill} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
