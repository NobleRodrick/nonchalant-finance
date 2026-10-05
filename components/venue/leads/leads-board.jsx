"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { CalendarPlus, Pencil, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner, DataTable, Field, Money, Section, StatCard, StatusBadge, inputClass, selectClass, textareaClass } from "@/components/kit/primitives";
import { wholeNumber } from "@/components/kit/client";
import { FormDialog, SubmitButton } from "@/components/kit/form-dialog";
import { useOutboxOps, useRecorder } from "@/lib/offline/react";
import { opsInEffect } from "@/lib/offline/overlay";
import { formatRate } from "@/lib/format";
import { formatDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";
import { EVENT_TYPES, LEAD_SOURCES } from "@/lib/venue/constants";
import { LEAD_STATUS_LABELS, conversionBy, followUpsDue, leadStats } from "@/lib/venue/lead-math";
import { BookingDialog } from "@/components/venue/bookings/booking-dialog";

const EDITABLE = ["NEW", "CONTACTED", "FOLLOW_UP", "NEGOTIATING", "LOST", "CANCELLED"];

function LeadDialog({ departmentId, lead, packages, heads, todayKey, onClose }) {
  const record = useRecorder();
  const [f, setF] = useState({
    clientName: lead?.clientName || "",
    phone: lead?.phone || "",
    email: lead?.email || "",
    eventType: lead?.eventType || "",
    guests: lead?.guests ?? "",
    proposedDateKey: dateKeyOf(lead?.proposedDate) || "",
    packageId: lead?.packageId || "",
    priceDiscussed: lead?.priceDiscussed ?? "",
    source: lead?.source || "",
    handledById: lead?.handledBy?.id || "",
    followUpKey: dateKeyOf(lead?.followUpDate) || "",
    status: lead?.status || "NEW",
    closedReason: lead?.closedReason || "",
    notes: lead?.notes || "",
  });
  const [busy, setBusy] = useState(false);
  const set = (k, numeric = false) => (e) => setF({ ...f, [k]: numeric ? wholeNumber(e.target.value) : e.target.value });
  const needsReason = ["LOST", "CANCELLED"].includes(f.status);
  const valid = f.clientName.trim() && (!needsReason || f.closedReason.trim());
  const submit = async () => {
    setBusy(true);
    const out = await record(
      { kind: "venue.lead.save", label: "Lead", departmentId, input: { departmentId, id: lead?.id, ...f, clientName: f.clientName.trim(), handledById: f.handledById || undefined }, meta: { clientName: f.clientName.trim(), status: f.status, summary: `${f.clientName.trim()} · ${LEAD_STATUS_LABELS[f.status]}` } },
      { success: lead ? "Lead updated." : "Lead recorded." }
    );
    setBusy(false);
    if (out) onClose();
  };
  return (
    <FormDialog open wide onOpenChange={(v) => !v && onClose()} title={lead ? lead.clientName : "New lead"} description="Someone who enquired about the hall and has not booked yet." footer={<SubmitButton busy={busy} disabled={!valid} onClick={submit}>{lead ? "Save" : "Record the lead"}</SubmitButton>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field label="Name" required htmlFor="ld-name"><input id="ld-name" className={inputClass} value={f.clientName} onChange={set("clientName")} /></Field>
        <Field label="Phone" htmlFor="ld-phone"><input id="ld-phone" className={inputClass} value={f.phone} onChange={set("phone")} /></Field>
        <Field label="E-mail" htmlFor="ld-email"><input id="ld-email" className={inputClass} value={f.email} onChange={set("email")} /></Field>
        <Field label="Type of event" htmlFor="ld-type">
          <input id="ld-type" list="ld-types" className={inputClass} value={f.eventType} onChange={set("eventType")} />
          <datalist id="ld-types">{EVENT_TYPES.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        <Field label="Guests expected" htmlFor="ld-guests"><input id="ld-guests" className={inputClass} inputMode="numeric" value={f.guests} onChange={set("guests", true)} /></Field>
        <Field label="Proposed date" htmlFor="ld-date"><input id="ld-date" type="date" className={inputClass} value={f.proposedDateKey} onChange={set("proposedDateKey")} /></Field>
        <Field label="Package discussed" htmlFor="ld-package">
          <select id="ld-package" className={selectClass} value={f.packageId} onChange={set("packageId")}>
            <option value="">—</option>
            {packages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Price discussed (FCFA)" htmlFor="ld-price"><input id="ld-price" className={inputClass} inputMode="numeric" value={f.priceDiscussed} onChange={set("priceDiscussed", true)} /></Field>
        <Field label="Source" htmlFor="ld-source">
          <input id="ld-source" list="ld-sources" className={inputClass} value={f.source} onChange={set("source")} placeholder="Facebook, referral, walk-in …" />
          <datalist id="ld-sources">{LEAD_SOURCES.map((t) => <option key={t} value={t} />)}</datalist>
        </Field>
        {heads.length ? (
          <Field label="Handled by" htmlFor="ld-handler">
            <select id="ld-handler" className={selectClass} value={f.handledById} onChange={set("handledById")}>
              <option value="">{lead ? "—" : "Me"}</option>
              {heads.map((h) => <option key={h.id} value={h.id}>{h.name}</option>)}
            </select>
          </Field>
        ) : null}
        <Field label="Follow up on" htmlFor="ld-follow"><input id="ld-follow" type="date" min={lead ? undefined : todayKey} className={inputClass} value={f.followUpKey} onChange={set("followUpKey")} /></Field>
        <Field label="Status" htmlFor="ld-status">
          <select id="ld-status" className={selectClass} value={f.status} onChange={set("status")} disabled={lead?.status === "BOOKED"}>
            {(lead?.status === "BOOKED" ? ["BOOKED"] : EDITABLE).map((s) => <option key={s} value={s}>{LEAD_STATUS_LABELS[s]}</option>)}
          </select>
        </Field>
      </div>
      {needsReason ? (
        <Field label={f.status === "LOST" ? "Why was it lost?" : "Why was it cancelled?"} required htmlFor="ld-reason"><input id="ld-reason" className={inputClass} value={f.closedReason} onChange={set("closedReason")} placeholder="Price, date taken, chose another venue …" /></Field>
      ) : null}
      <Field label="Notes" htmlFor="ld-notes"><textarea id="ld-notes" className={textareaClass} value={f.notes} onChange={set("notes")} /></Field>
    </FormDialog>
  );
}

/** Leads of the venue: follow-ups due, conversion to bookings, by source and by person. */
export function LeadsBoard({ departmentId, renderedAt, leads: server, form, todayKey, canBook, currentUserId, takenDates }) {
  const ops = useOutboxOps();
  const [editing, setEditing] = useState(null);
  const [booking, setBooking] = useState(null);
  // New leads recorded on this computer, shown until the page has them.
  const leads = useMemo(() => {
    const pending = opsInEffect(ops, { departmentId, renderedAt }).filter((op) => op.kind === "venue.lead.save" && !op.input?.id);
    return [...pending.map((op) => ({ id: op.key, clientName: op.input.clientName, phone: op.input.phone, eventType: op.input.eventType, source: op.input.source, status: op.input.status || "NEW", enquiryDate: op.dateKey, pending: true })), ...server];
  }, [ops, departmentId, renderedAt, server]);
  const stats = leadStats(leads);
  const due = followUpsDue(leads, todayKey);
  const bySource = conversionBy(leads, (l) => l.source);
  const byHandler = conversionBy(leads, (l) => l.handledBy?.name);
  const columns = [
    { key: "who", label: "Lead", render: (l) => <span><span className="font-medium">{l.clientName}</span>{l.phone ? <span className="block text-xs text-slate-500">{l.phone}</span> : null}</span> },
    { key: "when", label: "Enquiry", render: (l) => <span className="whitespace-nowrap text-xs">{formatDateKey(dateKeyOf(l.enquiryDate))}</span> },
    { key: "event", label: "Event", render: (l) => <span>{l.eventType || "—"}{l.proposedDate ? <span className="block text-xs text-slate-500">{formatDateKey(dateKeyOf(l.proposedDate))}{l.guests ? ` · ${l.guests} guests` : ""}</span> : null}</span> },
    { key: "price", label: "Discussed", render: (l) => <span>{l.priceDiscussed ? <Money value={l.priceDiscussed} /> : "—"}{l.package ? <span className="block text-xs text-slate-500">{l.package.name}</span> : null}</span> },
    { key: "source", label: "Source", render: (l) => l.source || "—" },
    { key: "handler", label: "Handled by", render: (l) => l.handledBy?.name || "—" },
    { key: "follow", label: "Follow up", render: (l) => (l.followUpDate ? <span className={dateKeyOf(l.followUpDate) < todayKey && !["BOOKED", "LOST", "CANCELLED"].includes(l.status) ? "font-semibold text-rose-700" : ""}>{formatDateKey(dateKeyOf(l.followUpDate))}</span> : "—") },
    { key: "status", label: "Status", render: (l) => <span className="inline-flex flex-col"><StatusBadge status={l.status} />{l.pending ? <span className="text-[11px] text-amber-700">Not sent yet</span> : null}{l.booking ? <Link className="text-xs underline" href={`/d/${departmentId}/bookings/${l.booking.id}`}>{l.booking.referenceNo}</Link> : null}{l.closedReason ? <span className="text-xs text-slate-500">{l.closedReason}</span> : null}</span> },
    {
      key: "actions",
      label: "",
      align: "right",
      render: (l) =>
        canBook && !l.pending ? (
          <span className="inline-flex gap-1">
            {!l.booking && form.hall ? <Button size="sm" variant="outline" onClick={() => setBooking(l)}><CalendarPlus className="h-4 w-4" /> Book</Button> : null}
            <Button size="icon-sm" variant="ghost" aria-label={`Change ${l.clientName}`} onClick={() => setEditing(l)}><Pencil className="h-4 w-4" /></Button>
          </span>
        ) : null,
    },
  ];
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard label="Leads" value={stats.total} />
        <StatCard label="Open" value={stats.open} tone={stats.open ? "info" : "default"} />
        <StatCard label="Booked" value={stats.booked} tone="in" />
        <StatCard label="Lost / cancelled" value={stats.lost + stats.cancelled} tone="out" />
        <StatCard label="Conversion rate" value={stats.conversionRate === null ? "—" : formatRate(stats.conversionRate)} hint="booked ÷ closed leads" />
      </div>
      {due.length ? (
        <Banner tone={due.some((l) => l.overdue) ? "bad" : "warn"}>
          Follow-ups due: {due.slice(0, 5).map((l) => `${l.clientName}${l.overdue ? " (late)" : ""}`).join(", ")}{due.length > 5 ? ` and ${due.length - 5} more` : ""}.
        </Banner>
      ) : null}
      <Section title="Leads" actions={canBook ? <Button size="sm" onClick={() => setEditing("new")}><Plus className="h-4 w-4" /> New lead</Button> : null}>
        <DataTable columns={columns} rows={leads} empty="No lead in this period." rowClassName={(l) => (l.pending ? "bg-amber-50/40" : "")} />
      </Section>
      <div className="grid gap-6 lg:grid-cols-2">
        {[["By source", bySource], ["By person handling", byHandler]].map(([title, rows]) => (
          <Section key={title} title={title}>
            <DataTable
              dense
              rows={rows}
              rowKey={(r) => r.key}
              columns={[
                { key: "key", label: "", render: (r) => r.key },
                { key: "total", label: "Leads", align: "right", render: (r) => r.total },
                { key: "booked", label: "Booked", align: "right", render: (r) => r.booked },
                { key: "lost", label: "Lost", align: "right", render: (r) => r.lost },
                { key: "rate", label: "Conversion", align: "right", render: (r) => (r.conversionRate === null ? "—" : formatRate(r.conversionRate)) },
              ]}
            />
          </Section>
        ))}
      </div>
      {editing ? <LeadDialog key={editing === "new" ? "new" : editing.id} departmentId={departmentId} lead={editing === "new" ? null : editing} packages={form.packages} heads={form.heads} todayKey={todayKey} onClose={() => setEditing(null)} /> : null}
      {booking ? (
        <BookingDialog
          open
          onOpenChange={(v) => !v && setBooking(null)}
          departmentId={departmentId}
          hall={form.hall}
          packages={form.packages}
          heads={form.heads}
          takenDates={takenDates}
          currentUserId={currentUserId}
          todayKey={todayKey}
          lead={{ ...booking, proposedDateKey: dateKeyOf(booking.proposedDate) }}
        />
      ) : null}
    </div>
  );
}
