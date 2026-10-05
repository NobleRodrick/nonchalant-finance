"use server";

import { runAction } from "@/lib/action";
import { operation } from "@/lib/action-context";

/** Rooms department (e.g. Executive Stay): an apartment, its rates and profile. */
export async function saveRoom(input) {
  return runAction("saveRoom", () => operation("rooms.room.save", input));
}

/** state: AVAILABLE | MAINTENANCE | UNAVAILABLE (a note when not available). */
export async function setRoomState(input) {
  return runAction("setRoomState", () => operation("rooms.room.state", input));
}

export async function createStay(input) {
  return runAction("createStay", () => operation("rooms.stay.create", input));
}

export async function updateStay(input) {
  return runAction("updateStay", () => operation("rooms.stay.update", input));
}

/** step: confirm | checkin | checkout */
export async function stepStay(input) {
  return runAction("stepStay", () => operation("rooms.stay.step", input));
}

export async function cancelStay(input) {
  return runAction("cancelStay", () => operation("rooms.stay.cancel", input));
}

export async function recordStayPayment(input) {
  return runAction("recordStayPayment", () => operation("rooms.payment.record", input));
}

export async function recordStayRefund(input) {
  return runAction("recordStayRefund", () => operation("rooms.refund.record", input));
}

/** The Boss or another head validates an expense (optional note). */
export async function validateExpense(input) {
  return runAction("validateExpense", () => operation("rooms.expense.validate", input));
}

export async function recordStayCashCount(input) {
  return runAction("recordStayCashCount", () => operation("rooms.cash.count", input));
}

export async function addRoomAssets(input) {
  return runAction("addRoomAssets", () => operation("rooms.asset.add", input));
}

/** kind: transfer | damaged | repaired | missing | replaced | removed */
export async function moveRoomAssets(input) {
  return runAction("moveRoomAssets", () => operation("rooms.asset.move", input));
}

export async function editRoomAsset(input) {
  return runAction("editRoomAsset", () => operation("rooms.asset.edit", input));
}

export async function reportRepair(input) {
  return runAction("reportRepair", () => operation("rooms.repair.report", input));
}

export async function updateRepair(input) {
  return runAction("updateRepair", () => operation("rooms.repair.update", input));
}

export async function completeRepair(input) {
  return runAction("completeRepair", () => operation("rooms.repair.complete", input));
}

export async function cancelRepair(input) {
  return runAction("cancelRepair", () => operation("rooms.repair.cancel", input));
}
