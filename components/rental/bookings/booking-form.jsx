"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, CheckCircle2, Plus, Search, Trash2, UserPlus, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Money, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { rentalAvailability } from "@/actions/rental";
import { orderCreateSpec, orderUpdateSpec } from "@/lib/rental/specs";
import { defaultRange, orderTotals, requestedByItem } from "@/lib/rental/booking-math";
import { RENTAL_EVENT_TYPES } from "@/lib/domains/rental";
import { formatDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { cn } from "@/lib/utils";

let lineSeq = 0;
const newKey = () => `l${++lineSeq}`;

/** The customer: one already known (search by name or phone), or a new one. */
function CustomerPicker({ clients, value, onChange }) {
  const [q, setQ] = useState("");
  const chosen = value.clientId ? clients.find((c) => c.id === value.clientId) : null;
  const matches = useMemo(() => {
    const t = q.trim().toLowerCase();
    if (!t) return clients.slice(0, 6);
    return clients.filter((c) => c.name.toLowerCase().includes(t) || (c.phone || "").includes(t)).slice(0, 8);
  }, [q, clients]);
  if (chosen) {
    return (
      <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50/60 px-3 py-2" data-testid="chosen-customer">
        <div><div className="font-medium">{chosen.name}</div><div className="text-xs text-slate-600">{[chosen.phone, chosen.email].filter(Boolean).join(" · ")}</div></div>
        <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ clientId: null, client: null })}>Change</Button>
      </div>
    );
  }
  if (value.client) {
    const c = value.client;
    const set = (k) => (e) => onChange({ clientId: null, client: { ...c, [k]: e.target.value } });
    return (
      <div className="space-y-3 rounded-lg border border-slate-200 p-3">
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Customer name" required htmlFor="bc-name"><input id="bc-name" className={inputClass} value={c.name} onChange={set("name")} /></Field>
          <Field label="Phone" htmlFor="bc-phone"><input id="bc-phone" className={inputClass} inputMode="tel" value={c.phone} onChange={set("phone")} /></Field>
          <Field label="E-mail" htmlFor="bc-email"><input id="bc-email" type="email" className={inputClass} value={c.email} onChange={set("email")} /></Field>
          <Field label="Address" htmlFor="bc-addr"><input id="bc-addr" className={inputClass} value={c.address} onChange={set("address")} /></Field>
        </div>
        {clients.length ? <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ clientId: null, client: null })}><Users className="h-4 w-4" /> Choose a known customer instead</Button> : null}
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input aria-label="Find a customer" className={cn(inputClass, "pl-9")} placeholder="Find a customer by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {matches.length ? (
        <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200">
          {matches.map((c) => (
            <li key={c.id}><button type="button" className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-slate-50" onClick={() => onChange({ clientId: c.id, client: null })}><span className="font-medium">{c.name}</span><span className="text-slate-500">{c.phone}</span></button></li>
          ))}
        </ul>
      ) : q ? <p className="text-sm text-slate-500">No customer matches.</p> : null}
      <Button type="button" variant="outline" size="sm" onClick={() => onChange({ clientId: null, client: { name: q, phone: /^\+?\d[\d\s]*$/.test(q) ? q : "", email: "", address: "" } })}><UserPlus className="h-4 w-4" /> New customer</Button>
    </div>
  );
}

/** Items: search the stock and add lines; each line shows what is still available for the days. */
function ItemPicker({ items, avail, onAdd, takenIds }) {
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return items.filter((i) => !takenIds.has(i.id) && (!t || `${i.name} ${i.code} ${i.category}`.toLowerCase().includes(t))).slice(0, t ? 20 : 8);
  }, [q, items, takenIds]);
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-slate-400" />
        <input aria-label="Find an item" className={cn(inputClass, "pl-9")} placeholder="Find an item: chairs, plates, arch…" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        {list.map((i) => {
          const a = avail?.[i.id];
          return (
            <button key={i.id} type="button" onClick={() => { onAdd(i); setQ(""); }} className="flex items-center gap-2 rounded-lg border border-slate-200 p-2 text-left text-sm hover:border-slate-400" aria-label={`Add ${i.name}`}>
              {i.photoUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={i.photoUrl} alt="" className="h-9 w-9 rounded object-cover" />
              ) : <span className="flex h-9 w-9 items-center justify-center rounded bg-slate-100 text-[10px] text-slate-500">{i.code.split("-")[0]}</span>}
              <span className="min-w-0 flex-1">
                <span className="block truncate font-medium">{i.name}</span>
                <span className="block text-xs text-slate-500">{formatMoney(i.rentalPrice)} · {a ? <span className={a.available > 0 ? "text-emerald-700" : "text-rose-700"}>{a.available} free</span> : `${i.inStock} in store`}</span>
              </span>
              <Plus className="h-4 w-4 text-slate-400" />
            </button>
          );
        })}
      </div>
    </div>
  );
}

const fromOrder = (o) => ({
  clientId: o.client.id,
  client: null,
  eventType: o.eventType,
  eventDateKey: o.eventDateKey,
  dispatchDateKey: o.dispatchDateKey,
  returnDateKey: o.returnDateKey,
  eventLocation: o.eventLocation || "",
  guests: o.guests ?? "",
  lines: o.lines.map((l) => ({ key: newKey(), kind: l.kind, itemId: l.itemId, label: l.label, quantity: String(l.quantity), unitPrice: String(l.unitPrice), listPrice: l.listPrice })),
  discount: o.discount ? String(o.discount) : "",
  priceNote: o.priceNote || "",
  depositDue: o.depositDue ? String(o.depositDue) : "",
  paymentDueDateKey: o.paymentDueDateKey || "",
  handledById: o.handledBy?.id || "",
  staffNames: (o.staffNames || []).join(", "),
  specialInstructions: o.specialInstructions || "",
  notes: o.notes || "",
});

/**
 * The booking form (new or changed): customer, event and dates, items with their availability for
 * the booking's days (dispatch to return), services, prices and discount, deposit and deadline,
 * people. The total is computed as you type; items short for those days are shown in red and the
 * server refuses a confirmed booking it cannot serve.
 */
export function BookingForm({ departmentId, order = null, clients, items, heads, canChangePrices, todayKey, currentUserId, initialDateKey = "" }) {
  const router = useRouter();
  const record = useRecorder();
  const [f, setF] = useState(() =>
    order
      ? fromOrder(order)
      : { clientId: null, client: null, eventType: "", eventDateKey: initialDateKey, ...(initialDateKey ? defaultRange(initialDateKey) : { dispatchDateKey: "", returnDateKey: "" }), eventLocation: "", guests: "", lines: [], discount: "", priceNote: "", depositDue: "", paymentDueDateKey: "", handledById: currentUserId, staffNames: "", specialInstructions: "", notes: "" }
  );
  const [avail, setAvail] = useState(null);
  const [availError, setAvailError] = useState(null);
  const [busy, setBusy] = useState(null);
  const set = (patch) => setF((x) => ({ ...x, ...patch }));
  const datesTouched = useRef(Boolean(order));

  // Availability for the booking's days (online); the booking itself left out when it is changed.
  useEffect(() => {
    if (!f.dispatchDateKey || !f.returnDateKey || f.dispatchDateKey > f.returnDateKey) return;
    let live = true;
    const t = setTimeout(async () => {
      const res = await rentalAvailability({ departmentId, fromKey: f.dispatchDateKey, toKey: f.returnDateKey, excludeOrderId: order?.id || null }).catch(() => null);
      if (!live) return;
      if (res?.success) {
        setAvail(Object.fromEntries(res.data.map((r) => [r.id, r])));
        setAvailError(null);
      } else setAvailError("Availability could not be checked (offline?). The server checks it when the booking is sent.");
    }, 250);
    return () => {
      live = false;
      clearTimeout(t);
    };
  }, [departmentId, f.dispatchDateKey, f.returnDateKey, order?.id]);

  const setEventDate = (dateKey) => {
    const patch = { eventDateKey: dateKey };
    if (dateKey && (!datesTouched.current || !f.dispatchDateKey)) Object.assign(patch, defaultRange(dateKey));
    set(patch);
  };

  const byId = useMemo(() => Object.fromEntries(items.map((i) => [i.id, i])), [items]);
  const numeric = f.lines.map((l) => ({ ...l, quantity: Number(l.quantity) || 0, unitPrice: Number(l.unitPrice) || 0 }));
  const totals = orderTotals(numeric, Number(f.discount) || 0);
  const asked = requestedByItem(numeric);
  const priceChanged = numeric.some((l) => l.kind !== "SERVICE" && l.unitPrice !== byId[l.itemId]?.rentalPrice) || totals.discount > 0;
  const short = Object.entries(asked).filter(([id, q]) => avail?.[id] && q > avail[id].available);
  const takenIds = new Set(f.lines.filter((l) => l.kind !== "SERVICE").map((l) => l.itemId));

  const addItem = (i) => set({ lines: [...f.lines, { key: newKey(), kind: "ITEM", itemId: i.id, label: i.name, quantity: "", unitPrice: String(i.rentalPrice), listPrice: i.rentalPrice }] });
  const addService = () => set({ lines: [...f.lines, { key: newKey(), kind: "SERVICE", itemId: null, label: "", quantity: "1", unitPrice: "" }] });
  const setLine = (key, patch) => set({ lines: f.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const removeLine = (key) => set({ lines: f.lines.filter((l) => l.key !== key) });

  const valid =
    (f.clientId || f.client?.name?.trim()) &&
    f.eventType.trim() &&
    f.eventDateKey &&
    f.lines.length &&
    numeric.every((l) => l.quantity > 0 && (l.kind !== "SERVICE" || l.label.trim())) &&
    (!priceChanged || f.priceNote.trim());

  const submit = async (status) => {
    setBusy(status || "save");
    const input = {
      ...(f.clientId ? { clientId: f.clientId } : { client: { ...f.client, name: f.client.name.trim() } }),
      eventType: f.eventType.trim(),
      eventDateKey: f.eventDateKey,
      dispatchDateKey: f.dispatchDateKey || undefined,
      returnDateKey: f.returnDateKey || undefined,
      eventLocation: f.eventLocation,
      guests: f.guests,
      lines: numeric.map((l) => (l.kind === "SERVICE" ? { kind: "SERVICE", label: l.label.trim(), quantity: l.quantity, unitPrice: l.unitPrice } : { itemId: l.itemId, quantity: l.quantity, unitPrice: l.unitPrice })),
      discount: f.discount,
      priceNote: f.priceNote,
      depositDue: f.depositDue,
      paymentDueDateKey: f.paymentDueDateKey || null,
      handledById: f.handledById || null,
      staffNames: f.staffNames,
      specialInstructions: f.specialInstructions,
      notes: f.notes,
    };
    const name = f.clientId ? clients.find((c) => c.id === f.clientId)?.name : f.client?.name;
    const out = order
      ? await record(orderUpdateSpec(departmentId, order, input), { success: `${order.referenceNo} saved.` })
      : await record(orderCreateSpec(departmentId, { ...input, status }, `${f.eventType} · ${name} · ${f.eventDateKey}`), { success: (r) => `Booking ${r.referenceNo} saved (${formatMoney(r.agreedPrice)}).` });
    setBusy(null);
    if (!out) return;
    const id = order?.id || out.result?.orderId;
    router.push(id && out.status === "applied" ? `/d/${departmentId}/bookings/${id}` : `/d/${departmentId}/bookings`);
    router.refresh();
  };

  const dayLabel = (k) => (k ? formatDateKey(k, { weekday: false }) : "—");

  return (
    <div className="grid gap-5 lg:grid-cols-3">
      <div className="space-y-5 lg:col-span-2">
        <Section title="Customer">
          <CustomerPicker clients={clients} value={{ clientId: f.clientId, client: f.client }} onChange={(v) => set(v)} />
        </Section>

        <Section title="Event">
          <datalist id="rental-event-types">{RENTAL_EVENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
          <div className="grid gap-4 sm:grid-cols-3">
            <Field label="Type of event" required htmlFor="bk-type"><input id="bk-type" list="rental-event-types" className={inputClass} value={f.eventType} onChange={(e) => set({ eventType: e.target.value })} placeholder="Wedding, Birthday…" /></Field>
            <Field label="Event date" required htmlFor="bk-date"><input id="bk-date" type="date" className={inputClass} value={f.eventDateKey} onChange={(e) => setEventDate(e.target.value)} /></Field>
            <Field label="Guests" htmlFor="bk-guests"><input id="bk-guests" className={inputClass} inputMode="numeric" value={f.guests} onChange={(e) => set({ guests: wholeNumber(e.target.value) })} /></Field>
            <Field label="Location" htmlFor="bk-loc" className="sm:col-span-3"><input id="bk-loc" className={inputClass} value={f.eventLocation} onChange={(e) => set({ eventLocation: e.target.value })} placeholder="e.g. Hôtel Akwa Palace, Douala" /></Field>
            <Field label="Items leave on" htmlFor="bk-out" hint="Dispatch date"><input id="bk-out" type="date" className={inputClass} value={f.dispatchDateKey} max={f.eventDateKey || undefined} onChange={(e) => { datesTouched.current = true; set({ dispatchDateKey: e.target.value }); }} /></Field>
            <Field label="Items come back on" htmlFor="bk-back" hint="Return date"><input id="bk-back" type="date" className={inputClass} value={f.returnDateKey} min={f.eventDateKey || undefined} onChange={(e) => { datesTouched.current = true; set({ returnDateKey: e.target.value }); }} /></Field>
            <div className="flex items-end text-xs text-slate-500">Items are held for other customers from {dayLabel(f.dispatchDateKey)} to {dayLabel(f.returnDateKey)}.</div>
          </div>
        </Section>

        <Section title="Items and services" description={avail ? "“Free” is what remains for these days after the other confirmed bookings." : undefined} actions={<Button type="button" variant="outline" size="sm" onClick={addService}><Plus className="h-4 w-4" /> Add a service</Button>}>
          <div className="space-y-4">
            {availError ? <p className="text-xs text-amber-700">{availError}</p> : null}
            <ItemPicker items={items} avail={avail} onAdd={addItem} takenIds={takenIds} />
            {f.lines.length ? (
              <div className="overflow-x-auto">
                <table className="w-full text-sm" data-testid="booking-lines">
                  <thead><tr className="border-b text-left text-xs text-slate-500"><th className="py-2 pr-2">Item / service</th><th className="px-2 text-right">Free</th><th className="px-2">Quantity</th><th className="px-2">Price (FCFA)</th><th className="px-2 text-right">Total</th><th /></tr></thead>
                  <tbody>
                    {f.lines.map((l) => {
                      const a = l.kind !== "SERVICE" ? avail?.[l.itemId] : null;
                      const over = a && asked[l.itemId] > a.available;
                      const q = Number(l.quantity) || 0;
                      return (
                        <tr key={l.key} className="border-b border-slate-100 align-top">
                          <td className="py-2 pr-2">
                            {l.kind === "SERVICE" ? (
                              <input aria-label="Service" className={inputClass} value={l.label} onChange={(e) => setLine(l.key, { label: e.target.value })} placeholder="e.g. Decoration of the hall, Transport" />
                            ) : (
                              <div className="pt-2 font-medium">{l.label}</div>
                            )}
                            {over ? <div className="mt-1 flex items-center gap-1 text-xs font-medium text-rose-700"><AlertTriangle className="h-3.5 w-3.5" /> Only {Math.max(0, a.available)} available{a.busiestDay ? ` on ${dayLabel(a.busiestDay)}` : ""}</div> : null}
                          </td>
                          <td className="px-2 pt-4 text-right tabular-nums text-slate-500">{a ? Math.max(0, a.available) : l.kind === "SERVICE" ? "" : "…"}</td>
                          <td className="px-2 py-2"><input aria-label={`Quantity of ${l.label || "service"}`} className={cn(inputClass, "w-24", over && "border-rose-400")} inputMode="numeric" value={l.quantity} onChange={(e) => setLine(l.key, { quantity: wholeNumber(e.target.value) })} /></td>
                          <td className="px-2 py-2"><input aria-label={`Price of ${l.label || "service"}`} className={cn(inputClass, "w-28")} inputMode="numeric" value={l.unitPrice} disabled={l.kind !== "SERVICE" && !canChangePrices} onChange={(e) => setLine(l.key, { unitPrice: wholeNumber(e.target.value) })} /></td>
                          <td className="px-2 pt-4 text-right"><Money value={q * (Number(l.unitPrice) || 0)} suffix={false} /></td>
                          <td className="pl-2 pt-2"><Button type="button" variant="ghost" size="icon-sm" aria-label={`Remove ${l.label || "service"}`} onClick={() => removeLine(l.key)}><Trash2 className="h-4 w-4" /></Button></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : <p className="text-sm text-slate-500">No item yet: find items above, or add a service.</p>}
          </div>
        </Section>

        <Section title="People and instructions">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Person responsible" htmlFor="bk-resp">
              <select id="bk-resp" className={selectClass} value={f.handledById} onChange={(e) => set({ handledById: e.target.value })}>
                <option value="">—</option>
                {heads.map((h) => <option key={h.id} value={h.id}>{h.name}{h.title ? ` (${h.title})` : ""}</option>)}
              </select>
            </Field>
            <Field label="Staff assigned" htmlFor="bk-staff" hint="Names separated by commas."><input id="bk-staff" className={inputClass} value={f.staffNames} onChange={(e) => set({ staffNames: e.target.value })} /></Field>
            <Field label="Special instructions" htmlFor="bk-instr" className="sm:col-span-2"><textarea id="bk-instr" className={textareaClass} value={f.specialInstructions} onChange={(e) => set({ specialInstructions: e.target.value })} placeholder="Colours, set-up time, access…" /></Field>
            <Field label="Internal notes" htmlFor="bk-notes" className="sm:col-span-2"><input id="bk-notes" className={inputClass} value={f.notes} onChange={(e) => set({ notes: e.target.value })} /></Field>
          </div>
        </Section>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4 lg:self-start">
        <Section title="Price">
          <dl className="space-y-2 text-sm">
            <div className="flex justify-between"><dt className="text-slate-600">Items</dt><dd><Money value={totals.itemsTotal} /></dd></div>
            <div className="flex justify-between"><dt className="text-slate-600">Services</dt><dd><Money value={totals.servicesTotal} /></dd></div>
            {canChangePrices ? (
              <div className="flex items-center justify-between gap-2"><dt className="text-slate-600"><label htmlFor="bk-disc">Discount</label></dt><dd><input id="bk-disc" className={cn(inputClass, "h-8 w-28 text-right")} inputMode="numeric" value={f.discount} onChange={(e) => set({ discount: wholeNumber(e.target.value) })} /></dd></div>
            ) : null}
            <div className="flex justify-between border-t pt-2 text-base font-semibold" data-testid="booking-total"><dt>Total</dt><dd><Money value={totals.agreedPrice} /></dd></div>
          </dl>
          {priceChanged ? <Field label="Why the price differs" required htmlFor="bk-note" className="mt-3"><input id="bk-note" className={inputClass} value={f.priceNote} onChange={(e) => set({ priceNote: e.target.value })} placeholder="e.g. loyal customer" /></Field> : null}
          <div className="mt-3 grid grid-cols-2 gap-3">
            <Field label="Deposit asked" htmlFor="bk-dep"><input id="bk-dep" className={inputClass} inputMode="numeric" value={f.depositDue} onChange={(e) => set({ depositDue: wholeNumber(e.target.value) })} /></Field>
            <Field label="Pay in full by" htmlFor="bk-due"><input id="bk-due" type="date" className={inputClass} value={f.paymentDueDateKey} onChange={(e) => set({ paymentDueDateKey: e.target.value })} /></Field>
          </div>
        </Section>
        {short.length ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-900" role="alert">
            <div className="mb-1 flex items-center gap-1 font-semibold"><AlertTriangle className="h-4 w-4" /> Not enough for these days</div>
            <ul className="list-disc pl-5">{short.map(([id]) => <li key={id}>{byId[id]?.name}: {asked[id]} asked, {Math.max(0, avail[id].available)} available</li>)}</ul>
            <p className="mt-1 text-xs">You can still save it as an inquiry or a quotation; it cannot be confirmed.</p>
          </div>
        ) : avail && f.lines.some((l) => l.kind !== "SERVICE") ? <div className="flex items-center gap-1 text-sm text-emerald-700"><CheckCircle2 className="h-4 w-4" /> Every item is available for these days.</div> : null}
        <div className="flex flex-col gap-2">
          {order ? (
            <SubmitButton busy={busy === "save"} disabled={!valid || (["CONFIRMED", "PREPARING"].includes(order.status) && short.length > 0)} onClick={() => submit(null)}>Save the changes</SubmitButton>
          ) : (
            <>
              <SubmitButton busy={busy === "CONFIRMED"} disabled={!valid || short.length > 0} onClick={() => submit("CONFIRMED")}>Confirm the booking</SubmitButton>
              <SubmitButton variant="outline" busy={busy === "QUOTED"} disabled={!valid} onClick={() => submit("QUOTED")}>Save as a quotation</SubmitButton>
              <SubmitButton variant="ghost" busy={busy === "INQUIRY"} disabled={!valid} onClick={() => submit("INQUIRY")}>Save as an inquiry</SubmitButton>
            </>
          )}
        </div>
        <p className="text-xs text-slate-500">Today: {formatDateKey(todayKey)}</p>
      </div>
    </div>
  );
}
