/**
 * The money of anything booked and paid for over time (an event venue booking, a stay in an
 * apartment), as pure functions: pages, receipts, dashboards and reports all use them, so their
 * figures agree. Amounts are whole FCFA. Pure module (safe for client components; unit-tested).
 *
 *   total due   = agreed price + charges not voided   (a cancelled booking: what was kept)
 *   paid        = payments received − refunds given back
 *   balance     = total due − paid        (negative: the client paid too much)
 */

export const PAYMENT_STATUS_LABELS = {
  UNPAID: "Unpaid",
  PARTLY_PAID: "Deposit / partly paid",
  PAID: "Paid in full",
  OVERPAID: "Overpaid",
  REFUNDED: "Refunded",
};

const int = (v) => Math.round(Number(v) || 0);

/**
 * Figures of one booking. `charges`: [{ amount, voidedAt }]; `money`: its money records
 * [{ type: "BOOKING_PAYMENT" | "BOOKING_REFUND", amount, status }] (voided ones do not count).
 */
export function bookingFigures({ agreedPrice = 0, status = "RESERVED", charges = [], money = [] } = {}) {
  const chargesTotal = charges.filter((c) => !c.voidedAt).reduce((s, c) => s + int(c.amount), 0);
  const counted = money.filter((t) => (t.status || "COMPLETED") === "COMPLETED");
  const received = counted.filter((t) => t.type === "BOOKING_PAYMENT").reduce((s, t) => s + int(t.amount), 0);
  const refunded = counted.filter((t) => t.type === "BOOKING_REFUND").reduce((s, t) => s + int(t.amount), 0);
  // A cancelled booking owes nothing more: what was kept is the cancellation's income.
  const total = status === "CANCELLED" ? Math.max(0, received - refunded) : int(agreedPrice) + chargesTotal;
  const paid = received - refunded;
  const balance = total - paid;
  return { agreedPrice: int(agreedPrice), charges: chargesTotal, total, received, refunded, paid, balance, paymentStatus: paymentStatus({ total, paid, received, refunded }) };
}

export function paymentStatus({ total, paid, refunded }) {
  if (refunded > 0 && paid <= 0) return "REFUNDED";
  if (paid <= 0) return total > 0 ? "UNPAID" : "PAID";
  if (paid > total) return "OVERPAID";
  if (paid === total) return "PAID";
  return "PARTLY_PAID";
}
