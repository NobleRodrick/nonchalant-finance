import { Pill, StatusBadge } from "@/components/kit/primitives";

/** The stage of a booking (Inquiry … Fully paid) in its colour, with words. */
export function StageBadge({ stage }) {
  return <Pill tone={stage.tone} className="whitespace-nowrap">{stage.label}</Pill>;
}

/** Unpaid / deposit / paid of a booking (cancelled bookings show nothing). */
export function PaymentBadge({ order }) {
  if (order.status === "CANCELLED" || order.status === "INQUIRY") return null;
  return <StatusBadge status={order.overdue ? "LATE" : order.figures.paymentStatus} label={order.overdue ? "Overdue" : undefined} />;
}
