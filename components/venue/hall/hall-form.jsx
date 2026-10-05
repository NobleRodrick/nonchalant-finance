"use client";

import { useState } from "react";
import { Field, inputClass, textareaClass } from "@/components/kit/primitives";
import { runWithToast, wholeNumber } from "@/components/kit/client";
import { SubmitButton } from "@/components/kit/form-dialog";
import { saveHall } from "@/actions/venue";

const fromHall = (h) => ({
  name: h?.name || "",
  capacity: h?.capacity ?? "",
  basePrice: h?.basePrice ?? "",
  reservationHoldDays: h?.reservationHoldDays ?? 7,
  description: h?.description || "",
});

/** The hall's details: name, capacity, base price, how long a reservation is held. */
export function HallForm({ departmentId, hall, canEdit }) {
  const [f, setF] = useState(() => fromHall(hall));
  const [busy, setBusy] = useState(false);
  const set = (k, numeric = false) => (e) => setF({ ...f, [k]: numeric ? wholeNumber(e.target.value) : e.target.value });
  const valid = f.name.trim().length >= 2 && f.basePrice !== "" && Number(f.reservationHoldDays) >= 1;
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    await runWithToast(saveHall({ departmentId, ...f, name: f.name.trim() }), { success: hall ? "Hall updated." : "Hall set up. Add its prices below." });
    setBusy(false);
  };
  return (
    <form onSubmit={submit} className="grid gap-4 sm:grid-cols-2" aria-label="Hall details">
      <Field label="Name of the hall" required htmlFor="hall-name">
        <input id="hall-name" className={inputClass} value={f.name} onChange={set("name")} disabled={!canEdit} placeholder="e.g. Salle Majestueuse" />
      </Field>
      <Field label="Capacity (guests)" htmlFor="hall-capacity">
        <input id="hall-capacity" className={inputClass} inputMode="numeric" value={f.capacity} onChange={set("capacity", true)} disabled={!canEdit} />
      </Field>
      <Field label="Base price of a date (FCFA)" required htmlFor="hall-price" hint="Used when no day, season or special-date price applies.">
        <input id="hall-price" className={inputClass} inputMode="numeric" value={f.basePrice} onChange={set("basePrice", true)} disabled={!canEdit} />
      </Field>
      <Field label="Reservation held for (days)" required htmlFor="hall-hold" hint="A reservation without a deposit holds the date this long; then you are alerted.">
        <input id="hall-hold" className={inputClass} inputMode="numeric" value={f.reservationHoldDays} onChange={set("reservationHoldDays", true)} disabled={!canEdit} />
      </Field>
      <Field label="Description" htmlFor="hall-description" className="sm:col-span-2">
        <textarea id="hall-description" className={textareaClass} value={f.description} onChange={set("description")} disabled={!canEdit} />
      </Field>
      {canEdit ? (
        <div className="sm:col-span-2">
          <SubmitButton type="submit" busy={busy} disabled={!valid}>{hall ? "Save the hall" : "Set up the hall"}</SubmitButton>
        </div>
      ) : null}
    </form>
  );
}
