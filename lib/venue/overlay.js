/**
 * Venue pages = the server's bookings + what this computer recorded that they do not include yet
 * (lib/offline/overlay explains "in effect"). Pure functions: the calendar, the lists and the
 * booking page apply the same changes, in the order they were recorded.
 */
import { localId } from "@/lib/offline/local-ids";
import { STATUS } from "@/lib/offline/status";
import { bookingFigures } from "./booking-math";

export const NOT_SENT = "Not sent yet";

const sorted = (ops) => [...(ops || [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0) || (a.createdAt ?? 0) - (b.createdAt ?? 0));

function newBooking(op) {
  const m = op.meta || {};
  const applied = op.status === STATUS.APPLIED;
  const status = m.status || "RESERVED";
  return {
    id: applied && op.result?.bookingId ? op.result.bookingId : localId("bookingId", op.key),
    referenceNo: applied && op.result?.referenceNo ? op.result.referenceNo : NOT_SENT,
    status,
    eventType: m.eventType,
    eventDateKey: m.eventDateKey,
    guests: m.guests === "" ? null : m.guests ?? null,
    agreedPrice: m.agreedPrice || 0,
    holdUntilKey: applied ? op.result?.holdUntilKey || null : null,
    client: { id: applied ? op.result?.clientId : op.input?.clientId || localId("clientId", op.key), name: m.clientName, phone: m.clientPhone },
    packageSnapshot: m.packageName ? { name: m.packageName } : null,
    figures: bookingFigures({ agreedPrice: m.agreedPrice || 0, status }),
    pending: !applied,
    pendingKey: op.key,
  };
}

/** Applies one booking change to a booking row (returns a new row). */
function change(row, op) {
  const m = op.meta || {};
  const next = { ...row, pending: row.pending || op.status !== STATUS.APPLIED };
  const f = { charges: 0, received: 0, refunded: 0, ...(row.figures || {}) };
  switch (op.kind) {
    case "venue.payment.record":
      next.figures = { ...f, received: f.received + (Number(m.amount) || 0) };
      break;
    case "venue.refund.record":
      next.figures = { ...f, refunded: f.refunded + (Number(m.amount) || 0) };
      break;
    case "venue.charge.add":
      next.figures = { ...f, charges: f.charges + (Number(m.amount) || 0) };
      break;
    case "venue.charge.void":
      next.figures = { ...f, charges: Math.max(0, f.charges - (Number(m.amount) || 0)) };
      break;
    case "record.void":
      if (m.voidType === "BOOKING_PAYMENT") next.figures = { ...f, received: Math.max(0, f.received - (Number(m.amount) || 0)) };
      else if (m.voidType === "BOOKING_REFUND") next.figures = { ...f, refunded: Math.max(0, f.refunded - (Number(m.amount) || 0)) };
      else return row;
      break;
    case "venue.booking.confirm":
    case "venue.booking.complete":
    case "venue.booking.cancel":
      next.status = m.status;
      if (m.status !== "RESERVED") next.holdUntilKey = null;
      if (m.status === "CANCELLED") next.cancelReason = m.reason;
      break;
    case "venue.booking.move":
      next.eventDateKey = m.eventDateKey;
      break;
    case "venue.booking.hold":
      next.holdUntilKey = m.holdUntilKey;
      break;
    case "venue.booking.update": {
      const p = m.patch || {};
      for (const k of ["eventType", "guests", "startTime", "endTime", "notes", "priceNote"]) if (p[k] !== undefined) next[k] = p[k];
      if (p.agreedPrice !== undefined && p.agreedPrice !== "") next.agreedPrice = Number(p.agreedPrice) || 0;
      break;
    }
    default:
      return row;
  }
  return next;
}

/**
 * The server's `bookings` with this computer's booking records in effect (`ops`): new bookings
 * added, changes applied. Money figures follow the agreed price and the status.
 */
export function applyPendingBookings(bookings, ops) {
  const rows = new Map((bookings || []).map((b) => [b.id, b]));
  for (const op of sorted(ops)) {
    if (op.kind === "venue.booking.create") {
      const b = newBooking(op);
      if (!rows.has(b.id)) rows.set(b.id, b);
      continue;
    }
    const id = op.meta?.bookingId || op.input?.bookingId;
    if (id && rows.has(id)) rows.set(id, change(rows.get(id), op));
  }
  return [...rows.values()].map((b) => {
    if (!b.pending) return b;
    const f = b.figures || {};
    const figures = bookingFigures({ agreedPrice: b.agreedPrice, status: b.status, charges: f.charges ? [{ amount: f.charges }] : [], money: [{ type: "BOOKING_PAYMENT", amount: f.received || 0 }, { type: "BOOKING_REFUND", amount: f.refunded || 0 }] });
    return { ...b, figures };
  });
}

/** Venue operations of this computer (kinds starting with "venue."). */
export function venueOps(ops) {
  return (ops || []).filter((op) => String(op.kind).startsWith("venue.") || (op.kind === "record.void" && op.meta?.bookingId));
}
