/**
 * The money of a venue booking and the state of the calendar, as pure functions: the booking
 * page, receipts, the calendar, dashboards and reports all use them, so their figures agree.
 * Amounts are whole FCFA. Pure module (safe for client components; unit-tested).
 *
 *   total due   = agreed price + charges (damages, extra services) not voided
 *   paid        = payments received − refunds given back
 *   balance     = total due − paid        (negative: the client paid too much)
 */
import { dateKeyOf } from "./dates";

// The money of a booking is shared with the other booked department types.
export { PAYMENT_STATUS_LABELS, bookingFigures, paymentStatus } from "@/lib/finance/booking-money";

export const BOOKING_STATUS_LABELS = {
  RESERVED: "Reserved",
  CONFIRMED: "Confirmed",
  COMPLETED: "Completed",
  CANCELLED: "Cancelled",
};

/** Bookings that hold their date (a cancelled one frees it). */
export const ACTIVE_STATUSES = ["RESERVED", "CONFIRMED", "COMPLETED"];


/**
 * A reservation whose hold is over: no money received and its hold date has passed. It still
 * holds the date until someone confirms, extends or cancels it (never released silently).
 */
export function holdExpired({ status, holdUntil, received = 0 }, todayKey) {
  const until = dateKeyOf(holdUntil);
  return status === "RESERVED" && Boolean(until) && until < todayKey && received <= 0;
}

/**
 * State of each date of a calendar range. `bookings`: [{ eventDateKey, status, … }]. A date is
 * "available" when no active booking holds it, "past" when it is gone without an event; the
 * cancelled bookings of a date are listed with it.
 */
export function calendarDays(dateKeys, bookings, todayKey) {
  const byDate = new Map();
  for (const b of bookings) {
    const k = b.eventDateKey || dateKeyOf(b.eventDate);
    if (!byDate.has(k)) byDate.set(k, []);
    byDate.get(k).push(b);
  }
  return dateKeys.map((dateKey) => {
    const all = byDate.get(dateKey) || [];
    const booking = all.find((b) => ACTIVE_STATUSES.includes(b.status)) || null;
    const cancelled = all.filter((b) => b.status === "CANCELLED");
    let state = booking ? booking.status : "AVAILABLE";
    if (!booking && dateKey < todayKey) state = "PAST";
    return { dateKey, state, booking, cancelled, isToday: dateKey === todayKey };
  });
}

/** Counts of a list of calendar days by state. */
export function calendarCounts(days) {
  const counts = { AVAILABLE: 0, RESERVED: 0, CONFIRMED: 0, COMPLETED: 0, CANCELLED: 0, PAST: 0 };
  for (const d of days) {
    counts[d.state] += 1;
    counts.CANCELLED += d.cancelled.length;
  }
  return counts;
}

/** Status changes a booking allows (on `todayKey`). */
export function allowedTransitions(booking, todayKey) {
  const eventKey = booking.eventDateKey || dateKeyOf(booking.eventDate);
  switch (booking.status) {
    case "RESERVED":
      return { confirm: true, complete: eventKey <= todayKey, cancel: true, extendHold: true, edit: true, move: true };
    case "CONFIRMED":
      return { confirm: false, complete: eventKey <= todayKey, cancel: true, extendHold: false, edit: true, move: true };
    default:
      return { confirm: false, complete: false, cancel: false, extendHold: false, edit: false, move: false };
  }
}
