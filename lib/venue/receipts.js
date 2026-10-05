/**
 * What a receipt of a booking payment states: the booking and its client, this payment, what was
 * paid up to and including it and the balance left after it (charges dated up to it included).
 * Pure function over the booking detail (lib/venue/booking-queries → bookingDetail).
 */
import { bookingFigures } from "./booking-math";

export function receiptOf(booking, transactionId) {
  const t = (booking.transactions || []).find((x) => x.id === transactionId && (x.type === "BOOKING_PAYMENT" || x.type === "BOOKING_REFUND"));
  if (!t) return null;
  const at = new Date(t.date).getTime();
  const upTo = (booking.transactions || []).filter((x) => (x.type === "BOOKING_PAYMENT" || x.type === "BOOKING_REFUND") && new Date(x.date).getTime() <= at && (x.id === t.id || x.status === "COMPLETED"));
  const charges = (booking.charges || []).filter((c) => !c.voidedAt && new Date(c.date).getTime() <= at);
  const figures = bookingFigures({ agreedPrice: booking.agreedPrice, status: booking.status === "CANCELLED" && new Date(booking.cancelledAt).getTime() <= at ? "CANCELLED" : "CONFIRMED", charges, money: upTo.map((x) => ({ type: x.type, amount: x.amount, status: x.id === t.id ? "COMPLETED" : x.status })) });
  return { transaction: t, figures, isRefund: t.type === "BOOKING_REFUND", voided: t.status === "VOIDED" };
}
