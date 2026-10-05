"use server";

import { runAction } from "@/lib/action";
import { departmentContext, operation } from "@/lib/action-context";
import { PERMISSIONS } from "@/lib/permissions";
import { searchClients } from "@/lib/venue/booking-queries";

/** Event venue: the hall (name, capacity, base price, reservation hold). */
export async function saveHall(input) {
  return runAction("saveHall", () => operation("venue.hall.save", input));
}

/** Event venue: a price for a day of the week, a season or a special date. */
export async function savePriceRule(input) {
  return runAction("savePriceRule", () => operation("venue.price.save", input));
}

export async function removePriceRule(input) {
  return runAction("removePriceRule", () => operation("venue.price.remove", input));
}

// ─── Clients and bookings (forms use the offline recorder; these serve tests and scripts) ───

export async function saveVenueClient(input) {
  return runAction("saveVenueClient", () => operation("venue.client.save", input));
}

export async function createBooking(input) {
  return runAction("createBooking", () => operation("venue.booking.create", input));
}

export async function updateBooking(input) {
  return runAction("updateBooking", () => operation("venue.booking.update", input));
}

export async function moveBooking(input) {
  return runAction("moveBooking", () => operation("venue.booking.move", input));
}

export async function confirmBooking(input) {
  return runAction("confirmBooking", () => operation("venue.booking.confirm", input));
}

export async function completeBooking(input) {
  return runAction("completeBooking", () => operation("venue.booking.complete", input));
}

export async function cancelBooking(input) {
  return runAction("cancelBooking", () => operation("venue.booking.cancel", input));
}

export async function extendBookingHold(input) {
  return runAction("extendBookingHold", () => operation("venue.booking.hold", input));
}

/** Clients matching a name or phone (booking form). */
export async function findVenueClients(input) {
  return runAction("findVenueClients", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.DEPARTMENT_READ, domain: "EVENT_VENUE", read: true });
    return searchClients({ departmentId: ctx.department.id, q: input?.q });
  });
}

// ─── Payments, refunds and charges ──────────────────────────────────────────

export async function recordBookingPayment(input) {
  return runAction("recordBookingPayment", () => operation("venue.payment.record", input));
}

export async function recordBookingRefund(input) {
  return runAction("recordBookingRefund", () => operation("venue.refund.record", input));
}

export async function addBookingCharge(input) {
  return runAction("addBookingCharge", () => operation("venue.charge.add", input));
}

export async function voidBookingCharge(input) {
  return runAction("voidBookingCharge", () => operation("venue.charge.void", input));
}

// ─── Packages and package rooms ─────────────────────────────────────────────

export async function savePackage(input) {
  return runAction("savePackage", () => operation("venue.package.save", input));
}

export async function setPackageActive(input) {
  return runAction("setPackageActive", () => operation("venue.package.active", input));
}

export async function removePackage(input) {
  return runAction("removePackage", () => operation("venue.package.remove", input));
}

export async function allocatePackageRoom(input) {
  return runAction("allocatePackageRoom", () => operation("venue.room.allocate", input));
}

export async function releasePackageRoom(input) {
  return runAction("releasePackageRoom", () => operation("venue.room.release", input));
}

// ─── Assets ──────────────────────────────────────────────────────────────────

export async function saveVenueAsset(input) {
  return runAction("saveVenueAsset", () => operation("venue.asset.save", input));
}

export async function saveAssetCheck(input) {
  return runAction("saveAssetCheck", () => operation("venue.check.save", input));
}

export async function settleAssetIncident(input) {
  return runAction("settleAssetIncident", () => operation("venue.incident.settle", input));
}

// ─── Leads ───────────────────────────────────────────────────────────────────

export async function saveLead(input) {
  return runAction("saveLead", () => operation("venue.lead.save", input));
}

export async function setLeadStatus(input) {
  return runAction("setLeadStatus", () => operation("venue.lead.status", input));
}

/** The cash counted in the drawer today. */
export async function recordCashCount(input) {
  return runAction("recordCashCount", () => operation("venue.cash.count", input));
}
