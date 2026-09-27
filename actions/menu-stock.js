"use server";

import { runAction } from "@/lib/action";
import { PERMISSIONS } from "@/lib/permissions";
import { departmentContext, change, recordDate } from "@/lib/action-context";
import { invalid } from "@/lib/errors";
import { isDateKey, toDateKey } from "@/lib/timezone";
import {
  createDish,
  updateDish,
  archiveDish,
  restoreDish,
  addStock,
  correctCount,
  setOpeningStock,
  voidStockMovement,
  dishHistory,
} from "@/lib/restaurant/stock-service";
import { postPurchase } from "@/lib/finance/posting-service";
import { linkAttachments } from "@/lib/attachments";
import { normalizeIdempotencyKey } from "@/lib/idempotency";

const MANAGE = { permission: PERMISSIONS.INVENTORY_MANAGE, write: true, restaurant: true };

/** Adds a dish to the menu (name, unit price, plates available now). */
export async function addDish(input) {
  return runAction("addDish", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    return change((tx) => createDish(tx, { ...ctx, input }));
  });
}

/** Edits a dish's name, unit price, description, cost per plate or low-stock warning. */
export async function editDish(input) {
  return runAction("editDish", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    return change((tx) => updateDish(tx, { ...ctx, input }));
  });
}

/** Removes a dish from the menu (kept for history; only when it has 0 plates). */
export async function removeDish(input) {
  return runAction("removeDish", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    return change((tx) => archiveDish(tx, { ...ctx, dishId: input?.dishId }));
  });
}

export async function restoreRemovedDish(input) {
  return runAction("restoreDish", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    return change((tx) => restoreDish(tx, { ...ctx, dishId: input?.dishId }));
  });
}

/**
 * Adds plates to a dish. Optionally creates the dish inline (name + unit price) and records
 * the purchase that paid for the stock, all in one transaction.
 */
export async function addStockToDish(input) {
  return runAction("addStock", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    const date = recordDate(input?.dateKey, ctx.timeZone);
    const bought = Boolean(input?.bought);
    if (bought && !Number(input?.amountPaid)) throw invalid("Enter the amount paid for this stock.");
    return change(async (tx) => {
      let dishId = input?.dishId;
      let created = null;
      if (!dishId && input?.newDish) {
        created = await createDish(tx, { ...ctx, input: { ...input.newDish, openingPlates: 0 } });
        dishId = created.dish.id;
      }
      if (!dishId) throw invalid("Choose a dish.");
      if (bought) {
        const res = await postPurchase(tx, {
          ...ctx,
          supplier: input?.supplier,
          amount: Number(input?.amountPaid),
          category: "purchase-ready",
          paymentMethod: input?.paymentMethod || "CASH",
          reference: input?.reference,
          notes: input?.note,
          date,
          stockAdds: [{ dishId, plates: input?.plates }],
          idempotencyKey: normalizeIdempotencyKey(input?.idempotencyKey),
          timeZone: ctx.timeZone,
        });
        await linkAttachments(tx, { user: ctx.user, attachmentIds: input?.attachmentIds, entityType: "Transaction", entityId: res.transaction.id, departmentId: ctx.department.id });
        return { movement: res.stockAdds[0], purchase: res.transaction, createdDish: created?.dish || null };
      }
      const res = await addStock(tx, { ...ctx, dishId, platesAdded: input?.plates, date, note: input?.note });
      return { movement: res.movement, purchase: null, createdDish: created?.dish || null };
    });
  });
}

/** Sets a dish to the counted number of plates (correction or spoiled plates). */
export async function correctDishCount(input) {
  return runAction("correctCount", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    const date = recordDate(input?.dateKey, ctx.timeZone);
    return change((tx) =>
      correctCount(tx, { ...ctx, dishId: input?.dishId, counted: input?.counted, reasonType: input?.reasonType, reasonText: input?.reasonText, date })
    );
  });
}

/** Sets the opening stock of a day for one or more dishes (with a reason). */
export async function setDayOpeningStock(input) {
  return runAction("setOpeningStock", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    const dateKey = isDateKey(input?.dateKey) ? input.dateKey : toDateKey(new Date(), ctx.timeZone);
    if (dateKey > toDateKey(new Date(), ctx.timeZone)) throw invalid("You cannot set the opening stock of a future day.");
    const entries = Array.isArray(input?.entries) ? input.entries : [];
    if (!entries.length) throw invalid("Enter at least one opening quantity.");
    return change((tx) => setOpeningStock(tx, { ...ctx, dateKey, entries, reason: input?.reason }));
  });
}

/** Voids a stock addition or a correction (writes the opposite movement). */
export async function voidStockRecord(input) {
  return runAction("voidStockRecord", async () => {
    const ctx = await departmentContext(input?.departmentId, MANAGE);
    return change((tx) => voidStockMovement(tx, { ...ctx, movementId: input?.movementId, reason: input?.reason }));
  });
}

export async function getDishHistory(input) {
  return runAction("getDishHistory", async () => {
    const ctx = await departmentContext(input?.departmentId, { permission: PERMISSIONS.DEPARTMENT_READ, restaurant: true });
    return dishHistory({ dishId: input?.dishId, departmentId: ctx.department.id });
  });
}
