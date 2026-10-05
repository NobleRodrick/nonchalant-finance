"use client";

import Link from "next/link";
import { useState } from "react";
import { BedDouble, Pencil, Plus, Settings2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Money, StatusBadge, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useRecorder } from "@/lib/offline/react";
import { roomSpec, roomStateSpec } from "@/lib/rooms/specs";
import { ROOM_STATE_LABELS } from "@/lib/rooms/stay-math";
import { formatDateKey } from "@/lib/timezone";
import { cn } from "@/lib/utils";
import { STATE_TONE } from "./state-tone";


function RoomDialog({ departmentId, room, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ name: room?.name || "", roomType: room?.roomType || "", capacity: room?.capacity ?? "", nightlyRate: room?.nightlyRate ?? "", weeklyRate: room?.weeklyRate ?? "", monthlyRate: room?.monthlyRate ?? "", description: room?.description || "", notes: room?.notes || "", isActive: room ? room.isActive : true });
  const [busy, setBusy] = useState(false);
  const submit = async () => {
    setBusy(true);
    const out = await record(roomSpec(departmentId, { id: room?.id, ...f, name: f.name.trim() }), { success: room ? "Apartment updated." : "Apartment added." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog wide open onOpenChange={(v) => !v && onClose()} title={room ? `Apartment ${room.name}` : "New apartment"} footer={<SubmitButton busy={busy} disabled={!f.name.trim()} onClick={submit}>{room ? "Save" : "Add the apartment"}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name or number" required htmlFor="rm-name"><input id="rm-name" className={inputClass} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="e.g. Apartment 1" /></Field>
        <Field label="Type" htmlFor="rm-type"><input id="rm-type" className={inputClass} value={f.roomType} onChange={(e) => setF({ ...f, roomType: e.target.value })} placeholder="e.g. 2 bedrooms, studio" /></Field>
        <Field label="Guests" htmlFor="rm-capacity"><input id="rm-capacity" className={inputClass} inputMode="numeric" value={f.capacity} onChange={(e) => setF({ ...f, capacity: wholeNumber(e.target.value) })} /></Field>
        <Field label="Rate of a night (FCFA)" htmlFor="rm-rate"><input id="rm-rate" className={inputClass} inputMode="numeric" value={f.nightlyRate} onChange={(e) => setF({ ...f, nightlyRate: wholeNumber(e.target.value) })} /></Field>
        <Field label="Rate of a week (optional)" htmlFor="rm-week"><input id="rm-week" className={inputClass} inputMode="numeric" value={f.weeklyRate} onChange={(e) => setF({ ...f, weeklyRate: wholeNumber(e.target.value) })} /></Field>
        <Field label="Rate of a month (optional)" htmlFor="rm-month"><input id="rm-month" className={inputClass} inputMode="numeric" value={f.monthlyRate} onChange={(e) => setF({ ...f, monthlyRate: wholeNumber(e.target.value) })} /></Field>
      </div>
      <Field label="Description" htmlFor="rm-desc"><textarea id="rm-desc" className={textareaClass} value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} placeholder="Rooms, equipment, view…" /></Field>
      <Field label="Notes" htmlFor="rm-notes"><input id="rm-notes" className={inputClass} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field>
      {room ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f.isActive} onChange={(e) => setF({ ...f, isActive: e.target.checked })} /> In use (shown and can be booked)</label> : null}
    </FormDialog>
  );
}

function StateDialog({ departmentId, room, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({ state: room.state, note: room.stateNote || "" });
  const [busy, setBusy] = useState(false);
  const valid = f.state === "AVAILABLE" || f.note.trim();
  const submit = async () => {
    setBusy(true);
    const out = await record(roomStateSpec(departmentId, room, f.state, f.note.trim()), { success: `${room.name}: ${ROOM_STATE_LABELS[f.state].toLowerCase()}.` });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={`State of ${room.name}`} description="Reserved and occupied follow the bookings; set here whether the apartment can be let." footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Save</SubmitButton>}>
      <Field label="The apartment is" htmlFor="rs-state">
        <select id="rs-state" className={selectClass} value={f.state} onChange={(e) => setF({ ...f, state: e.target.value })}>
          <option value="AVAILABLE">Available to let</option>
          <option value="MAINTENANCE">Under maintenance</option>
          <option value="UNAVAILABLE">Unavailable</option>
        </select>
      </Field>
      {f.state !== "AVAILABLE" ? <Field label="Why" required htmlFor="rs-note"><input id="rs-note" className={inputClass} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} placeholder="e.g. painting, water leak" /></Field> : null}
    </FormDialog>
  );
}

/**
 * The apartments as cards: state (available, reserved, occupied, under maintenance,
 * unavailable), who is in it, the next booking, rates; profile, edit and state for the head.
 */
export function RoomsBoard({ departmentId, rooms, canManage }) {
  const [editing, setEditing] = useState(null);
  const [stateOf, setStateOf] = useState(null);
  const base = `/d/${departmentId}`;
  return (
    <div className="space-y-4">
      {canManage ? <Button onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> Add an apartment</Button> : null}
      {!rooms.length ? <p className="text-sm text-slate-500">No apartment yet.</p> : null}
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="apartments">
        {rooms.map((r) => (
          <div key={r.id} className={cn("rounded-xl border bg-white p-4 shadow-xs", !r.isActive && "opacity-60")} data-testid={`apartment-${r.name}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <Link href={`${base}/rooms/${r.id}`} className="inline-flex items-center gap-2 text-base font-semibold text-slate-900 hover:underline"><BedDouble className="h-4 w-4 text-violet-600" />{r.name}</Link>
                <div className="text-xs text-slate-500">{[r.roomType, r.capacity ? `${r.capacity} guests` : null].filter(Boolean).join(" · ") || "—"}</div>
              </div>
              <span className={cn("rounded-full border px-2 py-0.5 text-xs font-semibold", STATE_TONE[r.displayState])}>{ROOM_STATE_LABELS[r.displayState]}</span>
            </div>
            <div className="mt-3 space-y-1 text-sm text-slate-700">
              {r.current ? <div>In it: <Link className="font-medium underline" href={`${base}/stays/${r.current.id}`}>{r.current.guestName}</Link> until {formatDateKey(r.current.checkOutKey, { weekday: false })}</div> : null}
              {r.next ? <div>Next: <Link className="underline" href={`${base}/stays/${r.next.id}`}>{r.next.guestName}</Link> from {formatDateKey(r.next.checkInKey, { weekday: false })}</div> : null}
              {r.stateNote && r.state !== "AVAILABLE" ? <div className="text-orange-800">{r.stateNote}</div> : null}
              <div className="flex flex-wrap gap-x-3 text-xs text-slate-500">
                <span>Night <Money value={r.nightlyRate} /></span>
                {r.weeklyRate ? <span>Week <Money value={r.weeklyRate} /></span> : null}
                {r.monthlyRate ? <span>Month <Money value={r.monthlyRate} /></span> : null}
              </div>
              {!r.isActive ? <StatusBadge status="INACTIVE" label="Not in use" /> : null}
            </div>
            {canManage ? (
              <div className="mt-3 flex gap-2 print:hidden">
                <Button size="sm" variant="outline" onClick={() => setEditing(r)} aria-label={`Change apartment ${r.name}`}><Pencil className="h-3.5 w-3.5" /> Profile & rates</Button>
                <Button size="sm" variant="outline" onClick={() => setStateOf(r)} aria-label={`State of ${r.name}`}><Settings2 className="h-3.5 w-3.5" /> State</Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
      {editing ? <RoomDialog key={editing === "new" ? "new" : editing.id} departmentId={departmentId} room={editing === "new" ? null : editing} onClose={() => setEditing(null)} /> : null}
      {stateOf ? <StateDialog departmentId={departmentId} room={stateOf} onClose={() => setStateOf(null)} /> : null}
    </div>
  );
}
