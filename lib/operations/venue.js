/**
 * Operations of event venue departments (docs/VENUE_RENTAL_PLAN.md): the hall and its prices,
 * then bookings, payments, packages, assets and leads (see lib/operations/registry.js for the
 * definition format). The same definitions serve the forms and the offline outbox.
 */
import { PERMISSIONS } from "@/lib/permissions";
import { removePriceRule, saveHall, savePriceRule } from "@/lib/venue/hall-service";
import {
  cancelBooking, completeBooking, confirmBooking, createBooking, extendHold, moveBooking, saveClient, updateBooking,
} from "@/lib/venue/booking-service";
import { addBookingCharge, recordBookingPayment, recordBookingRefund, voidBookingCharge } from "@/lib/venue/payment-service";
import { allocatePackageRoom, releasePackageRoom, removePackage, savePackage, setPackageActive } from "@/lib/venue/package-service";
import { saveAsset, saveAssetCheck, settleIncident } from "@/lib/venue/asset-service";
import { saveLead, setLeadStatus } from "@/lib/venue/lead-service";
import { recordCashCount } from "@/lib/departments/cash-count-service";
import { writeIn } from "./helpers";

const MANAGE = writeIn("EVENT_VENUE", PERMISSIONS.VENUE_MANAGE);
const BOOK = writeIn("EVENT_VENUE", PERMISSIONS.VENUE_BOOK);

export const VENUE_OPERATIONS = {
  // ─── Hall and prices ──────────────────────────────────────────────────────
  /** Sets up the hall (name, capacity, base price, how long a reservation is held) or changes it. */
  "venue.hall.save": { label: "Hall", access: MANAGE, run: saveHall },
  /** A price for a day of the week, a season or a special date. */
  "venue.price.save": { label: "Hall price", access: MANAGE, run: savePriceRule },
  "venue.price.remove": { label: "Hall price removed", access: MANAGE, run: removePriceRule },

  // ─── Clients and bookings ─────────────────────────────────────────────────
  "venue.client.save": { label: "Client", access: BOOK, run: saveClient },
  /** Books a date (Reserved or Confirmed); one event per date. */
  "venue.booking.create": { label: "Booking", dated: true, access: BOOK, run: createBooking },
  "venue.booking.update": { label: "Booking changed", dated: true, access: BOOK, run: updateBooking },
  "venue.booking.move": { label: "Booking moved", dated: true, access: BOOK, run: moveBooking },
  "venue.booking.confirm": { label: "Booking confirmed", dated: true, access: BOOK, run: confirmBooking },
  "venue.booking.complete": { label: "Event completed", dated: true, access: BOOK, run: completeBooking },
  "venue.booking.cancel": { label: "Booking cancelled", dated: true, access: BOOK, run: cancelBooking },
  "venue.booking.hold": { label: "Reservation held longer", dated: true, access: BOOK, run: extendHold },

  // ─── Payments, refunds and charges ────────────────────────────────────────
  /** Money received for a booking (receipt RC-…): who received it, how, proof. Voided with record.void. */
  "venue.payment.record": { label: "Booking payment", money: true, dated: true, access: BOOK, run: recordBookingPayment },
  /** Money given back to a client (RF-…). */
  "venue.refund.record": { label: "Booking refund", money: true, dated: true, access: BOOK, run: recordBookingRefund },
  /** An amount added to what the client owes (CH-…). */
  "venue.charge.add": { label: "Booking charge", dated: true, access: BOOK, run: (tx, ctx, input) => addBookingCharge(tx, ctx, input) },
  "venue.charge.void": { label: "Booking charge removed", access: BOOK, run: voidBookingCharge },

  // ─── Packages and the rooms they give ─────────────────────────────────────
  "venue.package.save": { label: "Package", access: MANAGE, run: savePackage },
  "venue.package.active": { label: "Package offered / withdrawn", access: MANAGE, run: setPackageActive },
  "venue.package.remove": { label: "Package removed", access: MANAGE, run: removePackage },
  /** A room of the booking's package: a free stay of a specific room of a rooms department. */
  "venue.room.allocate": { label: "Package room", dated: true, access: BOOK, run: allocatePackageRoom },
  "venue.room.release": { label: "Package room released", access: BOOK, run: releasePackageRoom },

  // ─── Assets ───────────────────────────────────────────────────────────────
  "venue.asset.save": { label: "Asset", access: MANAGE, run: saveAsset },
  /** The check before or after an event (photos as proof); after: the differences are recorded. */
  "venue.check.save": { label: "Asset check", timeout: 30000, access: BOOK, run: saveAssetCheck },
  /** A difference charged to the client, recorded as a loss, or resolved. */
  "venue.incident.settle": { label: "Asset difference settled", access: BOOK, run: settleIncident },

  // ─── Leads ────────────────────────────────────────────────────────────────
  /** An enquiry (booked by making its booking: venue.booking.create with leadId). */
  "venue.lead.save": { label: "Lead", dated: true, access: BOOK, run: saveLead },
  "venue.lead.status": { label: "Lead status", access: BOOK, run: setLeadStatus },

  // ─── Cash count ───────────────────────────────────────────────────────────
  /** The cash counted in the drawer vs what it should hold (a difference needs an explanation). */
  "venue.cash.count": { label: "Cash count", dated: true, access: { permission: PERMISSIONS.HANDOVER_CREATE, write: true, domain: "EVENT_VENUE" }, run: recordCashCount },
};
