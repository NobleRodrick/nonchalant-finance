"use client";

import Link from "next/link";
import { useState } from "react";
import { CalendarPlus, Check, Pencil, UserX, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState, Field, Pill, Section, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { VoidButton } from "@/components/kit/void-button";
import { useRecorder } from "@/lib/offline/react";
import { appointmentSpec, appointmentStatusSpec } from "@/lib/production/specs";
import { APPOINTMENT_LABELS, APPOINTMENT_TONES } from "@/lib/salon/salon-math";

const pad = (n) => String(n).padStart(2, "0");
const localTime = (iso) => {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

/** Book (or change) an appointment: customer, service, staff member, day, time, duration. */
function AppointmentDialog({ departmentId, dateKey, appointment, items, workers, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState(() => ({ name: appointment?.customer || "", phone: appointment?.phone || "", itemId: appointment?.itemId || items[0]?.id || "", workerId: appointment?.workerId || "", day: dateKey, time: appointment ? localTime(appointment.startAt) : "09:00", minutes: String(appointment?.minutes || items[0]?.minutes || 60), note: appointment?.note || "" }));
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setF({ ...f, [k]: k === "minutes" ? wholeNumber(e.target.value) : e.target.value });
  const pickItem = (e) => {
    const it = items.find((x) => x.id === e.target.value);
    setF({ ...f, itemId: e.target.value, minutes: String(it?.minutes || f.minutes) });
  };
  const submit = async () => {
    setBusy(true);
    const startAt = new Date(`${f.day}T${f.time}:00`).toISOString();
    const out = await record(appointmentSpec(departmentId, { ...(appointment ? { id: appointment.id } : {}), client: { name: f.name.trim(), phone: f.phone.trim() || null }, itemId: f.itemId || null, workerId: f.workerId || null, startAt, minutes: Number(f.minutes) || 60, note: f.note.trim() || null }), { success: appointment ? "Appointment changed." : "Appointment booked." });
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open onOpenChange={(v) => !v && onClose()} title={appointment ? `Change ${appointment.referenceNo}` : "Book an appointment"} description="A staff member cannot be booked twice at the same time." footer={<SubmitButton busy={busy} disabled={!f.name.trim() || !f.day || !f.time} onClick={submit}>{appointment ? "Save" : "Book"}</SubmitButton>}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Customer" required htmlFor="ap-n"><input id="ap-n" autoFocus className={inputClass} value={f.name} onChange={set("name")} /></Field>
        <Field label="Phone (WhatsApp)" htmlFor="ap-p"><input id="ap-p" className={inputClass} inputMode="tel" value={f.phone} onChange={set("phone")} /></Field>
        <Field label="Service" htmlFor="ap-s"><select id="ap-s" className={selectClass} value={f.itemId} onChange={pickItem}><option value="">To decide</option>{items.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}</select></Field>
        <Field label="With" htmlFor="ap-w"><select id="ap-w" className={selectClass} value={f.workerId} onChange={set("workerId")}><option value="">Anyone free</option>{workers.map((w) => <option key={w.id} value={w.id}>{w.name}</option>)}</select></Field>
        <Field label="Day" required htmlFor="ap-d"><input id="ap-d" type="date" className={inputClass} value={f.day} onChange={set("day")} /></Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Time" required htmlFor="ap-t"><input id="ap-t" type="time" className={inputClass} value={f.time} onChange={set("time")} /></Field>
          <Field label="Minutes" htmlFor="ap-m"><input id="ap-m" className={inputClass} inputMode="numeric" value={f.minutes} onChange={set("minutes")} /></Field>
        </div>
        <Field label="Note" htmlFor="ap-no" className="sm:col-span-2"><textarea id="ap-no" rows={2} className={textareaClass} value={f.note} onChange={set("note")} /></Field>
      </div>
    </FormDialog>
  );
}

/** The appointments of a day, one column per staff member (and one for "anyone"). */
export function AppointmentsBoard({ departmentId, dateKey, appointments, items, workers, canBook }) {
  const record = useRecorder();
  const [dialog, setDialog] = useState(null);
  const columns = [...workers.map((w) => ({ id: w.id, name: w.name })), { id: "", name: "Anyone free" }].filter((c) => c.id || appointments.some((a) => !a.workerId));
  const base = `/d/${departmentId}`;
  return (
    <div className="space-y-4">
      {canBook ? <div className="flex justify-end"><Button onClick={() => setDialog({ appointment: null })}><CalendarPlus className="h-4 w-4" /> Book an appointment</Button></div> : null}
      {appointments.length ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3" data-testid="appointments">
          {columns.map((c) => {
            const rows = appointments.filter((a) => (a.workerId || "") === c.id);
            return (
              <Section key={c.id || "any"} title={c.name} description={`${rows.filter((a) => ["BOOKED", "ARRIVED"].includes(a.status)).length} appointment(s)`} bodyClassName="space-y-2">
                {rows.length ? rows.map((a) => (
                  <div key={a.id} className="rounded-lg border border-slate-200 p-2" data-testid="appointment">
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold tabular-nums">{a.time}–{a.endTime}</span>
                      <Pill tone={APPOINTMENT_TONES[a.status]}>{APPOINTMENT_LABELS[a.status]}</Pill>
                    </div>
                    <div className="text-sm">{a.customer}{a.phone ? <span className="text-xs text-slate-500"> · {a.phone}</span> : null}</div>
                    <div className="text-xs text-slate-600">{a.service || "Service to decide"}{a.note ? ` · ${a.note}` : ""}</div>
                    {a.ticket ? <Link className="text-xs underline" href={`${base}/tickets/${a.ticket.id}`}>Visit {a.ticket.referenceNo}</Link> : null}
                    {a.status === "CANCELLED" && a.cancelReason ? <div className="text-xs text-slate-500">{a.cancelReason}</div> : null}
                    {canBook && a.status === "BOOKED" ? (
                      <div className="mt-1 flex flex-wrap gap-1">
                        <Button size="sm" onClick={() => record(appointmentStatusSpec(departmentId, a, "ARRIVED"), { success: `${a.customer} arrived: visit opened.` })} disabled={!a.itemId} title={a.itemId ? undefined : "Choose the service first"}><Check className="h-4 w-4" /> Arrived</Button>
                        <Button size="sm" variant="outline" onClick={() => record(appointmentStatusSpec(departmentId, a, "NO_SHOW"), { success: "Marked: did not come." })}><UserX className="h-4 w-4" /> Did not come</Button>
                        <Button size="sm" variant="ghost" onClick={() => setDialog({ appointment: a })} aria-label={`Change ${a.referenceNo}`}><Pencil className="h-4 w-4" /></Button>
                        <VoidButton label="" what="appointment" reference={`${a.time} ${a.customer}`} onVoid={(reason) => record(appointmentStatusSpec(departmentId, a, "CANCELLED", reason), { success: "Cancelled." })} />
                      </div>
                    ) : canBook && a.status === "NO_SHOW" ? <Button size="sm" variant="ghost" className="mt-1" onClick={() => record(appointmentStatusSpec(departmentId, a, "BOOKED"), { success: "Booked again." })}><X className="h-4 w-4" /> Undo</Button> : null}
                  </div>
                )) : <p className="text-sm text-slate-400">Free all day.</p>}
              </Section>
            );
          })}
        </div>
      ) : (
        <EmptyState title="No appointment this day" description="Book customers with a staff member; when they arrive, the visit opens with the service's price." />
      )}
      {dialog ? <AppointmentDialog departmentId={departmentId} dateKey={dateKey} appointment={dialog.appointment} items={items} workers={workers} onClose={() => setDialog(null)} /> : null}
    </div>
  );
}
