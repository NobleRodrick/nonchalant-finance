/**
 * Operations of event rental departments (e.g. Deco Diva): the stock and its movements, bookings,
 * dispatch and returns, damages and losses, payments, purchases and assets (see
 * lib/operations/registry.js for the definition format; docs/EVENT_RENTAL_PLAN.md for the rules).
 */
import { PERMISSIONS } from "@/lib/permissions";
import { adjustItem, archiveItem, saveItem } from "@/lib/rental/item-service";
import { cancelOrder, createOrder, stepOrder, updateOrder } from "@/lib/rental/order-service";
import { saveClient } from "@/lib/clients/client-service";
import { dispatchOrder, returnItems } from "@/lib/rental/check-service";
import { recordOrderPayment, recordOrderRefund } from "@/lib/rental/order-money";
import { saveProfile } from "@/lib/business-profile";
import { recordPurchase, voidPurchase } from "@/lib/rental/purchase-service";
import { disposeAsset, saveAsset } from "@/lib/assets/asset-service";
import { addCharge, completeRepair, reportIncident, settleIncident, voidCharge } from "@/lib/rental/incident-service";
import { recordCashCount } from "@/lib/departments/cash-count-service";
import { writeIn } from "./helpers";

const MANAGE = writeIn("MATERIAL_RENTAL", PERMISSIONS.RENTAL_MANAGE);
const ARCHIVE = writeIn("MATERIAL_RENTAL", PERMISSIONS.ITEMS_ARCHIVE);
const BOOK = writeIn("MATERIAL_RENTAL", PERMISSIONS.RENTAL_BOOK);

export const RENTAL_OPERATIONS = {
  // ─── Stock ────────────────────────────────────────────────────────────────
  /** A stock line (with its opening count) or its details: code, prices, supplier, place, photo. */
  "rental.item.save": { label: "Stock item", dated: true, access: MANAGE, run: saveItem },
  /** A count corrected (reason required), or the items moved to another storage place. */
  "rental.item.adjust": { label: "Stock corrected", dated: true, access: MANAGE, run: adjustItem },
  /** Archived (no longer offered, history kept) or brought back. */
  "rental.item.archive": { label: "Stock item archived", access: ARCHIVE, run: archiveItem },

  // ─── Customers and bookings ───────────────────────────────────────────────
  "rental.client.save": { label: "Customer", access: BOOK, run: saveClient },
  /** Inquiry, quotation or confirmed (a confirmed booking holds its items: availability checked). */
  "rental.order.create": { label: "Booking", access: BOOK, run: createOrder },
  /** Event, dates, items and services, prices (with a reason and the right), people. */
  "rental.order.update": { label: "Booking changed", access: BOOK, run: updateOrder },
  /** quote | confirm | prepare | close */
  "rental.order.step": { label: "Booking updated", access: BOOK, run: stepOrder },
  "rental.order.cancel": { label: "Booking cancelled", access: BOOK, run: cancelOrder },

  // ─── Dispatch, returns, damages and losses ────────────────────────────────
  /** The items leave (quantities confirmed, never more than the store holds). */
  "rental.order.dispatch": { label: "Items dispatched", dated: true, access: BOOK, run: dispatchOrder },
  /** Items back: good, damaged, broken, missing (differences become records to settle). */
  "rental.order.return": { label: "Items returned", dated: true, access: BOOK, run: returnItems },
  /** Damaged, broken or missing items found outside an event. */
  "rental.incident.report": { label: "Damage reported", dated: true, access: BOOK, run: reportIncident },
  /** charge the customer | loss | repair | found */
  "rental.incident.settle": { label: "Damage settled", dated: true, access: BOOK, run: settleIncident },
  /** Back from repair: cost (paid from the drawer: a repair expense of the event). */
  "rental.repair.complete": { label: "Repair done", dated: true, access: BOOK, run: completeRepair },
  /** Extra days, transport, labour … added to what the customer owes. */
  "rental.charge.add": { label: "Charge added", dated: true, access: BOOK, run: addCharge },
  "rental.charge.void": { label: "Charge voided", access: writeIn("MATERIAL_RENTAL", PERMISSIONS.RECORDS_VOID), run: voidCharge },

  // ─── Money of bookings, business details ──────────────────────────────────
  /** Receipt RC-…: who received it, how, reference, proof; never more than the balance. */
  "rental.payment.record": { label: "Payment", money: true, dated: true, access: BOOK, run: recordOrderPayment },
  "rental.refund.record": { label: "Refund", money: true, dated: true, access: BOOK, run: recordOrderRefund },
  /** Name, address, phone, tax numbers, logo, payment and contract terms printed on documents. */
  /** The cash counted in the drawer vs what it should hold (a difference needs an explanation). */
  "rental.cash.count": { label: "Cash count", dated: true, access: writeIn("MATERIAL_RENTAL", PERMISSIONS.HANDOVER_CREATE), run: recordCashCount },
  "rental.profile.save": { label: "Business details", access: MANAGE, run: saveProfile },

  // ─── Purchases and assets ─────────────────────────────────────────────────
  /** Items bought: the stock grows, the purchase price updates; units may enter the asset register. */
  "rental.purchase.record": { label: "Purchase", money: true, dated: true, access: MANAGE, run: recordPurchase },
  /** A purchase recorded by mistake: its units leave the stock again (reason required). */
  "rental.purchase.void": { label: "Purchase voided", access: writeIn("MATERIAL_RENTAL", PERMISSIONS.RECORDS_VOID), run: voidPurchase },
  /** An asset of the register: purchase facts, useful life, depreciation method. */
  "rental.asset.save": { label: "Asset", access: MANAGE, run: saveAsset },
  /** Sold, scrapped or lost: depreciation stops; the book value left is a loss (or a gain). */
  "rental.asset.dispose": { label: "Asset disposed of", access: ARCHIVE, run: disposeAsset },
};
