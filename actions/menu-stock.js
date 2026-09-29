"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { departmentContext, operation } from "@/lib/action-context";
import { dishHistory } from "@/lib/restaurant/stock-service";

/** Adds a dish to the menu (name, unit price, plates available now). */
export async function addDish(input) {
  return runAction("addDish", () => operation("dish.create", input));
}

/** Edits a dish's name, unit price, description, cost per plate or low-stock warning. */
export async function editDish(input) {
  return runAction("editDish", async () => (await operation("dish.update", input)).dish);
}

/** Removes a dish from the menu (kept for history; only when it has 0 plates). */
export async function removeDish(input) {
  return runAction("removeDish", async () => (await operation("dish.remove", input)).dish);
}

export async function restoreRemovedDish(input) {
  return runAction("restoreDish", async () => (await operation("dish.restore", input)).dish);
}

/**
 * Adds plates to a dish. Optionally creates the dish inline (name + unit price) and records
 * the purchase that paid for the stock, all in one transaction.
 */
export async function addStockToDish(input) {
  return runAction("addStock", () => operation("stock.add", input));
}

/** Sets a dish to the counted number of plates (correction or spoiled plates). */
export async function correctDishCount(input) {
  return runAction("correctCount", () => operation("stock.correct", input));
}

/** Sets the opening stock of a day for one or more dishes (with a reason). */
export async function setDayOpeningStock(input) {
  return runAction("setOpeningStock", () => operation("stock.opening", input));
}

/** Voids a stock addition or a correction (writes the opposite movement). */
export async function voidStockRecord(input) {
  return runAction("voidStockRecord", () => operation("stock.void", input));
}

export async function getDishHistory(input) {
  return runAction("getDishHistory", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.DEPARTMENT_READ, restaurant: true, read: true });
    return dishHistory({ dishId: input?.dishId, departmentId: ctx.department.id });
  });
}
