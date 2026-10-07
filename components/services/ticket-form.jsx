"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { SubmitButton } from "@/components/kit/form-dialog";
import { METHODS } from "@/components/kit/payment-fields";
import { useRecorder } from "@/lib/offline/react";
import { ticketSpec } from "@/lib/trade/specs";
import { ticketTotals } from "@/lib/services/ticket-math";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

const decimal = (v) => String(v ?? "").replace(",", ".").replace(/[^0-9.]/g, "");
const pad = (n) => String(n).padStart(2, "0");
/** "YYYY-MM-DDTHH:mm" in the browser's local time, `hours` from now. */
const localIn = (hours) => {
  const d = new Date(Date.now() + hours * 3600000);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/**
 * A new ticket: the customer (or the vehicle), the items or services with their price from the
 * price list (by garment / vehicle type), express, tag numbers, when it will be ready, and a
 * payment at drop-off (advance) if any. Loyalty (every Nth wash free) is applied by the server.
 */
export function TicketForm({ departmentId, domain, items, variants, variantsLabel, workers, settings, canPrice, canDiscount, discountLimit, words }) {
  const record = useRecorder();
  const router = useRouter();
  const carWash = domain === "CAR_WASH";
  const firstVariant = variants[0] || "";
  const [c, setC] = useState({ name: "", phone: "", plate: "", vehicleType: carWash ? firstVariant : "" });
  const [lines, setLines] = useState([{ itemId: items[0]?.id || "", variant: firstVariant, quantity: "1", unitPrice: "", workerId: "", notes: "" }]);
  const [f, setF] = useState({ express: false, tagNo: "", promised: localIn(settings.defaultHours), notes: "", discount: "", discountReason: "", start: carWash });
  const [pay, setPay] = useState({ amount: "", paymentMethod: "CASH", reference: "" });
  const [busy, setBusy] = useState(false);
  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const priceOf = (l) => (l.unitPrice !== "" ? Number(l.unitPrice) : byId[l.itemId] ? (l.variant && byId[l.itemId].prices[l.variant] !== undefined ? Number(byId[l.itemId].prices[l.variant]) : byId[l.itemId].basePrice) : 0);
  const priced = lines.filter((l) => l.itemId && Number(l.quantity) > 0).map((l) => ({ ...l, override: l.unitPrice !== "", unitPrice: priceOf(l), quantity: Number(l.quantity) }));
  const totals = ticketTotals(priced, { surchargePct: f.express ? settings.expressPct : 0, discount: Number(f.discount) || 0 });
  const setLine = (i, patch) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));
  const setVehicle = (vehicleType) => {
    setC({ ...c, vehicleType });
    setLines(lines.map((l) => ({ ...l, variant: vehicleType, unitPrice: "" })));
  };
  const valid = priced.length && (!carWash || c.plate.trim()) && (!Number(f.discount) || f.discountReason.trim()) && Number(pay.amount || 0) <= totals.total && (!Number(pay.amount) || pay.paymentMethod === "CASH" || pay.reference.trim());
  const submit = async () => {
    setBusy(true);
    const input = {
      ...(c.name.trim() ? { client: { name: c.name.trim(), phone: c.phone.trim() || null } } : { customerPhone: c.phone.trim() || null }),
      vehiclePlate: carWash ? c.plate.trim() : null,
      vehicleType: carWash ? c.vehicleType : null,
      lines: priced.map((l) => ({ itemId: l.itemId, variant: l.variant || null, quantity: l.quantity, workerId: l.workerId || null, notes: l.notes.trim() || null, ...(l.override ? { unitPrice: l.unitPrice } : {}) })),
      express: f.express,
      tagNo: f.tagNo.trim() || null,
      promisedAt: f.promised ? new Date(f.promised).toISOString() : null,
      notes: f.notes.trim() || null,
      discount: Number(f.discount) || 0,
      discountReason: f.discountReason.trim() || null,
      start: f.start,
      ...(Number(pay.amount) > 0 ? { payment: { amount: Number(pay.amount), paymentMethod: pay.paymentMethod, reference: pay.reference.trim() || null } } : {}),
    };
    const out = await record(ticketSpec(departmentId, input, totals.total), { success: (d) => (d?.loyalty ? `${d.referenceNo}: loyalty — this one is free!` : `${d?.referenceNo || "Ticket"} created.`) });
    setBusy(false);
    if (out) router.push(out.status === "applied" && out.result?.ticketId ? `/d/${departmentId}/tickets/${out.result.ticketId}` : `/d/${departmentId}/tickets`);
  };

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
      <div className="space-y-4">
        <Section title={carWash ? "Vehicle and customer" : "Customer"}>
          <div className="grid gap-3 sm:grid-cols-2">
            {carWash ? (
              <>
                <Field label="Plate number" required htmlFor="tk-plate"><input id="tk-plate" autoFocus className={cn(inputClass, "uppercase")} value={c.plate} onChange={(e) => setC({ ...c, plate: e.target.value })} placeholder="LT 123 AB" /></Field>
                <Field label={variantsLabel} htmlFor="tk-vt"><select id="tk-vt" className={selectClass} value={c.vehicleType} onChange={(e) => setVehicle(e.target.value)}>{variants.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field>
              </>
            ) : null}
            <Field label="Customer name" htmlFor="tk-n" hint={carWash ? "Optional" : "Write it on the slip"}><input id="tk-n" autoFocus={!carWash} className={inputClass} value={c.name} onChange={(e) => setC({ ...c, name: e.target.value })} /></Field>
            <Field label="Phone (WhatsApp)" htmlFor="tk-p" hint="To tell them when it is ready"><input id="tk-p" className={inputClass} inputMode="tel" value={c.phone} onChange={(e) => setC({ ...c, phone: e.target.value })} placeholder="6xx xx xx xx" /></Field>
          </div>
        </Section>

        <Section title={carWash ? "Services" : words.items}>
          {items.length ? (
            <div className="space-y-3">
              {lines.map((l, i) => (
                <div key={i} className="grid items-end gap-2 rounded-lg border border-slate-100 p-2 sm:grid-cols-12">
                  <Field label="Service" htmlFor={`tl-i-${i}`} className="sm:col-span-4"><select id={`tl-i-${i}`} className={selectClass} value={l.itemId} onChange={(e) => setLine(i, { itemId: e.target.value, unitPrice: "" })}>{items.map((it) => <option key={it.id} value={it.id}>{it.name}</option>)}</select></Field>
                  {variants.length && !carWash ? <Field label={variantsLabel} htmlFor={`tl-v-${i}`} className="sm:col-span-3"><select id={`tl-v-${i}`} className={selectClass} value={l.variant} onChange={(e) => setLine(i, { variant: e.target.value, unitPrice: "" })}><option value="">—</option>{variants.map((v) => <option key={v} value={v}>{v}</option>)}</select></Field> : null}
                  <Field label="Qty" htmlFor={`tl-q-${i}`} className="sm:col-span-1"><input id={`tl-q-${i}`} className={inputClass} inputMode="decimal" value={l.quantity} onChange={(e) => setLine(i, { quantity: decimal(e.target.value) })} /></Field>
                  <Field label="Price" htmlFor={`tl-p-${i}`} className="sm:col-span-2"><input id={`tl-p-${i}`} className={inputClass} inputMode="numeric" value={l.unitPrice === "" ? priceOf(l) : l.unitPrice} disabled={!canPrice} onChange={(e) => setLine(i, { unitPrice: wholeNumber(e.target.value) })} /></Field>
                  {workers.length ? <Field label="Washer" htmlFor={`tl-w-${i}`} className="sm:col-span-2"><select id={`tl-w-${i}`} className={selectClass} value={l.workerId} onChange={(e) => setLine(i, { workerId: e.target.value })}><option value="">—</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field> : null}
                  {!carWash ? <Field label="Notes (colour, brand, stains)" htmlFor={`tl-n-${i}`} className="sm:col-span-10"><input id={`tl-n-${i}`} className={inputClass} value={l.notes} onChange={(e) => setLine(i, { notes: e.target.value })} /></Field> : null}
                  <div className="flex justify-end sm:col-span-2"><Button type="button" variant="ghost" size="icon" aria-label="Remove the line" disabled={lines.length === 1} onClick={() => setLines(lines.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button></div>
                </div>
              ))}
              <Button type="button" variant="ghost" size="sm" onClick={() => setLines([...lines, { itemId: items[0].id, variant: carWash ? c.vehicleType : "", quantity: "1", unitPrice: "", workerId: lines.at(-1)?.workerId || "", notes: "" }])}><Plus className="h-4 w-4" /> Another {carWash ? "service" : "item"}</Button>
            </div>
          ) : <p className="text-sm text-slate-500">The price list is empty: add the services and their prices on the price list page first.</p>}
        </Section>

        <Section title="Details">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Ready by" htmlFor="tk-pr"><input id="tk-pr" type="datetime-local" className={inputClass} value={f.promised} onChange={(e) => setF({ ...f, promised: e.target.value })} /></Field>
            {!carWash ? <Field label="Tag numbers" htmlFor="tk-tag" hint="Written on the garments' labels"><input id="tk-tag" className={inputClass} value={f.tagNo} onChange={(e) => setF({ ...f, tagNo: e.target.value })} placeholder="A101–A105" /></Field> : null}
            <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.express} onChange={(e) => setF({ ...f, express: e.target.checked, promised: e.target.checked ? localIn(Math.max(1, Math.round(settings.defaultHours / 2))) : localIn(settings.defaultHours) })} /> <Zap className="h-4 w-4 text-amber-500" /> Express (+{settings.expressPct} %)</label>
            {carWash ? <label className="flex items-center gap-2 self-end pb-2 text-sm"><input type="checkbox" checked={f.start} onChange={(e) => setF({ ...f, start: e.target.checked })} /> Washing starts now</label> : null}
            {canDiscount || discountLimit > 0 ? (
              <>
                <Field label="Discount (FCFA)" htmlFor="tk-d"><input id="tk-d" className={inputClass} inputMode="numeric" value={f.discount} onChange={(e) => setF({ ...f, discount: wholeNumber(e.target.value) })} /></Field>
                <Field label="Reason" required={Number(f.discount) > 0} htmlFor="tk-dr"><input id="tk-dr" className={inputClass} value={f.discountReason} onChange={(e) => setF({ ...f, discountReason: e.target.value })} /></Field>
              </>
            ) : null}
            <Field label="Notes" htmlFor="tk-no" className="sm:col-span-3"><textarea id="tk-no" rows={2} className={textareaClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
          </div>
        </Section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Section title="Total">
          <dl className="space-y-1 text-sm">
            <div className="flex justify-between"><dt>Items</dt><dd className="tabular-nums">{formatMoney(totals.subtotal)}</dd></div>
            {totals.surcharge ? <div className="flex justify-between"><dt>Express +{settings.expressPct} %</dt><dd className="tabular-nums">{formatMoney(totals.surcharge)}</dd></div> : null}
            {totals.discount ? <div className="flex justify-between"><dt>Discount</dt><dd className="tabular-nums">−{formatMoney(totals.discount)}</dd></div> : null}
            <div className="flex justify-between border-t border-slate-200 pt-2 text-lg font-bold"><dt>To pay</dt><dd className="tabular-nums" data-testid="ticket-total">{formatMoney(totals.total)}</dd></div>
          </dl>
          {settings.loyaltyEvery > 1 ? <p className="mt-2 text-xs text-slate-500">Loyalty: every {settings.loyaltyEvery}th {carWash ? "wash" : "ticket"} of a {carWash ? "vehicle" : "customer"} is free — applied automatically.</p> : null}
        </Section>
        <Section title={carWash ? "Paid now (optional)" : "Advance at drop-off (optional)"}>
          <div className="grid gap-2">
            <Field label="Amount (FCFA)" htmlFor="tk-pa"><input id="tk-pa" className={inputClass} inputMode="numeric" value={pay.amount} onChange={(e) => setPay({ ...pay, amount: wholeNumber(e.target.value) })} placeholder="0" /></Field>
            <div className="flex gap-1">{[["Nothing", ""], ["Half", Math.round(totals.total / 2)], ["All", totals.total]].map(([l, v]) => <Button key={l} type="button" size="sm" variant="outline" onClick={() => setPay({ ...pay, amount: v === "" ? "" : String(v) })}>{l}</Button>)}</div>
            {Number(pay.amount) > 0 ? (
              <>
                <Field label="Paid by" htmlFor="tk-pm"><select id="tk-pm" className={selectClass} value={pay.paymentMethod} onChange={(e) => setPay({ ...pay, paymentMethod: e.target.value })}>{METHODS.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select></Field>
                {pay.paymentMethod !== "CASH" ? <Field label="Transaction reference" required htmlFor="tk-pref"><input id="tk-pref" className={inputClass} value={pay.reference} onChange={(e) => setPay({ ...pay, reference: e.target.value })} /></Field> : null}
              </>
            ) : null}
          </div>
        </Section>
        <SubmitButton busy={busy} disabled={!valid} onClick={submit}>Create the {words.ticket.toLowerCase()}</SubmitButton>
      </div>
    </div>
  );
}
