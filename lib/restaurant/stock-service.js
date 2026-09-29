/**
 * Plate stock operations (database). Every change:
 *  - is one conditional UPDATE of the dish's cached plates (no oversell, no negative stock,
 *    even with two cashiers at the same moment);
 *  - writes one StockMovement with the balance after it and a reference number;
 *  - is refused on a locked day (report sent) or in a closed accounting period;
 *  - writes an audit event.
 * Functions take the Prisma transaction client `tx` of the calling action.
 */
import { db } from "@/lib/prisma";
import { conflict, invalid, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { assertCanPost } from "@/lib/posting-guard";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { dayBounds, startOfDateKey, DEFAULT_TIMEZONE } from "@/lib/timezone";
import {
  dayPositionsFromCurrent,
  valuePositions,
  movementDelta,
  minimumOpening,
  plates,
} from "@/lib/restaurant/stock-math";

/** Whole, positive number of plates or a validation error. */
export function requirePlates(value, label = "Plates", { allowZero = false } = {}) {
  const n = Number(value);
  if (!Number.isFinite(n) || !Number.isInteger(n)) throw invalid(`${label} must be a whole number.`);
  if (allowZero ? n < 0 : n <= 0) throw invalid(`${label} must be ${allowZero ? "0 or more" : "more than 0"}.`);
  if (n > 1_000_000) throw invalid(`${label} is too large.`);
  return n;
}

/**
 * Applies a movement to a dish. `quantity` is stored as given (signed for corrections,
 * opening corrections and voids); its effect on plates is movementDelta().
 */
export async function moveDish(tx, {
  dish, type, quantity, date = new Date(), reason = null, notes = null, referenceNo = null,
  transactionId = null, purchaseId = null, user,
}) {
  const delta = movementDelta({ type, quantity });
  const where = { id: dish.id };
  if (delta < 0) where.currentQuantity = { gte: -delta };
  const res = await tx.menuItem.updateMany({ where, data: { currentQuantity: { increment: delta } } });
  if (res.count !== 1) {
    const fresh = await tx.menuItem.findUnique({ where: { id: dish.id }, select: { name: true, currentQuantity: true } });
    throw conflict(
      `Only ${plates(fresh?.currentQuantity)} plate(s) of "${fresh?.name || dish.name}" left. ` +
        "Reduce the quantity or add stock first."
    );
  }
  const updated = await tx.menuItem.findUnique({ where: { id: dish.id } });
  const movement = await tx.stockMovement.create({
    data: {
      type,
      quantity,
      unitCost: dish.costPrice ?? 0,
      balanceAfter: updated.currentQuantity,
      date,
      reason,
      notes,
      referenceNo,
      transactionId,
      purchaseId,
      menuItemId: dish.id,
      organizationId: dish.organizationId,
      departmentId: dish.departmentId,
      userId: user.id,
    },
  });
  return { dish: updated, movement };
}

async function loadDishForWrite(tx, user, departmentId, dishId) {
  const dish = await tx.menuItem.findFirst({
    where: { id: dishId, departmentId, organizationId: user.organizationId },
  });
  if (!dish) throw notFound("Dish not found in this department.");
  return dish;
}

/** Plates of a dish at an instant (current minus everything after it). */
async function platesAt(tx, dish, instant) {
  const after = await tx.stockMovement.findMany({
    where: { menuItemId: dish.id, date: { gt: instant } },
    select: { type: true, quantity: true },
  });
  return plates(dish.currentQuantity) - after.reduce((s, m) => s + movementDelta(m), 0);
}

/** Lowest plates the dish may hold at `instant` so no later movement goes negative. */
async function minimumAt(tx, dish, instant, { excludeOpeningCorrectionAt = null } = {}) {
  const later = await tx.stockMovement.findMany({
    where: { menuItemId: dish.id, date: { gt: instant } },
    select: { type: true, quantity: true, date: true },
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return minimumOpening(
    later.filter((m) => !(excludeOpeningCorrectionAt && m.type === "OPENING_CORRECTION" && new Date(m.date).getTime() === excludeOpeningCorrectionAt.getTime()))
  );
}

// ─── Operations ──────────────────────────────────────────────────────────────

export async function createDish(tx, { user, department, input, timeZone = DEFAULT_TIMEZONE }) {
  const name = String(input?.name || "").trim().replace(/\s+/g, " ");
  if (name.length < 2) throw invalid("Enter the dish name (at least 2 characters).");
  if (name.length > 80) throw invalid("The dish name is too long (80 characters maximum).");
  const unitPrice = requirePlates(input?.unitPrice, "Unit price");
  const opening = requirePlates(input?.openingPlates ?? 0, "Plates available now", { allowZero: true });
  const costPrice = input?.costPrice ? requirePlates(input.costPrice, "Cost per plate", { allowZero: true }) : 0;
  const lowStockLevel = input?.lowStockLevel ? requirePlates(input.lowStockLevel, "Low-stock warning", { allowZero: true }) : 0;

  const clash = await tx.menuItem.findFirst({
    where: { departmentId: department.id, name: { equals: name, mode: "insensitive" } },
    select: { isActive: true },
  });
  if (clash) {
    throw conflict(
      clash.isActive
        ? `A dish called "${name}" is already on the menu.`
        : `A removed dish called "${name}" exists. Restore it from "Show removed dishes" instead.`
    );
  }
  const now = new Date();
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date: now, timeZone });
  const dish = await tx.menuItem.create({
    data: {
      name,
      description: String(input?.description || "").trim() || null,
      section: String(input?.section || "").trim() || null,
      sellingPrice: unitPrice,
      costPrice,
      lowStockLevel,
      currentQuantity: 0,
      organizationId: user.organizationId,
      departmentId: department.id,
      userId: user.id,
    },
  });
  let movement = null;
  if (opening > 0) {
    const referenceNo = await nextReference(tx, department.id, DOC_TYPES.STOCK_ADDED);
    ({ movement } = await moveDish(tx, { dish, type: "OPENING", quantity: opening, date: now, referenceNo, reason: "Opening stock", user }));
  }
  await recordAudit(tx, {
    user, departmentId: department.id, action: "DISH_CREATED", entityType: "MenuItem", entityId: dish.id,
    after: { name, unitPrice, openingPlates: opening },
  });
  return { dish, movement };
}

export async function updateDish(tx, { user, department, input }) {
  const dish = await loadDishForWrite(tx, user, department.id, input?.id);
  const data = {};
  if (input.name !== undefined) {
    const name = String(input.name).trim().replace(/\s+/g, " ");
    if (name.length < 2) throw invalid("Enter the dish name (at least 2 characters).");
    if (name.toLowerCase() !== dish.name.toLowerCase()) {
      const clash = await tx.menuItem.findFirst({
        where: { departmentId: department.id, id: { not: dish.id }, name: { equals: name, mode: "insensitive" } },
      });
      if (clash) throw conflict(`Another dish is already called "${name}".`);
    }
    data.name = name;
  }
  if (input.unitPrice !== undefined) data.sellingPrice = requirePlates(input.unitPrice, "Unit price");
  if (input.costPrice !== undefined) data.costPrice = input.costPrice === "" || input.costPrice === null ? 0 : requirePlates(input.costPrice, "Cost per plate", { allowZero: true });
  if (input.lowStockLevel !== undefined) data.lowStockLevel = input.lowStockLevel === "" || input.lowStockLevel === null ? 0 : requirePlates(input.lowStockLevel, "Low-stock warning", { allowZero: true });
  if (input.description !== undefined) data.description = String(input.description || "").trim() || null;
  if (input.section !== undefined) data.section = String(input.section || "").trim() || null;
  const updated = await tx.menuItem.update({ where: { id: dish.id }, data });
  await recordAudit(tx, {
    user, departmentId: department.id, action: "DISH_UPDATED", entityType: "MenuItem", entityId: dish.id,
    before: { name: dish.name, unitPrice: dish.sellingPrice, costPrice: dish.costPrice, description: dish.description },
    after: { name: updated.name, unitPrice: updated.sellingPrice, costPrice: updated.costPrice, description: updated.description },
  });
  return updated;
}

export async function archiveDish(tx, { user, department, dishId }) {
  const dish = await loadDishForWrite(tx, user, department.id, dishId);
  if (!dish.isActive) return dish;
  if (plates(dish.currentQuantity) !== 0) {
    throw conflict(
      `"${dish.name}" still has ${plates(dish.currentQuantity)} plate(s) in stock. ` +
        'Use "Correct count" to bring it to 0 first (with the reason), then remove it.'
    );
  }
  const updated = await tx.menuItem.update({ where: { id: dish.id }, data: { isActive: false, archivedAt: new Date() } });
  await recordAudit(tx, { user, departmentId: department.id, action: "DISH_REMOVED", entityType: "MenuItem", entityId: dish.id, before: { isActive: true }, after: { isActive: false } });
  return updated;
}

export async function restoreDish(tx, { user, department, dishId }) {
  const dish = await loadDishForWrite(tx, user, department.id, dishId);
  const updated = await tx.menuItem.update({ where: { id: dish.id }, data: { isActive: true, archivedAt: null } });
  await recordAudit(tx, { user, departmentId: department.id, action: "DISH_RESTORED", entityType: "MenuItem", entityId: dish.id, before: { isActive: false }, after: { isActive: true } });
  return updated;
}

/** Adds plates to a dish (optionally created inline) dated `date`. */
export async function addStock(tx, { user, department, dishId, platesAdded, date, note, purchaseId = null, timeZone = DEFAULT_TIMEZONE }) {
  const dish = await loadDishForWrite(tx, user, department.id, dishId);
  if (!dish.isActive) throw conflict(`"${dish.name}" was removed from the menu. Restore it first.`);
  const qty = requirePlates(platesAdded, "Plates added");
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const referenceNo = await nextReference(tx, department.id, DOC_TYPES.STOCK_ADDED);
  const res = await moveDish(tx, {
    dish, type: "STOCK_ADDED", quantity: qty, date, referenceNo, purchaseId,
    notes: String(note || "").trim() || null, user,
  });
  await recordAudit(tx, {
    user, departmentId: department.id, action: "STOCK_ADDED", entityType: "StockMovement", entityId: res.movement.id,
    after: { dish: dish.name, plates: qty, referenceNo, purchaseId },
  });
  return res;
}

export const CORRECTION_REASONS = {
  COUNT: "Physical count",
  SPOILED: "Spoiled / thrown away",
  STAFF: "Given to staff",
  OTHER: "Other",
};

/**
 * Sets the plates of a dish to what was counted, at `date`. A lower count with reason
 * SPOILED is recorded as spoiled plates; anything else is a signed correction.
 */
export async function correctCount(tx, { user, department, dishId, counted, reasonType = "COUNT", reasonText = "", date, timeZone = DEFAULT_TIMEZONE }) {
  const dish = await loadDishForWrite(tx, user, department.id, dishId);
  const target = requirePlates(counted, "Counted plates", { allowZero: true });
  if (!CORRECTION_REASONS[reasonType]) throw invalid("Choose a reason for the correction.");
  const reason = [CORRECTION_REASONS[reasonType], String(reasonText || "").trim()].filter(Boolean).join(": ");
  if (reasonType === "OTHER" && !String(reasonText || "").trim()) throw invalid("Describe the reason for the correction.");
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });

  const expected = await platesAt(tx, dish, date);
  const delta = target - expected;
  if (delta === 0) throw invalid(`The count matches the system (${expected} plates). Nothing to correct.`);
  const min = await minimumAt(tx, dish, date);
  if (target < min) {
    throw conflict(`"${dish.name}" sold or used ${min} plate(s) after this time. The count cannot be lower than ${min}.`);
  }
  if (reasonType === "SPOILED" && delta > 0) throw invalid("Spoiled plates can only lower the count.");
  const referenceNo = await nextReference(tx, department.id, DOC_TYPES.CORRECTION);
  const type = reasonType === "SPOILED" ? "SPOILED" : "CORRECTION";
  const quantity = type === "SPOILED" ? -delta : delta;
  // Apply directly to the cache (a past-day correction shifts every later balance equally).
  const res = await moveDish(tx, { dish, type, quantity, date, reason, referenceNo, user });
  await recordAudit(tx, {
    user, departmentId: department.id, action: "STOCK_CORRECTED", entityType: "StockMovement", entityId: res.movement.id,
    before: { plates: expected }, after: { plates: target, reason, referenceNo },
  });
  return { ...res, expected, delta };
}

/**
 * Sets the opening stock of day `dateKey` for one or more dishes. Each change is an
 * OPENING_CORRECTION dated exactly at the start of the day, so the day's opening, closing,
 * every later day and the stock value are recalculated from it.
 */
export async function setOpeningStock(tx, { user, department, dateKey, entries, reason, timeZone = DEFAULT_TIMEZONE }) {
  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 3) throw invalid("Give a reason for changing the opening stock (for example \"Morning count\").");
  const start = startOfDateKey(dateKey, timeZone);
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date: start, timeZone });
  const results = [];
  for (const entry of entries || []) {
    const dish = await loadDishForWrite(tx, user, department.id, entry.dishId);
    const actual = requirePlates(entry.actual, `Opening of "${dish.name}"`, { allowZero: true });
    // Opening now = plates just before the day + corrections already made at the start.
    const before = await platesAt(tx, dish, new Date(start.getTime() - 1));
    const existing = await tx.stockMovement.findMany({
      where: { menuItemId: dish.id, type: "OPENING_CORRECTION", date: start },
      select: { type: true, quantity: true },
    });
    const opening = before + existing.reduce((s, m) => s + movementDelta(m), 0);
    const delta = actual - opening;
    if (delta === 0) continue;
    const min = await minimumAt(tx, dish, new Date(start.getTime() - 1), { excludeOpeningCorrectionAt: start });
    if (actual < min) {
      throw conflict(`"${dish.name}": ${min} plate(s) were already sold or used from this day on. The opening cannot be lower than ${min}.`);
    }
    const referenceNo = await nextReference(tx, department.id, DOC_TYPES.CORRECTION);
    const res = await moveDish(tx, {
      dish, type: "OPENING_CORRECTION", quantity: delta, date: start, reason: cleanReason, referenceNo, user,
    });
    await recordAudit(tx, {
      user, departmentId: department.id, action: "OPENING_STOCK_SET", entityType: "StockMovement", entityId: res.movement.id,
      before: { dateKey, opening }, after: { dateKey, opening: actual, reason: cleanReason, referenceNo },
    });
    results.push({ dishId: dish.id, name: dish.name, from: opening, to: actual, referenceNo });
  }
  return results;
}

/** Voids a stock addition or correction by writing the opposite movement. */
export async function voidStockMovement(tx, { user, department, movementId, reason, timeZone = DEFAULT_TIMEZONE }) {
  const cleanReason = String(reason || "").trim();
  if (cleanReason.length < 3) throw invalid("Give a reason for voiding (at least 3 characters).");
  const mv = await tx.stockMovement.findFirst({
    where: { id: movementId, departmentId: department.id, organizationId: user.organizationId },
    include: { menuItem: true },
  });
  if (!mv || !mv.menuItem) throw notFound("Stock record not found.");
  if (!["STOCK_ADDED", "CORRECTION", "SPOILED", "OPENING_CORRECTION"].includes(mv.type)) {
    throw invalid("Only stock additions and corrections can be voided here. Void the sale or purchase instead.");
  }
  if (mv.voidedAt) throw conflict("This record is already voided.");
  if (mv.purchaseId && mv.type === "STOCK_ADDED") throw invalid("This stock came with a purchase. Void the purchase instead.");
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date: mv.date, timeZone });
  const opposite = -Number(mv.quantity);
  // The compensating movement is dated like the original so the day's figures are restored.
  const res = await moveDish(tx, {
    dish: mv.menuItem, type: mv.type, quantity: opposite, date: mv.date,
    reason: `Void of ${mv.referenceNo || "record"}: ${cleanReason}`, referenceNo: mv.referenceNo, user,
  });
  await tx.stockMovement.update({ where: { id: mv.id }, data: { voidedAt: new Date() } });
  await tx.stockMovement.update({ where: { id: res.movement.id }, data: { voidedAt: new Date() } });
  await recordAudit(tx, {
    user, departmentId: department.id, action: "STOCK_RECORD_VOIDED", entityType: "StockMovement", entityId: mv.id,
    before: { type: mv.type, quantity: mv.quantity }, after: { voided: true, reason: cleanReason },
  });
  return res;
}

// ─── Reading ─────────────────────────────────────────────────────────────────

/**
 * Menu & Stock for one day: every dish with Opening / Added / Sold / Spoiled / Corrected /
 * Closing plates and values, plus totals. Past days are reconstructed from movements.
 */
export async function loadDayStock({ departmentId, dateKey, timeZone = DEFAULT_TIMEZONE, includeArchived = false, client = db }) {
  const { start, end } = dayBounds(startOfDateKey(dateKey, timeZone), timeZone);
  // Both queries run together; movements of dishes not listed are ignored by the maths.
  const [dishes, movements] = await Promise.all([
    client.menuItem.findMany({
      where: { departmentId, ...(includeArchived ? {} : { OR: [{ isActive: true }, { archivedAt: { gte: start } }] }) },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    client.stockMovement.findMany({
      where: { departmentId, menuItemId: { not: null }, date: { gte: start } },
      select: { menuItemId: true, type: true, quantity: true, date: true },
    }),
  ]);
  const created = dishes.filter((d) => new Date(d.createdAt) <= end);
  const positions = dayPositionsFromCurrent(created, movements, start, end);
  const valued = valuePositions(positions);
  const meta = new Map(dishes.map((d) => [d.id, d]));
  valued.rows = valued.rows.map((r) => {
    const d = meta.get(r.dishId);
    return { ...r, description: d.description, isActive: d.isActive, available: plates(d.currentQuantity) };
  });
  return { dateKey, start, end, ...valued };
}

/** Movement history of one dish, newest first, with links to sales and purchases. */
export async function dishHistory({ dishId, departmentId, take = 200, client = db }) {
  return client.stockMovement.findMany({
    where: { menuItemId: dishId, departmentId },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
    include: {
      user: { select: { name: true } },
      transaction: { select: { id: true, referenceNo: true, type: true, status: true } },
      purchase: { select: { id: true, transaction: { select: { referenceNo: true } } } },
    },
  });
}
