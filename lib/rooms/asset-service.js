/**
 * The asset register of a guest house (owner's rules: one register per apartment, purchase values,
 * no depreciation). A line is an item in an apartment (or in storage: no apartment) with its
 * quantity, how many of them are damaged and the value of one unit. Every change is a movement
 * (AM-0001) recorded with the change, under a lock on the line, so the counts never go wrong:
 *
 *   bought       quantity + n                         (cost; paid from the drawer: an investment)
 *   transferred  n good units leave a line, join the same item in another apartment
 *   damaged      damaged + n (good units)
 *   repaired     damaged − n                          (cost; paid from the drawer: a repair expense)
 *   missing      quantity − n (good first)            loss = n × unit value
 *   replaced     n units out (damaged first) = loss, n new units bought (at their new value)
 *   removed      quantity − n (damaged first)         loss = n × unit value (thrown away, sold …)
 */
import { recordAudit } from "@/lib/audit";
import { invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { postMoneyEntry } from "@/lib/finance/posting-service";
import { ASSET_CATEGORIES } from "./asset-labels";


const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function count(value, label = "The quantity") {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 10000) throw invalid(`${label} must be a whole number of at least 1.`);
  return n;
}

function francs(value, label) {
  const n = Number(value ?? 0);
  if (!Number.isInteger(n) || n < 0) throw invalid(`${label} must be a whole number of francs (0 or more).`);
  return n;
}

async function lockAsset(tx, id) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`room-asset:${id}`}))`;
}

async function roomOf(tx, department, roomId) {
  if (!roomId) return null;
  const room = await tx.room.findFirst({ where: { id: roomId, departmentId: department.id }, select: { id: true, name: true } });
  if (!room) throw notFound("Apartment not found.");
  return room;
}

async function lineOf(tx, department, assetId) {
  await lockAsset(tx, assetId || "-");
  const line = await tx.roomAsset.findFirst({ where: { id: assetId || "-", departmentId: department.id }, include: { room: { select: { id: true, name: true } } } });
  if (!line) throw notFound("Asset not found.");
  return line;
}

/** The line of the same item (name, category, unit value) in an apartment (or storage), created when missing. */
async function lineFor(tx, ctx, { roomId, name, category, unitValue, notes = null }) {
  const found = await tx.roomAsset.findFirst({ where: { departmentId: ctx.department.id, roomId: roomId || null, name: { equals: name, mode: "insensitive" }, category, unitValue } });
  if (found) {
    await lockAsset(tx, found.id);
    return tx.roomAsset.findUnique({ where: { id: found.id } });
  }
  return tx.roomAsset.create({ data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, roomId: roomId || null, name, category, quantity: 0, unitValue, notes } });
}

async function movement(tx, ctx, line, data) {
  const m = await tx.roomAssetMovement.create({
    data: {
      organizationId: ctx.user.organizationId,
      departmentId: ctx.department.id,
      assetId: line.id,
      referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.ASSET_MOVEMENT),
      date: ctx.date || ctx.now,
      createdById: ctx.user.id,
      ...data,
    },
  });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: `ROOM_ASSET_${data.kind}`, entityType: "RoomAsset", entityId: line.id, after: { referenceNo: m.referenceNo, kind: data.kind, quantity: data.quantity, value: data.value, loss: data.loss, cost: data.cost, note: data.note } });
  return m;
}

/** Money paid from the drawer for an asset (bought: investment; repaired: repair expense of the apartment). */
async function payFromDrawer(tx, ctx, { category, amount, roomId, description, input }) {
  if (!input.paidFromDrawer || !amount) return null;
  const counterparty = text(input.counterparty, 120);
  const authorizedByName = text(input.authorizedByName, 80);
  if (!counterparty) throw invalid("Enter the person or vendor paid.");
  if (!authorizedByName) throw invalid("Enter who authorized the expense.");
  const { transaction } = await postMoneyEntry(tx, { ...ctx, type: "EXPENSE", amount, category, paymentMethod: input.paymentMethod || "CASH", counterparty, reference: input.reference, description, roomId, authorizedByName, idempotencyKey: ctx.key ? `${ctx.key}:pay` : null });
  await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: ctx.department.id });
  return transaction;
}

/** New assets in an apartment (or storage): bought now (paid from the drawer or not) or already owned. */
export async function addAssets(tx, ctx, input) {
  const room = await roomOf(tx, ctx.department, input?.roomId);
  const name = text(input.name, 120);
  if (!name) throw invalid("Name the asset (e.g. Samsung TV 43\").");
  const category = ASSET_CATEGORIES[input.category] ? input.category : "OTHER";
  const quantity = count(input.quantity);
  const unitValue = francs(input.unitValue, "The value of one unit");
  const line = await lineFor(tx, ctx, { roomId: room?.id, name, category, unitValue, notes: text(input.notes, 500) });
  const value = quantity * unitValue;
  const paid = await payFromDrawer(tx, ctx, { category: "stay-asset-purchase", amount: value, roomId: room?.id, description: `${quantity} × ${name}${room ? ` for ${room.name}` : ""}`, input });
  await tx.roomAsset.update({ where: { id: line.id }, data: { quantity: { increment: quantity } } });
  const m = await movement(tx, ctx, line, { kind: "BOUGHT", quantity, value, cost: input.alreadyOwned ? 0 : value, transactionId: paid?.id || null, note: text(input.note, 300) || (input.alreadyOwned ? "Already owned (initial count)" : null) });
  if (!paid) await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "RoomAssetMovement", entityId: m.id, departmentId: ctx.department.id });
  return { assetId: line.id, referenceNo: m.referenceNo, transactionReference: paid?.referenceNo || null };
}

/**
 * A movement on one line: transfer | damaged | repaired | missing | replaced | removed (see the
 * rules at the top of this file).
 */
export async function moveAssets(tx, ctx, input) {
  const line = await lineOf(tx, ctx.department, input?.assetId);
  const n = count(input.quantity);
  const good = line.quantity - line.damaged;
  const note = text(input.note, 300);
  const kind = input.kind;
  const where = line.room?.name || "storage";
  let result = {};
  switch (kind) {
    case "transfer": {
      if (n > good) throw invalid(`Only ${good} ${line.name} in good condition in ${where} can be moved.`);
      const to = await roomOf(tx, ctx.department, input.toRoomId);
      if ((to?.id || null) === (line.roomId || null)) throw invalid("Choose another apartment (or storage).");
      const dest = await lineFor(tx, ctx, { roomId: to?.id, name: line.name, category: line.category, unitValue: line.unitValue, notes: line.notes });
      await tx.roomAsset.update({ where: { id: line.id }, data: { quantity: { decrement: n } } });
      await tx.roomAsset.update({ where: { id: dest.id }, data: { quantity: { increment: n } } });
      const out = await movement(tx, ctx, line, { kind: "TRANSFER_OUT", quantity: n, value: n * line.unitValue, otherRoomId: to?.id || null, note });
      await movement(tx, ctx, dest, { kind: "TRANSFER_IN", quantity: n, value: n * line.unitValue, otherRoomId: line.roomId, note });
      result = { referenceNo: out.referenceNo, toAssetId: dest.id };
      break;
    }
    case "damaged": {
      if (n > good) throw invalid(`Only ${good} ${line.name} are in good condition in ${where}.`);
      await tx.roomAsset.update({ where: { id: line.id }, data: { damaged: { increment: n } } });
      result = await movement(tx, ctx, line, { kind: "DAMAGED", quantity: n, value: n * line.unitValue, note });
      break;
    }
    case "repaired": {
      if (n > line.damaged) throw invalid(`Only ${line.damaged} ${line.name} are damaged in ${where}.`);
      const cost = francs(input.cost, "The cost of the repair");
      const paid = await payFromDrawer(tx, ctx, { category: "stay-repairs", amount: cost, roomId: line.roomId, description: `Repair of ${n} × ${line.name}${line.room ? ` (${line.room.name})` : ""}`, input });
      await tx.roomAsset.update({ where: { id: line.id }, data: { damaged: { decrement: n } } });
      result = await movement(tx, ctx, line, { kind: "REPAIRED", quantity: n, value: n * line.unitValue, cost, transactionId: paid?.id || null, note });
      break;
    }
    case "missing": {
      if (n > line.quantity) throw invalid(`Only ${line.quantity} ${line.name} are registered in ${where}.`);
      if (!note) throw invalid("Say what is known (when it was noticed, who was in the apartment …).");
      const fromDamaged = Math.max(0, n - good);
      await tx.roomAsset.update({ where: { id: line.id }, data: { quantity: { decrement: n }, damaged: { decrement: fromDamaged } } });
      result = await movement(tx, ctx, line, { kind: "MISSING", quantity: n, loss: n * line.unitValue, note });
      break;
    }
    case "removed":
    case "replaced": {
      if (n > line.quantity) throw invalid(`Only ${line.quantity} ${line.name} are registered in ${where}.`);
      if (!note && kind === "removed") throw invalid("Say why they leave the register (thrown away, sold …).");
      const fromDamaged = Math.min(n, line.damaged);
      await tx.roomAsset.update({ where: { id: line.id }, data: { quantity: { decrement: n }, damaged: { decrement: fromDamaged } } });
      result = await movement(tx, ctx, line, { kind: kind === "removed" ? "REMOVED" : "REPLACED", quantity: n, loss: n * line.unitValue, note });
      if (kind === "replaced") {
        // The new units: bought at their own value into the same apartment.
        const unitValue = francs(input.newUnitValue ?? line.unitValue, "The value of a new unit");
        const fresh = await lineFor(tx, ctx, { roomId: line.roomId, name: line.name, category: line.category, unitValue, notes: line.notes });
        const value = n * unitValue;
        const paid = await payFromDrawer(tx, ctx, { category: "stay-asset-purchase", amount: value, roomId: line.roomId, description: `${n} × ${line.name} replaced${line.room ? ` (${line.room.name})` : ""}`, input });
        await tx.roomAsset.update({ where: { id: fresh.id }, data: { quantity: { increment: n } } });
        const bought = await movement(tx, ctx, fresh, { kind: "BOUGHT", quantity: n, value, cost: value, transactionId: paid?.id || null, note: `Replacement (${result.referenceNo})` });
        result = { ...result, newAssetId: fresh.id, boughtReference: bought.referenceNo };
      }
      break;
    }
    default:
      throw invalid("Choose what happened: moved, damaged, repaired, missing, replaced or removed.");
  }
  if (result.id && !result.transactionId) await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "RoomAssetMovement", entityId: result.id, departmentId: ctx.department.id });
  return { assetId: line.id, referenceNo: result.referenceNo, ...(result.toAssetId ? { toAssetId: result.toAssetId } : {}), ...(result.newAssetId ? { newAssetId: result.newAssetId, boughtReference: result.boughtReference } : {}) };
}

/** Name, category, notes of a line (its value stays: values change through replacements). */
export async function editAsset(tx, ctx, input) {
  const line = await lineOf(tx, ctx.department, input?.assetId);
  const name = text(input.name, 120) || line.name;
  const category = ASSET_CATEGORIES[input.category] ? input.category : line.category;
  await tx.roomAsset.update({ where: { id: line.id }, data: { name, category, notes: input.notes === undefined ? line.notes : text(input.notes, 500) } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "ROOM_ASSET_EDITED", entityType: "RoomAsset", entityId: line.id, before: { name: line.name, category: line.category }, after: { name, category } });
  return { assetId: line.id };
}
