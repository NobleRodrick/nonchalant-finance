/** Reading the asset register of a guest house for pages and reports (scoped to the department). */
import { db } from "@/lib/prisma";

/** Every line with its apartment, good units and value; empty lines (all gone) only when asked. */
export async function assetRegister({ departmentId, roomId, includeEmpty = false, client = db }) {
  const rows = await client.roomAsset.findMany({
    where: { departmentId, ...(roomId !== undefined ? { roomId } : {}), ...(includeEmpty ? {} : { quantity: { gt: 0 } }) },
    include: { room: { select: { id: true, name: true } } },
    orderBy: [{ roomId: "asc" }, { category: "asc" }, { name: "asc" }],
  });
  return rows.map((a) => ({ ...a, good: a.quantity - a.damaged, value: a.quantity * a.unitValue }));
}

/** Register totals: value, units, damaged units — for the house and per apartment (key "" = storage). */
export function registerTotals(lines) {
  const byRoom = {};
  const total = { value: 0, units: 0, damaged: 0, damagedValue: 0 };
  for (const l of lines) {
    const k = l.roomId || "";
    byRoom[k] ||= { value: 0, units: 0, damaged: 0, damagedValue: 0 };
    for (const t of [total, byRoom[k]]) {
      t.value += l.quantity * l.unitValue;
      t.units += l.quantity;
      t.damaged += l.damaged;
      t.damagedValue += l.damaged * l.unitValue;
    }
  }
  return { total, byRoom };
}

/** Movements of [start, end] (newest first), with their asset, apartment and proof. */
export async function assetMovements({ departmentId, start, end, roomId, take = 500, client = db }) {
  const rows = await client.roomAssetMovement.findMany({
    where: { departmentId, ...(start ? { date: { gte: start, lte: end } } : {}), ...(roomId !== undefined ? { asset: { roomId } } : {}) },
    include: { asset: { select: { id: true, name: true, category: true, unitValue: true, room: { select: { id: true, name: true } } } }, createdBy: { select: { name: true } } },
    orderBy: { date: "desc" },
    take,
  });
  const ids = rows.map((r) => r.id);
  const txIds = rows.map((r) => r.transactionId).filter(Boolean);
  const [files, rooms] = await Promise.all([
    ids.length || txIds.length ? client.attachment.findMany({ where: { OR: [{ entityType: "RoomAssetMovement", entityId: { in: ids } }, { entityType: "Transaction", entityId: { in: txIds } }] }, select: { id: true, entityId: true, fileName: true } }) : [],
    client.room.findMany({ where: { departmentId }, select: { id: true, name: true } }),
  ]);
  const roomName = Object.fromEntries(rooms.map((r) => [r.id, r.name]));
  return rows.map((m) => ({ ...m, otherRoomName: m.otherRoomId ? roomName[m.otherRoomId] : null, proofs: files.filter((f) => f.entityId === m.id || f.entityId === m.transactionId).map((f) => ({ id: f.id, fileName: f.fileName })) }));
}

/** What the movements of a period add up to (asset report; losses are a cost of the income statement). */
export function movementTotals(movements) {
  const t = { bought: 0, boughtValue: 0, purchaseCost: 0, damaged: 0, repaired: 0, repairCost: 0, missing: 0, removed: 0, replaced: 0, transfers: 0, loss: 0 };
  for (const m of movements) {
    if (m.kind === "BOUGHT") { t.bought += m.quantity; t.boughtValue += m.value; t.purchaseCost += m.cost; }
    if (m.kind === "DAMAGED") t.damaged += m.quantity;
    if (m.kind === "REPAIRED") { t.repaired += m.quantity; t.repairCost += m.cost; }
    if (m.kind === "MISSING") t.missing += m.quantity;
    if (m.kind === "REMOVED") t.removed += m.quantity;
    if (m.kind === "REPLACED") t.replaced += m.quantity;
    if (m.kind === "TRANSFER_OUT") t.transfers += m.quantity;
    t.loss += m.loss;
  }
  return t;
}
