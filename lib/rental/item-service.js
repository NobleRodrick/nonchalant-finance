/**
 * Stock lines of an event rental department (owner's rules: docs/EVENT_RENTAL_PLAN.md). A line
 * is created with its opening count; afterwards quantities change only through movements
 * (lib/rental/stock-math.js), each under a lock on the line, recorded with a number (SM-0001), the
 * person and the date. Lines are archived, never deleted.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { linkAttachments, usableImage } from "@/lib/attachments";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { CONDITION_LABELS, codePrefix, formatItemCode, inStock, movementEffect } from "./stock-math";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function francs(value, label) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw invalid(`${label} must be a whole number of francs (0 or more).`);
  return n;
}

function count(value, label, { min = 0, max = 1_000_000 } = {}) {
  if (value === undefined || value === null || value === "") return min === 0 ? 0 : null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw invalid(`${label} must be a whole number${min ? ` of at least ${min}` : " (0 or more)"}.`);
  return n;
}

function dateOnly(value, label) {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(value))) throw invalid(`${label} is not a valid date.`);
  return new Date(`${value}T00:00:00.000Z`);
}

/** Locks stock lines in a fixed order (no two operations wait on each other forever). */
export async function lockItems(tx, ids) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rental-item:${id}`}))`;
  }
}

/** A stock line of the department (locked when `lock`). */
export async function itemOf(tx, department, itemId, { lock = true } = {}) {
  if (lock) await lockItems(tx, [itemId || "-"]);
  const item = await tx.rentalItem.findFirst({ where: { id: itemId || "-", departmentId: department.id } });
  if (!item) throw notFound("Item not found in this department.");
  return item;
}

/**
 * Records a movement on a locked line and updates its counters. `extra`: orderId, purchaseId,
 * incidentId, value, note, from (where the units come from), fromLocation, toLocation.
 * Returns the movement.
 */
export async function moveStock(tx, ctx, item, kind, quantity, extra = {}) {
  let effect;
  try {
    effect = movementEffect(item, kind, quantity, extra.from);
  } catch (error) {
    throw invalid(error.message);
  }
  const { from, ...rest } = extra;
  await tx.rentalItem.update({ where: { id: item.id }, data: effect.counters });
  Object.assign(item, effect.counters);
  return tx.rentalMovement.create({
    data: {
      organizationId: ctx.user.organizationId,
      departmentId: ctx.department.id,
      itemId: item.id,
      referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.STOCK_MOVEMENT),
      kind,
      quantity: Math.abs(Number(quantity)),
      ...effect.deltas,
      value: rest.value || 0,
      orderId: rest.orderId || null,
      purchaseId: rest.purchaseId || null,
      incidentId: rest.incidentId || null,
      fromLocation: rest.fromLocation || null,
      toLocation: rest.toLocation || null,
      note: text(rest.note, 300),
      date: ctx.date || ctx.now || new Date(),
      createdById: ctx.user.id,
    },
  });
}

/** The next free code of a prefix ("CHR-004"). */
async function nextCode(tx, departmentId, prefix) {
  const taken = await tx.rentalItem.findMany({ where: { departmentId, code: { startsWith: `${prefix}-` } }, select: { code: true } });
  const max = taken.reduce((m, r) => Math.max(m, Number(r.code.slice(prefix.length + 1)) || 0), 0);
  return formatItemCode(prefix, max + 1);
}

const ITEM_FIELDS = (input) => ({
  name: text(input.name, 120),
  category: text(input.category, 60) || "Other",
  description: text(input.description, 1000),
  unit: text(input.unit, 30) || "piece",
  rentalPrice: francs(input.rentalPrice, "The rental price"),
  purchasePrice: francs(input.purchasePrice, "The purchase price"),
  replacementValue: francs(input.replacementValue, "The replacement value"),
  purchasedOn: dateOnly(input.purchasedOn, "The purchase date"),
  supplier: text(input.supplier, 120),
  condition: CONDITION_LABELS[input.condition] ? input.condition : "GOOD",
  location: text(input.location, 120),
  lowStockLevel: count(input.lowStockLevel, "The low-stock level"),
});

/**
 * Adds a stock line (with its opening count) or changes its details. The code is generated from
 * the name when not given ("Chairs" → CHR-001) and is unique in the department. A photo is the
 * first file sent with the record.
 */
export async function saveItem(tx, ctx, input) {
  const fields = ITEM_FIELDS(input || {});
  if (!fields.name) throw invalid("Name the item (e.g. Chairs, Gold charger plates).");
  const existing = input.id ? await itemOf(tx, ctx.department, input.id) : null;
  let code = text(input.code, 20)?.toUpperCase().replace(/\s+/g, "-") || null;
  if (code && !/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(code)) throw invalid("The code may only use letters, digits and dashes (e.g. CHR-001).");
  if (!code) code = existing?.code || (await nextCode(tx, ctx.department.id, codePrefix(fields.name)));
  const clash = await tx.rentalItem.findFirst({ where: { departmentId: ctx.department.id, code, ...(existing ? { id: { not: existing.id } } : {}) }, select: { name: true } });
  if (clash) throw conflict(`The code ${code} is already used by ${clash.name}.`);
  const sameName = await tx.rentalItem.findFirst({ where: { departmentId: ctx.department.id, name: { equals: fields.name, mode: "insensitive" }, archivedAt: null, ...(existing ? { id: { not: existing.id } } : {}) }, select: { code: true } });
  if (sameName) throw conflict(`An item called ${fields.name} already exists (${sameName.code}).`);

  const photoId = Array.isArray(input.attachmentIds) && input.attachmentIds[0] ? input.attachmentIds[0] : undefined;
  let photoFile = null;
  if (photoId) {
    photoFile = await usableImage(tx, { user: ctx.user, attachmentId: photoId, departmentId: ctx.department.id, entityType: "RentalItem", entityId: existing?.id || null });
  }
  let item;
  if (existing) {
    item = await tx.rentalItem.update({ where: { id: existing.id }, data: { ...fields, code, ...(photoId ? { photoId } : {}), ...(input.removePhoto ? { photoId: null } : {}) } });
    await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_ITEM_UPDATED", entityType: "RentalItem", entityId: item.id, before: pick(existing), after: pick(item) });
  } else {
    item = await tx.rentalItem.create({ data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, ...fields, code, photoId: photoId || null } });
    const opening = count(input.openingQuantity, "The number of units you have now");
    if (opening > 0) await moveStock(tx, ctx, item, "OPENING", opening, { value: opening * fields.purchasePrice, note: text(input.openingNote, 300) });
    await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_ITEM_CREATED", entityType: "RentalItem", entityId: item.id, after: { ...pick(item), opening } });
  }
  if (photoFile && !photoFile.entityId) await linkAttachments(tx, { user: ctx.user, attachmentIds: [photoId], entityType: "RentalItem", entityId: item.id, departmentId: ctx.department.id });
  return { itemId: item.id, code: item.code };
}

const pick = (i) => ({ code: i.code, name: i.name, category: i.category, rentalPrice: i.rentalPrice, purchasePrice: i.purchasePrice, replacementValue: i.replacementValue, condition: i.condition, location: i.location, lowStockLevel: i.lowStockLevel });

/**
 * A count corrected (reason required): `counted` is the number of good units really in the
 * store; the difference changes the units owned. Or the line moved to another storage place.
 */
export async function adjustItem(tx, ctx, input) {
  const item = await itemOf(tx, ctx.department, input?.itemId);
  if (item.archivedAt) throw invalid(`${item.name} is archived.`);
  const reason = text(input.reason, 300);
  if (input.kind === "transfer") {
    const to = text(input.toLocation, 120);
    if (!to) throw invalid("Say where the items are now.");
    if (to === item.location) throw invalid("This is already where the items are kept.");
    const m = await moveStock(tx, ctx, item, "TRANSFERRED", item.owned || 1, { fromLocation: item.location, toLocation: to, note: reason });
    await tx.rentalItem.update({ where: { id: item.id }, data: { location: to } });
    return { itemId: item.id, referenceNo: m.referenceNo };
  }
  const counted = count(input.counted, "The number counted");
  const delta = counted - inStock(item);
  if (delta === 0) throw invalid(`The count is already ${counted}.`);
  if (!reason || reason.length < 3) throw invalid("Give the reason of the correction.");
  const m = await moveStock(tx, ctx, item, "ADJUSTED", delta, { value: Math.abs(delta) * item.purchasePrice, note: reason });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_STOCK_ADJUSTED", entityType: "RentalItem", entityId: item.id, after: { referenceNo: m.referenceNo, counted, change: delta, reason } });
  return { itemId: item.id, referenceNo: m.referenceNo, change: delta };
}

/**
 * Archives a line (no longer offered; its history stays) or brings it back. A line with units out
 * at events or held by a booking to come cannot be archived.
 */
export async function archiveItem(tx, ctx, input) {
  const item = await itemOf(tx, ctx.department, input?.itemId);
  if (input.restore) {
    if (!item.archivedAt) throw invalid(`${item.name} is not archived.`);
    await tx.rentalItem.update({ where: { id: item.id }, data: { archivedAt: null, archiveReason: null, isActive: true } });
    await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_ITEM_RESTORED", entityType: "RentalItem", entityId: item.id });
    return { itemId: item.id, archived: false };
  }
  if (item.archivedAt) throw invalid(`${item.name} is already archived.`);
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Give the reason (e.g. no longer rented, all sold).");
  if (item.out > 0) throw conflict(`${item.out} ${item.name} are out at events. Archive it once they are back.`);
  const held = await tx.rentalOrderLine.count({ where: { itemId: item.id, order: { status: { in: ["CONFIRMED", "PREPARING", "DISPATCHED"] } } } });
  if (held) throw conflict(`${item.name} is in ${held} booking(s) to come. Change them first.`);
  await tx.rentalItem.update({ where: { id: item.id }, data: { archivedAt: new Date(), archiveReason: reason, isActive: false } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_ITEM_ARCHIVED", entityType: "RentalItem", entityId: item.id, after: { reason } });
  return { itemId: item.id, archived: true };
}
