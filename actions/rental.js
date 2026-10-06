"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";
import { orgTimezone, requireOrgUser, resolveDepartment } from "@/lib/access";
import { invalid } from "@/lib/errors";
import { isDateKey, toDateKey } from "@/lib/timezone";
import { itemAvailability } from "@/lib/rental/order-queries";

/** Event rental department (e.g. Deco Diva): a stock line and its opening count, or its details. */
export async function saveRentalItem(input) {
  return runAction("saveRentalItem", () => operation("rental.item.save", input));
}

/** kind: "count" (counted, reason) | "transfer" (toLocation). */
export async function adjustRentalItem(input) {
  return runAction("adjustRentalItem", () => operation("rental.item.adjust", input));
}

/** Archive (reason) or restore (restore: true). */
export async function archiveRentalItem(input) {
  return runAction("archiveRentalItem", () => operation("rental.item.archive", input));
}

export async function saveRentalClient(input) {
  return runAction("saveRentalClient", () => operation("rental.client.save", input));
}

/** status: INQUIRY | QUOTED | CONFIRMED (holds the items). */
export async function createRentalOrder(input) {
  return runAction("createRentalOrder", () => operation("rental.order.create", input));
}

export async function updateRentalOrder(input) {
  return runAction("updateRentalOrder", () => operation("rental.order.update", input));
}

/** step: quote | confirm | prepare | close */
export async function stepRentalOrder(input) {
  return runAction("stepRentalOrder", () => operation("rental.order.step", input));
}

export async function cancelRentalOrder(input) {
  return runAction("cancelRentalOrder", () => operation("rental.order.cancel", input));
}

/**
 * What can still be booked over [fromKey, toKey] (the booking being changed left out), for the
 * booking form: every active item with units usable, reserved on the busiest day, available.
 */
export async function rentalAvailability({ departmentId, fromKey, toKey, excludeOrderId = null }) {
  return runAction("rentalAvailability", async () => {
    const user = await requireOrgUser();
    const { department } = await resolveDepartment(user, departmentId, { domain: "MATERIAL_RENTAL" });
    if (!isDateKey(fromKey) || !isDateKey(toKey) || fromKey > toKey) throw invalid("Choose the dispatch and return dates.");
    const todayKey = toDateKey(new Date(), orgTimezone(user));
    return itemAvailability({ departmentId: department.id, fromKey, toKey, excludeOrderId, todayKey });
  });
}

export async function dispatchRentalOrder(input) {
  return runAction("dispatchRentalOrder", () => operation("rental.order.dispatch", input));
}

/** lines: [{ lineId, good, damaged, broken, missing }] */
export async function returnRentalItems(input) {
  return runAction("returnRentalItems", () => operation("rental.order.return", input));
}

export async function reportRentalIncident(input) {
  return runAction("reportRentalIncident", () => operation("rental.incident.report", input));
}

/** decision: charge | loss | repair | found */
export async function settleRentalIncident(input) {
  return runAction("settleRentalIncident", () => operation("rental.incident.settle", input));
}

export async function completeRentalRepair(input) {
  return runAction("completeRentalRepair", () => operation("rental.repair.complete", input));
}

export async function addRentalCharge(input) {
  return runAction("addRentalCharge", () => operation("rental.charge.add", input));
}

export async function voidRentalCharge(input) {
  return runAction("voidRentalCharge", () => operation("rental.charge.void", input));
}

export async function recordRentalPayment(input) {
  return runAction("recordRentalPayment", () => operation("rental.payment.record", input));
}

export async function recordRentalRefund(input) {
  return runAction("recordRentalRefund", () => operation("rental.refund.record", input));
}

export async function saveRentalProfile(input) {
  return runAction("saveRentalProfile", () => operation("rental.profile.save", input));
}

export async function recordRentalPurchase(input) {
  return runAction("recordRentalPurchase", () => operation("rental.purchase.record", input));
}

export async function voidRentalPurchase(input) {
  return runAction("voidRentalPurchase", () => operation("rental.purchase.void", input));
}

export async function saveRentalAsset(input) {
  return runAction("saveRentalAsset", () => operation("rental.asset.save", input));
}

export async function disposeRentalAsset(input) {
  return runAction("disposeRentalAsset", () => operation("rental.asset.dispose", input));
}

export async function countRentalCash(input) {
  return runAction("countRentalCash", () => operation("rental.cash.count", input));
}
