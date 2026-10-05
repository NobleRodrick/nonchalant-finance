"use client";

import { useEffect, useMemo, useState } from "react";
import { Search, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, Field, Money, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { isOnline } from "@/lib/offline/connectivity";
import { findVenueClients } from "@/actions/venue";
import { priceForDate } from "@/lib/venue/pricing";
import { bookingCreateSpec } from "@/lib/venue/specs";
import { EVENT_TYPES } from "@/lib/venue/constants";
import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";

/** Finds an existing client by name or phone, or takes a new one's details. */
function ClientPicker({ departmentId, value, onChange }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState([]);
  const [mode, setMode] = useState(value?.id ? "existing" : "search");

  useEffect(() => {
    if (mode !== "search" || q.trim().length < 2 || !isOnline()) return undefined;
    const t = setTimeout(async () => {
      const res = await findVenueClients({ departmentId, q }).catch(() => null);
      if (res?.success) setFound(res.data);
    }, 250);
    return () => clearTimeout(t);
  }, [q, mode, departmentId]);

  if (value?.id) {
    return (
      <div className="flex items-center justify-between rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-sm" data-testid="chosen-client">
        <span>
          <span className="font-medium">{value.name}</span>
          {value.phone ? <span className="text-slate-500"> · {value.phone}</span> : null}
        </span>
        <Button size="icon-sm" variant="ghost" aria-label="Choose another client" onClick={() => { onChange(null); setMode("search"); }}><X className="h-4 w-4" /></Button>
      </div>
    );
  }
  if (mode === "new") {
    const set = (k) => (e) => onChange({ ...(value || {}), [k]: e.target.value });
    return (
      <div className="grid gap-3 rounded-md border border-slate-200 p-3 sm:grid-cols-2">
        <Field label="Client's name" required htmlFor="bk-client-name">
          <input id="bk-client-name" className={inputClass} value={value?.name || ""} onChange={set("name")} />
        </Field>
        <Field label="Phone" htmlFor="bk-client-phone">
          <input id="bk-client-phone" className={inputClass} inputMode="tel" value={value?.phone || ""} onChange={set("phone")} />
        </Field>
        <Field label="Other phone" htmlFor="bk-client-phone2">
          <input id="bk-client-phone2" className={inputClass} inputMode="tel" value={value?.phoneAlt || ""} onChange={set("phoneAlt")} />
        </Field>
        <Field label="E-mail" htmlFor="bk-client-email">
          <input id="bk-client-email" className={inputClass} type="email" value={value?.email || ""} onChange={set("email")} />
        </Field>
        <Field label="Company / family (optional)" htmlFor="bk-client-company" className="sm:col-span-2">
          <input id="bk-client-company" className={inputClass} value={value?.company || ""} onChange={set("company")} />
        </Field>
        <button type="button" className="text-left text-xs font-medium text-slate-600 underline sm:col-span-2" onClick={() => { onChange(null); setMode("search"); }}>
          Search an existing client instead
        </button>
      </div>
    );
  }
  return (
    <div className="space-y-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" aria-hidden="true" />
        <input aria-label="Search a client by name or phone" className={`${inputClass} pl-9`} placeholder="Search a client by name or phone" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>
      {found.length && q.trim().length >= 2 ? (
        <ul className="max-h-40 divide-y divide-slate-100 overflow-y-auto rounded-md border border-slate-200 text-sm">
          {found.map((c) => (
            <li key={c.id}>
              <button type="button" className="w-full px-3 py-2 text-left hover:bg-slate-50" onClick={() => onChange(c)}>
                <span className="font-medium">{c.name}</span>
                {c.phone ? <span className="text-slate-500"> · {c.phone}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      <Button type="button" variant="outline" size="sm" onClick={() => { setMode("new"); onChange({ name: q.trim() }); }}>
        <UserPlus className="h-4 w-4" /> New client{q.trim() ? `: ${q.trim()}` : ""}
      </Button>
    </div>
  );
}

const EMPTY = { eventType: "", guests: "", startTime: "", endTime: "", packageId: "", agreedPrice: "", priceNote: "", status: "RESERVED", handledById: "", notes: "" };

/**
 * A new booking of a date: client, event, package, price (the date's price + the package,
 * changeable; a lower price needs a reason), Reserved or Confirmed. Works offline: the booking is
 * kept on this computer and sent when the connection is back (the server still refuses a date
 * already booked).
 */
export function BookingDialog({ open, onOpenChange, departmentId, hall, packages = [], heads = [], takenDates = [], initialDate = "", currentUserId, lead = null, todayKey, onBooked }) {
  const record = useRecorder();
  const [dateKey, setDateKey] = useState(initialDate || lead?.proposedDateKey || "");
  const [client, setClient] = useState(lead ? { name: lead.clientName, phone: lead.phone || "", email: lead.email || "" } : null);
  const [f, setF] = useState(() => ({
    ...EMPTY,
    eventType: lead?.eventType || "",
    guests: lead?.guests ?? "",
    packageId: lead?.packageId || "",
    agreedPrice: lead?.priceDiscussed ?? "",
    handledById: heads.some((h) => h.id === currentUserId) ? currentUserId : heads[0]?.id || "",
  }));
  const [busy, setBusy] = useState(false);
  const set = (k, numeric = false) => (e) => setF({ ...f, [k]: numeric ? wholeNumber(e.target.value) : e.target.value });

  const pkg = packages.find((p) => p.id === f.packageId) || null;
  const datePrice = useMemo(() => (dateKey ? priceForDate(dateKey, { basePrice: hall.basePrice, rules: hall.rules }) : null), [dateKey, hall]);
  const suggested = (datePrice?.price || 0) + (pkg?.price || 0);
  const agreed = f.agreedPrice === "" ? suggested : Number(f.agreedPrice);
  const lower = agreed < suggested;
  const taken = dateKey && takenDates.includes(dateKey);
  const past = dateKey && dateKey < todayKey;
  const clientOk = client?.id || (client?.name || "").trim().length >= 2;
  const valid = dateKey && !taken && !past && f.eventType.trim() && clientOk && (!lower || f.priceNote.trim());

  const submit = async () => {
    setBusy(true);
    const spec = bookingCreateSpec({
      departmentId,
      venueId: hall.id,
      eventDateKey: dateKey,
      eventType: f.eventType.trim(),
      guests: f.guests,
      startTime: f.startTime,
      endTime: f.endTime,
      client: client?.id ? client : { ...client, name: client.name.trim() },
      packageId: f.packageId,
      packageName: pkg?.name,
      agreedPrice: f.agreedPrice === "" ? suggested : Number(f.agreedPrice),
      suggestedPrice: suggested,
      priceNote: f.priceNote.trim(),
      status: f.status,
      handledById: f.handledById,
      notes: f.notes.trim(),
      leadId: lead?.id,
    });
    const out = await record(spec, { success: (r) => `Booking ${r.referenceNo} saved: ${formatDateKey(dateKey)}.` });
    setBusy(false);
    if (out) {
      onOpenChange(false);
      onBooked?.(out);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      wide
      title={lead ? `Book for ${lead.clientName}` : "New booking"}
      description={`${hall.name}: one event per date.`}
      footer={
        <>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <SubmitButton busy={busy} disabled={!valid} onClick={submit}>{f.status === "CONFIRMED" ? "Book and confirm" : "Reserve the date"}</SubmitButton>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Date of the event" required htmlFor="bk-date" error={taken ? "This date is already booked." : past ? "This date has passed." : null}>
          <input id="bk-date" type="date" className={inputClass} min={todayKey} value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
        </Field>
        <Field label="Start" htmlFor="bk-start">
          <input id="bk-start" type="time" className={inputClass} value={f.startTime} onChange={set("startTime")} />
        </Field>
        <Field label="End" htmlFor="bk-end">
          <input id="bk-end" type="time" className={inputClass} value={f.endTime} onChange={set("endTime")} />
        </Field>
      </div>
      <Field label="Client" required>
        <ClientPicker departmentId={departmentId} value={client} onChange={setClient} />
      </Field>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Type of event" required htmlFor="bk-type" className="sm:col-span-2">
          <input id="bk-type" className={inputClass} list="bk-event-types" value={f.eventType} onChange={set("eventType")} placeholder="Wedding, birthday, conference …" />
          <datalist id="bk-event-types">
            {EVENT_TYPES.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </Field>
        <Field label="Guests expected" htmlFor="bk-guests" error={hall.capacity && Number(f.guests) > hall.capacity ? `More than the hall's capacity (${hall.capacity}).` : null}>
          <input id="bk-guests" className={inputClass} inputMode="numeric" value={f.guests} onChange={set("guests", true)} />
        </Field>
      </div>
      {packages.length ? (
        <Field label="Package" htmlFor="bk-package" hint={pkg ? `Includes: ${pkg.items.map((i) => i.label).join(", ") || "—"}` : "The hall only, or a package with extra benefits."}>
          <select id="bk-package" className={selectClass} value={f.packageId} onChange={set("packageId")}>
            <option value="">Hall only</option>
            {packages.map((p) => (
              <option key={p.id} value={p.id}>{p.name} (+{formatMoney(p.price)})</option>
            ))}
          </select>
        </Field>
      ) : null}
      <div className="grid gap-4 rounded-lg border border-slate-200 bg-slate-50/60 p-3 sm:grid-cols-2" data-testid="booking-price">
        <div className="space-y-1 text-sm">
          <div className="flex justify-between"><span className="text-slate-600">Price of the date{datePrice ? ` (${datePrice.label})` : ""}</span><Money value={datePrice?.price || 0} /></div>
          {pkg ? <div className="flex justify-between"><span className="text-slate-600">Package {pkg.name}</span><Money value={pkg.price} /></div> : null}
          <div className="flex justify-between border-t border-slate-200 pt-1 font-semibold"><span>Suggested price</span><Money value={suggested} /></div>
        </div>
        <div className="space-y-3">
          <Field label="Agreed price (FCFA)" htmlFor="bk-agreed" hint="Leave empty to use the suggested price.">
            <input id="bk-agreed" className={inputClass} inputMode="numeric" placeholder={String(suggested)} value={f.agreedPrice} onChange={set("agreedPrice", true)} />
          </Field>
          {lower ? (
            <Field label="Why is the price lower?" required htmlFor="bk-price-note">
              <input id="bk-price-note" className={inputClass} value={f.priceNote} onChange={set("priceNote")} placeholder="e.g. negotiated discount, loyal client" />
            </Field>
          ) : null}
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Status" htmlFor="bk-status" hint={f.status === "RESERVED" ? `The date is held ${hall.reservationHoldDays} days without a deposit.` : "The client has confirmed."}>
          <select id="bk-status" className={selectClass} value={f.status} onChange={set("status")}>
            <option value="RESERVED">Reserved</option>
            <option value="CONFIRMED">Confirmed</option>
          </select>
        </Field>
        {heads.length > 1 ? (
          <Field label="Handled by" htmlFor="bk-handler">
            <select id="bk-handler" className={selectClass} value={f.handledById} onChange={set("handledById")}>
              {heads.map((h) => (
                <option key={h.id} value={h.id}>{h.name}</option>
              ))}
            </select>
          </Field>
        ) : null}
      </div>
      <Field label="Notes" htmlFor="bk-notes">
        <textarea id="bk-notes" className={textareaClass} value={f.notes} onChange={set("notes")} placeholder="Decoration, catering, special requests …" />
      </Field>
      {!isOnline() ? <Banner tone="warn">No connection: the booking is kept on this computer and sent as soon as the connection is back. The server still refuses a date already booked.</Banner> : null}
    </FormDialog>
  );
}
