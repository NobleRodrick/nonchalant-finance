"use client";

import { useState } from "react";
import { CalendarClock, CalendarX2, CheckCheck, CheckCircle2, Hourglass, Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, inputClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { allowedTransitions } from "@/lib/venue/booking-math";
import { priceForDate } from "@/lib/venue/pricing";
import { bookingHoldSpec, bookingMoveSpec, bookingStatusSpec, bookingUpdateSpec } from "@/lib/venue/specs";
import { EVENT_TYPES } from "@/lib/venue/constants";
import { formatMoney } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";

function useSubmit(close) {
  const record = useRecorder();
  const [busy, setBusy] = useState(false);
  const run = async (spec, success) => {
    setBusy(true);
    const out = await record(spec, { success });
    setBusy(false);
    if (out) close();
  };
  return { busy, run };
}

function MoveDialog({ booking, departmentId, hall, takenDates, todayKey, onClose }) {
  const [dateKey, setDateKey] = useState("");
  const [reason, setReason] = useState("");
  const [price, setPrice] = useState("");
  const { busy, run } = useSubmit(onClose);
  const taken = dateKey && takenDates.includes(dateKey) && dateKey !== booking.eventDateKey;
  const newPrice = dateKey ? priceForDate(dateKey, { basePrice: hall.basePrice, rules: hall.rules }).price + (booking.packagePrice || 0) : null;
  const valid = dateKey && dateKey >= todayKey && dateKey !== booking.eventDateKey && !taken && reason.trim();
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Move ${booking.referenceNo}`}
      description={`Now on ${formatDateKey(booking.eventDateKey)}. The agreed price (${formatMoney(booking.agreedPrice)}) stays unless you change it.`}
      footer={<SubmitButton busy={busy} disabled={!valid} onClick={() => run(bookingMoveSpec({ departmentId, booking, eventDateKey: dateKey, reason: reason.trim(), agreedPrice: price }), `Moved to ${formatDateKey(dateKey)}.`)}>Move the booking</SubmitButton>}
    >
      <Field label="New date" required htmlFor="mv-date" error={taken ? "This date is already booked." : null} hint={newPrice !== null ? `Price of that date (with the package): ${formatMoney(newPrice)}` : null}>
        <input id="mv-date" type="date" min={todayKey} className={inputClass} value={dateKey} onChange={(e) => setDateKey(e.target.value)} />
      </Field>
      <Field label="New agreed price (optional, FCFA)" htmlFor="mv-price">
        <input id="mv-price" className={inputClass} inputMode="numeric" value={price} onChange={(e) => setPrice(wholeNumber(e.target.value))} placeholder={String(booking.agreedPrice)} />
      </Field>
      <Field label="Why does the event move?" required htmlFor="mv-reason">
        <input id="mv-reason" className={inputClass} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. the client asked" />
      </Field>
    </FormDialog>
  );
}

function CancelDialog({ booking, departmentId, onClose }) {
  const [reason, setReason] = useState("");
  const { busy, run } = useSubmit(onClose);
  const paid = booking.figures?.paid || 0;
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title={`Cancel ${booking.referenceNo}`}
      description={`${formatDateKey(booking.eventDateKey)} becomes free again.${paid > 0 ? ` ${formatMoney(paid)} was received: record a refund for what you give back; what is kept stays as the cancellation's income.` : ""}`}
      footer={<SubmitButton variant="destructive" busy={busy} disabled={!reason.trim()} onClick={() => run(bookingStatusSpec({ departmentId, booking, action: "cancel", reason: reason.trim() }), "Booking cancelled: the date is free.")}>Cancel the booking</SubmitButton>}
    >
      <Field label="Why is it cancelled?" required htmlFor="cx-reason">
        <textarea id="cx-reason" className={textareaClass} value={reason} onChange={(e) => setReason(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

function HoldDialog({ booking, departmentId, todayKey, onClose }) {
  const [until, setUntil] = useState("");
  const { busy, run } = useSubmit(onClose);
  const valid = until && until >= todayKey && until <= booking.eventDateKey;
  return (
    <FormDialog
      open
      onOpenChange={(v) => !v && onClose()}
      title="Hold the reservation longer"
      description={booking.holdUntilKey ? `Held until ${formatDateKey(booking.holdUntilKey)}.` : undefined}
      footer={<SubmitButton busy={busy} disabled={!valid} onClick={() => run(bookingHoldSpec({ departmentId, booking, holdUntilKey: until }), `Held until ${formatDateKey(until)}.`)}>Hold until this date</SubmitButton>}
    >
      <Field label="Hold until" required htmlFor="hold-until" hint="Not after the event's date.">
        <input id="hold-until" type="date" min={todayKey} max={booking.eventDateKey} className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
      </Field>
    </FormDialog>
  );
}

function EditDialog({ booking, departmentId, heads, onClose }) {
  const [f, setF] = useState({
    eventType: booking.eventType || "",
    guests: booking.guests ?? "",
    startTime: booking.startTime || "",
    endTime: booking.endTime || "",
    agreedPrice: booking.agreedPrice,
    priceNote: booking.priceNote || "",
    handledById: booking.handledBy?.id || "",
    notes: booking.notes || "",
  });
  const { busy, run } = useSubmit(onClose);
  const set = (k, numeric = false) => (e) => setF({ ...f, [k]: numeric ? wholeNumber(e.target.value) : e.target.value });
  const suggested = (booking.hallPrice || 0) + (booking.packagePrice || 0);
  const lower = Number(f.agreedPrice) < suggested;
  const valid = f.eventType.trim() && f.agreedPrice !== "" && (!lower || f.priceNote.trim());
  const save = () => {
    const patch = {};
    for (const k of Object.keys(f)) {
      const before = k === "handledById" ? booking.handledBy?.id || "" : booking[k] ?? "";
      if (String(f[k]) !== String(before)) patch[k] = f[k];
    }
    if (patch.agreedPrice !== undefined) patch.priceNote = f.priceNote;
    if (!Object.keys(patch).length) return onClose();
    return run(bookingUpdateSpec({ departmentId, booking, patch }), "Booking updated.");
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} wide title={`Change ${booking.referenceNo}`} footer={<SubmitButton busy={busy} disabled={!valid} onClick={save}>Save</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Type of event" required htmlFor="ed-type">
          <input id="ed-type" list="ed-types" className={inputClass} value={f.eventType} onChange={set("eventType")} />
          <datalist id="ed-types">{EVENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Guests" htmlFor="ed-guests">
          <input id="ed-guests" className={inputClass} inputMode="numeric" value={f.guests} onChange={set("guests", true)} />
        </Field>
        <Field label="Start" htmlFor="ed-start"><input id="ed-start" type="time" className={inputClass} value={f.startTime} onChange={set("startTime")} /></Field>
        <Field label="End" htmlFor="ed-end"><input id="ed-end" type="time" className={inputClass} value={f.endTime} onChange={set("endTime")} /></Field>
        <Field label="Agreed price (FCFA)" required htmlFor="ed-price" hint={`Price of the date with the package: ${formatMoney(suggested)}`}>
          <input id="ed-price" className={inputClass} inputMode="numeric" value={f.agreedPrice} onChange={set("agreedPrice", true)} />
        </Field>
        <Field label={lower ? "Why is the price lower?" : "Price note"} required={lower} htmlFor="ed-note">
          <input id="ed-note" className={inputClass} value={f.priceNote} onChange={set("priceNote")} />
        </Field>
        {heads.length > 1 ? (
          <Field label="Handled by" htmlFor="ed-handler">
            <select id="ed-handler" className={inputClass} value={f.handledById} onChange={set("handledById")}>
              {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </Field>
        ) : null}
      </div>
      <Field label="Notes" htmlFor="ed-notes"><textarea id="ed-notes" className={textareaClass} value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}

/** What can be done with a booking now: confirm, complete, move, hold longer, change, cancel. */
export function BookingActions({ booking, departmentId, hall, heads, takenDates, todayKey }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const [busy, setBusy] = useState(null);
  const t = allowedTransitions(booking, todayKey);
  const close = () => setDialog(null);
  const quick = async (action, success) => {
    setBusy(action);
    await record(bookingStatusSpec({ departmentId, booking, action }), { success });
    setBusy(null);
  };
  if (!Object.values(t).some(Boolean)) return null;
  return (
    <>
      <div className="flex flex-wrap gap-2" data-testid="booking-actions">
        {t.confirm ? <Button disabled={busy === "confirm"} onClick={() => quick("confirm", "Booking confirmed.")}><CheckCircle2 className="h-4 w-4" /> Confirm</Button> : null}
        {t.complete ? <Button variant={t.confirm ? "outline" : "default"} disabled={busy === "complete"} onClick={() => quick("complete", "Event marked as completed.")}><CheckCheck className="h-4 w-4" /> Event completed</Button> : null}
        {t.edit ? <Button variant="outline" onClick={() => setDialog("edit")}><Pencil className="h-4 w-4" /> Change</Button> : null}
        {t.move ? <Button variant="outline" onClick={() => setDialog("move")}><CalendarClock className="h-4 w-4" /> Move date</Button> : null}
        {t.extendHold ? <Button variant="outline" onClick={() => setDialog("hold")}><Hourglass className="h-4 w-4" /> Hold longer</Button> : null}
        {t.cancel ? <Button variant="outline" className="text-rose-700" onClick={() => setDialog("cancel")}><CalendarX2 className="h-4 w-4" /> Cancel</Button> : null}
      </div>
      {dialog === "move" ? <MoveDialog booking={booking} departmentId={departmentId} hall={hall} takenDates={takenDates} todayKey={todayKey} onClose={close} /> : null}
      {dialog === "cancel" ? <CancelDialog booking={booking} departmentId={departmentId} onClose={close} /> : null}
      {dialog === "hold" ? <HoldDialog booking={booking} departmentId={departmentId} todayKey={todayKey} onClose={close} /> : null}
      {dialog === "edit" ? <EditDialog booking={booking} departmentId={departmentId} heads={heads} onClose={close} /> : null}
    </>
  );
}
