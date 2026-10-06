/**
 * Operations of rooms departments (e.g. Executive Stay): apartments, their state and rates;
 * bookings (no two stays of an apartment share a night), check-in and check-out; payments and
 * refunds with receipts (see lib/operations/registry.js for the definition format).
 */
import { PERMISSIONS } from "@/lib/permissions";
import { cancelStayOfDepartment, createStay, moveStay, saveRoom, setRoomState, updateStay } from "@/lib/rooms/room-service";
import { recordStayPayment, recordStayRefund } from "@/lib/rooms/stay-money";
import { validateExpense } from "@/lib/departments/expense-validation";
import { addAssets, editAsset, moveAssets } from "@/lib/rooms/asset-service";
import { cancelRepair, completeRepair, reportRepair, updateRepair } from "@/lib/rooms/repair-service";
import { recordCashCount } from "@/lib/departments/cash-count-service";
import { writeIn } from "./helpers";

const MANAGE = writeIn("ROOM_RENTAL", PERMISSIONS.ROOMS_MANAGE);
const BOOK = writeIn("ROOM_RENTAL", PERMISSIONS.ROOMS_BOOK);

export const ROOMS_OPERATIONS = {
  // ─── Apartments ───────────────────────────────────────────────────────────
  "rooms.room.save": { label: "Apartment", access: MANAGE, run: saveRoom },
  /** Available, under maintenance or unavailable (with a note). */
  "rooms.room.state": { label: "Apartment state", access: MANAGE, run: setRoomState },

  // ─── Bookings ─────────────────────────────────────────────────────────────
  /** A booking: no two stays of an apartment share a night. */
  "rooms.stay.create": { label: "Booking", dated: true, access: BOOK, run: (tx, ctx, input) => createStay(tx, ctx, input) },
  /** Guest details, price (with a reason), apartment and dates. */
  "rooms.stay.update": { label: "Booking changed", dated: true, access: BOOK, run: updateStay },
  /** confirm | checkin | checkout (an early check-out may change the price). */
  "rooms.stay.step": { label: "Booking updated", dated: true, access: BOOK, run: moveStay },
  "rooms.stay.cancel": { label: "Booking cancelled", dated: true, access: BOOK, run: cancelStayOfDepartment },

  // ─── Money of bookings ────────────────────────────────────────────────────
  /** Receipt RC-…: who received it, how, reference, proof. */
  "rooms.payment.record": { label: "Payment", money: true, dated: true, access: BOOK, run: recordStayPayment },
  "rooms.refund.record": { label: "Refund", money: true, dated: true, access: BOOK, run: recordStayRefund },

  // ─── Assets of each apartment ─────────────────────────────────────────────
  /** Bought (paid from the drawer: an investment) or already owned. */
  "rooms.asset.add": { label: "Assets added", dated: true, access: MANAGE, run: addAssets },
  /** transfer | damaged | repaired | missing | replaced | removed */
  "rooms.asset.move": { label: "Asset movement", dated: true, access: BOOK, run: moveAssets },
  "rooms.asset.edit": { label: "Asset changed", access: MANAGE, run: editAsset },

  // ─── Maintenance and repairs ──────────────────────────────────────────────
  "rooms.repair.report": { label: "Repair reported", dated: true, access: BOOK, run: reportRepair },
  "rooms.repair.update": { label: "Repair changed", access: BOOK, run: updateRepair },
  /** Actual cost, date, who did it, invoice; paid from the drawer → a repair expense of the apartment. */
  "rooms.repair.complete": { label: "Repair done", dated: true, access: BOOK, run: completeRepair },
  "rooms.repair.cancel": { label: "Repair cancelled", access: BOOK, run: cancelRepair },

  // ─── Expenses and cash ────────────────────────────────────────────────────
  /** The Boss, or a head other than the one who recorded it, validates an expense. */
  "rooms.expense.validate": { label: "Expense validated", access: { write: true, domain: "ROOM_RENTAL", permission: PERMISSIONS.EXPENSES_APPROVE }, run: validateExpense },
  /** The cash counted in the drawer vs what it should hold (a difference needs an explanation). */
  "rooms.cash.count": { label: "Cash count", dated: true, access: { permission: PERMISSIONS.HANDOVER_CREATE, write: true, domain: "ROOM_RENTAL" }, run: recordCashCount },
};
