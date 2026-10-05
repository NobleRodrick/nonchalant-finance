"use client";

import { useState } from "react";
import { Field, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { stayCreateSpec } from "@/lib/rooms/specs";
import { addDaysToKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { BOOKING_TYPE_LABELS, nightsOf, suggestedPrice } from "@/lib/rooms/stay-math";

/**
 * A new booking: apartment, arrival, departure, guest, how it is priced. The price is suggested
 * from the apartment's rates and stays editable (a different price needs a reason).
 */
export function StayDialog({ departmentId, rooms, todayKey, initial = {}, onClose }) {
  const record = useRecorder();
  const bookable = rooms.filter((r) => r.isActive !== false && (!r.state || r.state === "AVAILABLE"));
  const [f, setF] = useState({
    roomId: initial.roomId || bookable[0]?.id || "",
    checkInKey: initial.checkInKey || todayKey,
    checkOutKey: initial.checkOutKey || addDaysToKey(initial.checkInKey || todayKey, 1),
    guestName: "",
    guestPhone: "",
    guestEmail: "",
    guestCount: "",
    bookingType: "NIGHT",
    totalPrice: "",
    priceNote: "",
    status: "CONFIRMED",
    notes: "",
  });
  const [busy, setBusy] = useState(false);
  const room = rooms.find((r) => r.id === f.roomId);
  const nights = nightsOf(f.checkInKey, f.checkOutKey);
  const suggested = suggestedPrice(room, nights, f.bookingType);
  const price = f.totalPrice === "" ? suggested : Number(f.totalPrice);
  const differs = f.totalPrice !== "" && price !== suggested;
  const valid = f.roomId && nights > 0 && f.guestName.trim() && (!differs || f.priceNote.trim());
  const submit = async () => {
    setBusy(true);
    const input = { ...f, guestName: f.guestName.trim(), totalPrice: price, priceNote: differs ? f.priceNote.trim() : null, guestCount: f.guestCount || null };
    const out = await record(stayCreateSpec(departmentId, input, room?.name), { success: (r) => `Booking ${r.referenceNo} saved: ${r.roomName}, ${r.nights} night(s), ${formatMoney(r.totalPrice)}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title="New booking" footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Book {room?.name || "the apartment"}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Apartment" required htmlFor="st-room">
          <select id="st-room" className={selectClass} value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            {bookable.map((r) => <option key={r.id} value={r.id}>{r.name}{r.roomType ? ` · ${r.roomType}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Arrival" required htmlFor="st-in">
          <input id="st-in" type="date" className={inputClass} min={todayKey} value={f.checkInKey} onChange={(e) => setF({ ...f, checkInKey: e.target.value, checkOutKey: e.target.value >= f.checkOutKey ? addDaysToKey(e.target.value, 1) : f.checkOutKey })} />
        </Field>
        <Field label="Departure" required htmlFor="st-out" hint={nights > 0 ? `${nights} night(s)` : "After the arrival"}>
          <input id="st-out" type="date" className={inputClass} min={addDaysToKey(f.checkInKey, 1)} value={f.checkOutKey} onChange={(e) => setF({ ...f, checkOutKey: e.target.value })} />
        </Field>
      </div>
      <div className="grid gap-4 sm:grid-cols-4">
        <Field label="Guest" required htmlFor="st-guest" className="sm:col-span-2"><input id="st-guest" className={inputClass} value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} /></Field>
        <Field label="Phone" htmlFor="st-phone"><input id="st-phone" className={inputClass} value={f.guestPhone} onChange={(e) => setF({ ...f, guestPhone: e.target.value })} /></Field>
        <Field label="Guests" htmlFor="st-count"><input id="st-count" className={inputClass} inputMode="numeric" value={f.guestCount} onChange={(e) => setF({ ...f, guestCount: wholeNumber(e.target.value) })} /></Field>
        <Field label="E-mail" htmlFor="st-email" className="sm:col-span-2"><input id="st-email" type="email" className={inputClass} value={f.guestEmail} onChange={(e) => setF({ ...f, guestEmail: e.target.value })} /></Field>
        <Field label="Status" htmlFor="st-status" className="sm:col-span-2">
          <select id="st-status" className={selectClass} value={f.status} onChange={(e) => setF({ ...f, status: e.target.value })}>
            <option value="CONFIRMED">Confirmed</option>
            <option value="RESERVED">Reserved (not confirmed yet)</option>
          </select>
        </Field>
      </div>
      <div className="grid gap-4 rounded-lg bg-slate-50 p-3 sm:grid-cols-3">
        <Field label="Priced" htmlFor="st-type">
          <select id="st-type" className={selectClass} value={f.bookingType} onChange={(e) => setF({ ...f, bookingType: e.target.value })}>
            {Object.entries(BOOKING_TYPE_LABELS).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
          </select>
        </Field>
        <Field label="Price of the stay (FCFA)" htmlFor="st-price" hint={`Usual price: ${formatMoney(suggested)}`}>
          <input id="st-price" className={inputClass} inputMode="numeric" placeholder={String(suggested)} value={f.totalPrice} onChange={(e) => setF({ ...f, totalPrice: wholeNumber(e.target.value) })} />
        </Field>
        <Field label="Why this price" required={differs} htmlFor="st-note">
          <input id="st-note" className={inputClass} disabled={!differs} value={f.priceNote} onChange={(e) => setF({ ...f, priceNote: e.target.value })} placeholder={differs ? "e.g. long stay discount" : "Usual price"} />
        </Field>
      </div>
      <Field label="Notes" htmlFor="st-notes"><textarea id="st-notes" className={textareaClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
    </FormDialog>
  );
}
