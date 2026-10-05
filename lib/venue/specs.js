/**
 * Builders of the venue operations the forms record (kind, input sent to the server, meta shown on
 * this device until the server's figures include it: lib/venue/overlay). Pure functions.
 */
import { formatMoney } from "@/lib/format";

/** A new booking. `client`: { id } of an existing client, or the new client's details. */
export function bookingCreateSpec({ departmentId, venueId, eventDateKey, eventType, guests, startTime, endTime, client, packageId, packageName, agreedPrice, suggestedPrice, priceNote, status, handledById, notes, leadId }) {
  const existing = client?.id || null;
  return {
    kind: "venue.booking.create",
    label: "Booking",
    departmentId,
    input: {
      departmentId,
      venueId,
      eventDateKey,
      eventType,
      guests: guests === "" ? null : guests,
      startTime: startTime || null,
      endTime: endTime || null,
      clientId: existing,
      client: existing ? null : { name: client?.name, phone: client?.phone, phoneAlt: client?.phoneAlt, email: client?.email, company: client?.company },
      packageId: packageId || null,
      agreedPrice: agreedPrice === "" || agreedPrice === undefined ? null : agreedPrice,
      priceNote: priceNote || null,
      status: status === "CONFIRMED" ? "CONFIRMED" : "RESERVED",
      handledById: handledById || null,
      notes: notes || null,
      leadId: leadId || null,
    },
    meta: {
      eventDateKey,
      eventType,
      guests,
      clientName: client?.name,
      clientPhone: client?.phone || null,
      packageName: packageName || null,
      agreedPrice: Number(agreedPrice === "" || agreedPrice === undefined || agreedPrice === null ? suggestedPrice : agreedPrice) || 0,
      status: status === "CONFIRMED" ? "CONFIRMED" : "RESERVED",
      summary: `${eventDateKey} · ${eventType} · ${client?.name || ""} · ${formatMoney(Number(agreedPrice || suggestedPrice) || 0)}`,
    },
  };
}

const ACTIONS = {
  confirm: { kind: "venue.booking.confirm", label: "Booking confirmed", status: "CONFIRMED" },
  complete: { kind: "venue.booking.complete", label: "Event completed", status: "COMPLETED" },
  cancel: { kind: "venue.booking.cancel", label: "Booking cancelled", status: "CANCELLED" },
};

/** Confirm, complete or cancel a booking (`reason` for a cancellation). */
export function bookingStatusSpec({ departmentId, booking, action, reason }) {
  const a = ACTIONS[action];
  return {
    kind: a.kind,
    label: a.label,
    departmentId,
    input: { departmentId, bookingId: booking.id, reason: reason || null },
    meta: { bookingId: booking.id, referenceNo: booking.referenceNo, status: a.status, reason: reason || null, summary: `${booking.referenceNo} · ${booking.client?.name || ""}${reason ? ` · ${reason}` : ""}` },
  };
}

/** Move a booking to another date. */
export function bookingMoveSpec({ departmentId, booking, eventDateKey, reason, agreedPrice }) {
  return {
    kind: "venue.booking.move",
    label: "Booking moved",
    departmentId,
    input: { departmentId, bookingId: booking.id, eventDateKey, reason, agreedPrice: agreedPrice === "" ? undefined : agreedPrice },
    meta: { bookingId: booking.id, referenceNo: booking.referenceNo, eventDateKey, fromDateKey: booking.eventDateKey, summary: `${booking.referenceNo} · ${booking.eventDateKey} → ${eventDateKey}` },
  };
}

/** Change a booking's details. `patch`: { eventType, guests, startTime, endTime, notes, handledById, agreedPrice, priceNote }. */
export function bookingUpdateSpec({ departmentId, booking, patch }) {
  return {
    kind: "venue.booking.update",
    label: "Booking changed",
    departmentId,
    input: { departmentId, bookingId: booking.id, ...patch },
    meta: { bookingId: booking.id, referenceNo: booking.referenceNo, patch, summary: `${booking.referenceNo} · ${Object.keys(patch).join(", ")}` },
  };
}

/** Hold a reservation until another date. */
export function bookingHoldSpec({ departmentId, booking, holdUntilKey }) {
  return {
    kind: "venue.booking.hold",
    label: "Reservation held longer",
    departmentId,
    input: { departmentId, bookingId: booking.id, holdUntilKey },
    meta: { bookingId: booking.id, referenceNo: booking.referenceNo, holdUntilKey, summary: `${booking.referenceNo} · held until ${holdUntilKey}` },
  };
}

const METHOD = { CASH: "Cash", MOMO: "Mobile Money", BANK_TRANSFER: "Bank" };

/** A payment received for a booking (proof files are uploaded when it is sent). */
export function paymentSpec({ departmentId, booking, amount, paymentMethod = "CASH", receivedByName, reference, remarks, overpay = false }) {
  return {
    kind: "venue.payment.record",
    label: "Booking payment",
    departmentId,
    input: { departmentId, bookingId: booking.id, amount: Number(amount), paymentMethod, receivedByName: receivedByName || null, reference: reference || null, remarks: remarks || null, overpay: Boolean(overpay) },
    meta: { bookingId: booking.id, referenceNo: booking.referenceNo, amount: Number(amount), method: paymentMethod, receivedByName, summary: `${booking.referenceNo} · ${booking.client?.name || ""} · ${METHOD[paymentMethod] || paymentMethod} · ${formatMoney(amount)}` },
  };
}

/** Money given back to a client. */
export function refundSpec({ departmentId, booking, amount, paymentMethod = "CASH", reason, reference }) {
  return {
    kind: "venue.refund.record",
    label: "Booking refund",
    departmentId,
    input: { departmentId, bookingId: booking.id, amount: Number(amount), paymentMethod, reason, reference: reference || null },
    meta: { bookingId: booking.id, referenceNo: booking.referenceNo, amount: Number(amount), method: paymentMethod, summary: `${booking.referenceNo} · refund ${formatMoney(amount)} · ${reason}` },
  };
}

/** An amount added to what a client owes. */
export function chargeSpec({ departmentId, booking, kind = "EXTRA_SERVICE", label, amount }) {
  return {
    kind: "venue.charge.add",
    label: "Booking charge",
    departmentId,
    input: { departmentId, bookingId: booking.id, kind, label, amount: Number(amount) },
    meta: { bookingId: booking.id, referenceNo: booking.referenceNo, amount: Number(amount), label, summary: `${booking.referenceNo} · ${label} · ${formatMoney(amount)}` },
  };
}

/** Removes a charge added by mistake. */
export function chargeVoidSpec({ departmentId, booking, charge, reason }) {
  return {
    kind: "venue.charge.void",
    label: "Booking charge removed",
    departmentId,
    input: { departmentId, chargeId: charge.id, reason },
    meta: { bookingId: booking.id, chargeId: charge.id, amount: Number(charge.amount), summary: `${charge.referenceNo} removed · ${reason}` },
  };
}
