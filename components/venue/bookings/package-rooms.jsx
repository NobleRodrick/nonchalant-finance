"use client";

import { useState } from "react";
import { BedDouble, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, DataTable, Field, Section, StatusBadge, inputClass, selectClass } from "@/components/kit/primitives";
import { runWithToast } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { allocatePackageRoom, releasePackageRoom } from "@/actions/venue";
import { addDaysToKey, formatDateKey } from "@/lib/timezone";
import { STAY_STATUS_LABELS } from "@/lib/rooms/stay-math";

function AllocateDialog({ departmentId, booking, departments, nights, onClose }) {
  const [f, setF] = useState({ roomsDepartmentId: departments[0]?.id || "", roomId: "", checkInKey: booking.eventDateKey, nights: String(nights), guestName: booking.client?.name || "" });
  const [busy, setBusy] = useState(false);
  const rooms = departments.find((d) => d.id === f.roomsDepartmentId)?.rooms || [];
  const valid = f.roomsDepartmentId && f.roomId && f.checkInKey && Number(f.nights) >= 1 && f.guestName.trim();
  const submit = async () => {
    setBusy(true);
    const ok = await runWithToast(
      allocatePackageRoom({ departmentId, bookingId: booking.id, roomsDepartmentId: f.roomsDepartmentId, roomId: f.roomId, checkInKey: f.checkInKey, checkOutKey: addDaysToKey(f.checkInKey, Number(f.nights)), guestName: f.guestName.trim() }),
      { success: (r) => `Room ${r.roomName} given (${r.referenceNo}).` }
    );
    setBusy(false);
    if (ok) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title="Give a room of the package" description="The room is booked free for the client in its department, so nobody else can take it those nights." footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>Give the room</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Rooms department" htmlFor="al-dept">
          <select id="al-dept" className={selectClass} value={f.roomsDepartmentId} onChange={(e) => setF({ ...f, roomsDepartmentId: e.target.value, roomId: "" })}>
            {departments.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </select>
        </Field>
        <Field label="Room" required htmlFor="al-room">
          <select id="al-room" className={selectClass} value={f.roomId} onChange={(e) => setF({ ...f, roomId: e.target.value })}>
            <option value="">Choose a room</option>
            {rooms.map((r) => <option key={r.id} value={r.id}>{r.name}{r.roomType ? ` · ${r.roomType}` : ""}</option>)}
          </select>
        </Field>
        <Field label="Arrival" required htmlFor="al-in">
          <input id="al-in" type="date" className={inputClass} value={f.checkInKey} onChange={(e) => setF({ ...f, checkInKey: e.target.value })} />
        </Field>
        <Field label="Nights" required htmlFor="al-nights">
          <input id="al-nights" className={inputClass} inputMode="numeric" value={f.nights} onChange={(e) => setF({ ...f, nights: e.target.value.replace(/\D/g, "") })} />
        </Field>
      </div>
      <Field label="Guest" required htmlFor="al-guest">
        <input id="al-guest" className={inputClass} value={f.guestName} onChange={(e) => setF({ ...f, guestName: e.target.value })} />
      </Field>
    </FormDialog>
  );
}

/** Rooms the booking's package gives, the stays already allocated, giving and releasing them. */
export function PackageRooms({ departmentId, booking, stays, departments, canBook }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(null);
  const items = (booking.packageSnapshot?.items || []).filter((i) => i.kind === "ROOM");
  const count = items.reduce((s, i) => s + (Number(i.quantity) || 0), 0);
  if (!count) return null;
  const nights = Math.max(1, ...items.map((i) => Number(i.nights) || 1));
  const live = stays.filter((s) => s.status !== "CANCELLED");
  const editable = ["RESERVED", "CONFIRMED"].includes(booking.status);
  const release = async (s) => {
    setBusy(s.id);
    await runWithToast(releasePackageRoom({ departmentId, stayId: s.id, reason: "Released from the venue booking" }), { success: `Room ${s.room.name} released.` });
    setBusy(null);
  };
  return (
    <Section
      title={`Rooms of the package (${live.length} of ${count} given)`}
      description={items.map((i) => `${i.quantity} × ${i.label}, ${i.nights} night(s)`).join(" · ")}
      actions={canBook && editable && live.length < count && departments.length ? <Button size="sm" onClick={() => setOpen(true)}><Plus className="h-4 w-4" /> Give a room</Button> : null}
    >
      {!departments.length ? <Banner tone="warn">No rooms department in the business yet: the Boss creates one (type “Rooms / guest house”, e.g. Executive Stay) and its rooms.</Banner> : null}
      {live.length < count && editable ? <p className="mb-2 flex items-center gap-1 text-sm text-amber-800"><BedDouble className="h-4 w-4" /> {count - live.length} room(s) still to give.</p> : null}
      <DataTable
        dense
        rows={stays}
        empty="No room given yet."
        columns={[
          { key: "ref", label: "Stay", render: (s) => s.referenceNo },
          { key: "where", label: "Room", render: (s) => `${s.room.name} · ${s.department?.name || ""}` },
          { key: "guest", label: "Guest", render: (s) => s.guestName },
          { key: "dates", label: "Nights", render: (s) => `${formatDateKey(s.checkInKey)} → ${formatDateKey(s.checkOutKey)} (${s.nights})` },
          { key: "status", label: "Status", render: (s) => <StatusBadge status={s.status === "CHECKED_IN" ? "OPEN" : s.status} label={STAY_STATUS_LABELS[s.status]} /> },
          { key: "actions", label: "", align: "right", render: (s) => (canBook && editable && ["RESERVED", "CONFIRMED"].includes(s.status) ? <Button size="sm" variant="ghost" className="text-rose-700" disabled={busy === s.id} onClick={() => release(s)}>Release</Button> : null) },
        ]}
      />
      {open ? <AllocateDialog departmentId={departmentId} booking={booking} departments={departments} nights={nights} onClose={() => setOpen(false)} /> : null}
    </Section>
  );
}
