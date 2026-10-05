/**
 * Maintenance and repairs of a guest house's apartments (MR-0001): what needs fixing, where,
 * when reported, priority and status, estimated and actual cost, who is responsible, when it
 * was repaired, the invoice. Its actual cost, when paid from the cash drawer, is a repair expense
 * of the apartment. A repair that "blocks the apartment" puts it under maintenance until the last
 * such repair is done or cancelled.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { postMoneyEntry } from "@/lib/finance/posting-service";
import { isDateKey, toDateKey } from "@/lib/timezone";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";

export const PRIORITIES = ["URGENT", "HIGH", "NORMAL", "LOW"];
export const OPEN_REPAIRS = ["REPORTED", "IN_PROGRESS"];

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function francsOrNull(value, label) {
  if (value === "" || value === null || value === undefined) return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw invalid(`${label} must be a whole number of francs (0 or more).`);
  return n;
}

async function repairOf(tx, department, repairId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`room-repair:${repairId || "-"}`}))`;
  const r = await tx.roomRepair.findFirst({ where: { id: repairId || "-", departmentId: department.id }, include: { room: true } });
  if (!r) throw notFound("Repair not found.");
  return r;
}

/** Puts the apartment back to available when no blocking repair is open any more (and it was put under maintenance). */
async function releaseRoom(tx, repair) {
  if (!repair.blocksRoom) return;
  const others = await tx.roomRepair.count({ where: { roomId: repair.roomId, id: { not: repair.id }, blocksRoom: true, status: { in: OPEN_REPAIRS } } });
  if (!others && repair.room.state === "MAINTENANCE") await tx.room.update({ where: { id: repair.roomId }, data: { state: "AVAILABLE", stateNote: null } });
}

/** Something to fix in an apartment. */
export async function reportRepair(tx, ctx, input) {
  const { user, department, now, timeZone } = ctx;
  const room = await tx.room.findFirst({ where: { id: input?.roomId || "-", departmentId: department.id } });
  if (!room) throw notFound("Apartment not found.");
  const title = text(input.title, 160);
  if (!title) throw invalid("Say what needs to be fixed.");
  let assetId = null;
  if (input.assetId) {
    const asset = await tx.roomAsset.findFirst({ where: { id: input.assetId, departmentId: department.id }, select: { id: true } });
    if (!asset) throw notFound("Asset not found.");
    assetId = asset.id;
  }
  const reportedKey = isDateKey(input.reportedOnKey) ? input.reportedOnKey : toDateKey(now || new Date(), timeZone);
  const repair = await tx.roomRepair.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      roomId: room.id,
      assetId,
      referenceNo: await nextReference(tx, department.id, DOC_TYPES.REPAIR),
      title,
      description: text(input.description, 1000),
      reportedOn: dbDate(reportedKey),
      priority: PRIORITIES.includes(input.priority) ? input.priority : "NORMAL",
      estimatedCost: francsOrNull(input.estimatedCost, "The estimated cost"),
      responsibleName: text(input.responsibleName, 120),
      blocksRoom: Boolean(input.blocksRoom),
      createdById: user.id,
    },
  });
  if (repair.blocksRoom && room.state === "AVAILABLE") await tx.room.update({ where: { id: room.id }, data: { state: "MAINTENANCE", stateNote: `${repair.referenceNo}: ${title}` } });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "RoomRepair", entityId: repair.id, departmentId: department.id });
  await recordAudit(tx, { user, departmentId: department.id, action: "REPAIR_REPORTED", entityType: "RoomRepair", entityId: repair.id, after: { referenceNo: repair.referenceNo, room: room.name, title, priority: repair.priority, estimatedCost: repair.estimatedCost, blocksRoom: repair.blocksRoom } });
  return { repairId: repair.id, referenceNo: repair.referenceNo };
}

/** Changes an open repair: details, priority, started (in progress), estimate, who is responsible. */
export async function updateRepair(tx, ctx, input) {
  const r = await repairOf(tx, ctx.department, input?.repairId);
  if (!OPEN_REPAIRS.includes(r.status)) throw conflict(`${r.referenceNo} is ${r.status.toLowerCase()}.`);
  const data = {};
  if (input.title !== undefined) {
    data.title = text(input.title, 160);
    if (!data.title) throw invalid("Say what needs to be fixed.");
  }
  if (input.description !== undefined) data.description = text(input.description, 1000);
  if (input.priority && PRIORITIES.includes(input.priority)) data.priority = input.priority;
  if (input.status === "IN_PROGRESS") data.status = "IN_PROGRESS";
  if (input.estimatedCost !== undefined) data.estimatedCost = francsOrNull(input.estimatedCost, "The estimated cost");
  if (input.responsibleName !== undefined) data.responsibleName = text(input.responsibleName, 120);
  await tx.roomRepair.update({ where: { id: r.id }, data });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "REPAIR_UPDATED", entityType: "RoomRepair", entityId: r.id, before: { status: r.status, priority: r.priority }, after: data });
  return { repairId: r.id, referenceNo: r.referenceNo };
}

/** Done: actual cost, date repaired, who did it, the invoice; paid from the drawer → a repair expense of the apartment. */
export async function completeRepair(tx, ctx, input) {
  const { user, department, now, timeZone } = ctx;
  const r = await repairOf(tx, department, input?.repairId);
  if (!OPEN_REPAIRS.includes(r.status)) throw conflict(`${r.referenceNo} is ${r.status.toLowerCase()}.`);
  const actualCost = francsOrNull(input.actualCost, "The actual cost") ?? 0;
  const repairedKey = isDateKey(input.repairedOnKey) ? input.repairedOnKey : toDateKey(now || new Date(), timeZone);
  if (repairedKey < dateKeyOf(r.reportedOn)) throw invalid("The repair date is before the day it was reported.");
  const responsibleName = text(input.responsibleName, 120) || r.responsibleName;
  let transaction = null;
  if (input.paidFromDrawer && actualCost > 0) {
    const counterparty = text(input.counterparty, 120) || responsibleName;
    const authorizedByName = text(input.authorizedByName, 80);
    if (!counterparty) throw invalid("Enter the person or vendor paid.");
    if (!authorizedByName) throw invalid("Enter who authorized the expense.");
    ({ transaction } = await postMoneyEntry(tx, { ...ctx, type: "EXPENSE", amount: actualCost, category: "stay-repairs", paymentMethod: input.paymentMethod || "CASH", counterparty, reference: input.reference, description: `${r.referenceNo}: ${r.title} (${r.room.name})`, roomId: r.roomId, authorizedByName, idempotencyKey: ctx.key ? `${ctx.key}:pay` : null }));
  }
  await tx.roomRepair.update({ where: { id: r.id }, data: { status: "DONE", actualCost, repairedOn: dbDate(repairedKey), responsibleName, transactionId: transaction?.id || null } });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: transaction ? "Transaction" : "RoomRepair", entityId: transaction?.id || r.id, departmentId: department.id });
  await releaseRoom(tx, r);
  await recordAudit(tx, { user, departmentId: department.id, action: "REPAIR_DONE", entityType: "RoomRepair", entityId: r.id, after: { referenceNo: r.referenceNo, actualCost, repairedOn: repairedKey, responsibleName, transaction: transaction?.referenceNo } });
  return { repairId: r.id, referenceNo: r.referenceNo, transactionReference: transaction?.referenceNo || null };
}

/** Not needed any more (reason required). */
export async function cancelRepair(tx, ctx, input) {
  const r = await repairOf(tx, ctx.department, input?.repairId);
  if (!OPEN_REPAIRS.includes(r.status)) throw conflict(`${r.referenceNo} is ${r.status.toLowerCase()}.`);
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the repair is cancelled.");
  await tx.roomRepair.update({ where: { id: r.id }, data: { status: "CANCELLED", cancelReason: reason } });
  await releaseRoom(tx, r);
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "REPAIR_CANCELLED", entityType: "RoomRepair", entityId: r.id, after: { referenceNo: r.referenceNo, reason } });
  return { repairId: r.id, referenceNo: r.referenceNo };
}
