/**
 * Rental contracts (docs/PROPERTY_RENTAL_PLAN.md): a tenant on an office from a start date, the
 * monthly rent (changes kept as price history from an effective month), due day and months per
 * bill, deposit asked, notice, utilities and conditions. An office never has two live contracts:
 * every change takes a lock on the office and checks the others. Reserved → active (moved in) →
 * ended (moved out, lib/property/move-out.js) or cancelled (reservation only).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { permits, PERMISSIONS } from "@/lib/permissions";
import { grantsIn } from "@/lib/access";
import { resolveClient } from "@/lib/clients/client-service";
import { toDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";
import { dateKeyInput, dbDay, francs, monthInput, text, whole } from "./input";
import { lockUnits, unitOf } from "./unit-service";
import { monthOf, rateFor } from "./rent-schedule";
import { unitTitle } from "./unit-math";

export async function lockLease(tx, leaseId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`property-lease:${leaseId || "-"}`}))`;
}

/** A contract of the department with its office (and building) and tenant; locked when `lock`. */
export async function leaseOf(tx, department, leaseId, { lock = false } = {}) {
  if (lock) await lockLease(tx, leaseId);
  const lease = await tx.propertyLease.findFirst({ where: { id: leaseId || "-", departmentId: department.id }, include: { unit: { include: { building: true } }, client: true } });
  if (!lease) throw notFound("Contract not found in this department.");
  return lease;
}

const todayOf = (ctx) => toDateKey(ctx.date || ctx.now || new Date(), ctx.timeZone);

/** The terms of a contract from the form (dates checked against each other). */
function terms(input, unit) {
  const startKey = dateKeyInput(input.startKey, "The start date", { required: true });
  const endKey = dateKeyInput(input.endKey, "The end date");
  if (endKey && endKey < startKey) throw invalid("The contract cannot end before it starts.");
  const monthsPerBill = whole(input.monthsPerBill, "Months per bill", { min: 1, max: 12, fallback: 1 });
  if (![1, 3, 6, 12].includes(monthsPerBill)) throw invalid("Rent is billed every 1, 3, 6 or 12 months.");
  return {
    startKey,
    endKey,
    dueDay: whole(input.dueDay, "The due day", { min: 1, max: 28, fallback: 5 }),
    monthsPerBill,
    depositRequired: input.depositRequired === undefined || input.depositRequired === "" ? unit.depositRequired : francs(input.depositRequired, "The deposit"),
    noticeDays: whole(input.noticeDays, "The notice period", { min: 0, max: 365, fallback: 30 }),
    utilities: text(input.utilities, 1000),
    conditions: text(input.conditions, 4000),
    notes: text(input.notes, 2000),
  };
}

/** Refuses a contract over [startKey, endKey] on an office that has another live one or overlaps an ended one. */
async function assertFree(tx, unit, startKey, exceptId = null) {
  const others = await tx.propertyLease.findMany({ where: { unitId: unit.id, status: { in: ["ACTIVE", "RESERVED", "ENDED"] }, ...(exceptId ? { NOT: { id: exceptId } } : {}) }, include: { client: { select: { name: true } } } });
  for (const o of others) {
    if (o.status !== "ENDED") throw conflict(`${unitTitle(unit)} is already ${o.status === "ACTIVE" ? "let" : "reserved"} to ${o.client.name} (${o.referenceNo}). End or cancel that contract first.`);
    const out = dateKeyOf(o.moveOutDate);
    if (out && out >= startKey) throw conflict(`${unitTitle(unit)} is let to ${o.client.name} until ${out}: the new contract must start after that.`);
  }
}

/** The rent asked differs from the office's list price: needs the right to change prices. */
function assertPrice(ctx, rent, listRent) {
  if (rent !== listRent && !permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(ctx.user, ctx.department.id))) throw forbidden("You may not set a rent other than the office's price.");
}

/**
 * A new contract: the office (locked), the tenant (existing or new, with identification), the
 * terms and the monthly rent (the office's price by default). status "RESERVED" (signed, not
 * moved in) or "ACTIVE" (moves in on `moveInKey`, the start date by default). The office must be
 * ready to move in (not unavailable, under maintenance or awaiting handover).
 */
export async function createLease(tx, ctx, input) {
  const { user, department } = ctx;
  const unit = await unitOf(tx, department, input?.unitId, { lock: true });
  if (!unit.isActive) throw invalid(`${unitTitle(unit)} is archived.`);
  const t = terms(input, unit);
  const status = input.status === "ACTIVE" ? "ACTIVE" : "RESERVED";
  if (unit.state === "UNAVAILABLE") throw invalid(`${unitTitle(unit)} is marked unavailable${unit.stateNote ? `: ${unit.stateNote}` : ""}.`);
  if (status === "ACTIVE" && unit.state !== "AVAILABLE") throw invalid(`${unitTitle(unit)} is not ready to move in (${unit.state === "MAINTENANCE" ? "under maintenance" : "awaiting handover"}). Reserve it, or mark it available first.`);
  await assertFree(tx, unit, t.startKey);
  const listRent = rateFor(await tx.propertyRate.findMany({ where: { unitId: unit.id } }), monthOf(t.startKey), unit.listRent);
  const rent = input.rent === undefined || input.rent === "" ? listRent : francs(input.rent, "The monthly rent", { min: 1 });
  assertPrice(ctx, rent, listRent);
  const client = await resolveClient(tx, ctx, { clientId: input.clientId, client: input.tenant });
  const moveInKey = status === "ACTIVE" ? dateKeyInput(input.moveInKey, "The move-in date") || t.startKey : null;
  const referenceNo = await nextReference(tx, department.id, DOC_TYPES.LEASE);
  const lease = await tx.propertyLease.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      referenceNo,
      unitId: unit.id,
      clientId: client.id,
      status,
      startDate: dbDay(t.startKey),
      endDate: dbDay(t.endKey),
      moveInDate: dbDay(moveInKey),
      rent,
      dueDay: t.dueDay,
      monthsPerBill: t.monthsPerBill,
      depositRequired: t.depositRequired,
      noticeDays: t.noticeDays,
      utilities: t.utilities,
      conditions: t.conditions,
      notes: t.notes,
      createdById: user.id,
      startedAt: status === "ACTIVE" ? new Date() : null,
    },
  });
  await tx.propertyUnit.update({ where: { id: unit.id }, data: { state: "AVAILABLE", stateNote: null, availableFrom: null } });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "PropertyLease", entityId: lease.id, departmentId: department.id });
  await recordAudit(tx, { user, departmentId: department.id, action: "PROPERTY_LEASE_CREATED", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo, unit: unitTitle(unit), tenant: client.name, status, ...t, rent, moveInKey } });
  return { leaseId: lease.id, referenceNo, tenant: client.name, unit: unitTitle(unit), status };
}

/** A reserved contract becomes active: the tenant moved in (rent runs from the start date). */
export async function startLease(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  await lockUnits(tx, [lease.unitId]);
  if (lease.status !== "RESERVED") throw invalid(`${lease.referenceNo} is ${lease.status.toLowerCase()}: only a reservation can start.`);
  const unit = await tx.propertyUnit.findUnique({ where: { id: lease.unitId }, include: { building: true } });
  if (["UNAVAILABLE", "AWAITING_HANDOVER"].includes(unit.state)) throw invalid(`${unitTitle(unit)} is not ready to move in yet: mark it available first.`);
  const moveInKey = dateKeyInput(input.moveInKey, "The move-in date") || todayOf(ctx);
  await tx.propertyLease.update({ where: { id: lease.id }, data: { status: "ACTIVE", moveInDate: dbDay(moveInKey), startedAt: new Date() } });
  await tx.propertyUnit.update({ where: { id: unit.id }, data: { state: "AVAILABLE", stateNote: null, availableFrom: null } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_LEASE_STARTED", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo: lease.referenceNo, moveInKey } });
  return { leaseId: lease.id, referenceNo: lease.referenceNo, moveInKey };
}

/**
 * Changes the terms of a live contract: end date (renewal), due day, months per bill, deposit,
 * notice, utilities, conditions, notes, documents. The rent changes with `changeRent`.
 */
export async function updateLease(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  if (!["ACTIVE", "RESERVED"].includes(lease.status)) throw invalid(`${lease.referenceNo} is ${lease.status.toLowerCase()}: it can no longer be changed.`);
  const t = terms({ ...input, startKey: lease.status === "RESERVED" && input.startKey ? input.startKey : dateKeyOf(lease.startDate) }, lease.unit);
  if (lease.status === "RESERVED" && t.startKey !== dateKeyOf(lease.startDate)) {
    await lockUnits(tx, [lease.unitId]);
    await assertFree(tx, lease.unit, t.startKey, lease.id);
  }
  const data = { startDate: dbDay(t.startKey), endDate: dbDay(t.endKey), dueDay: t.dueDay, monthsPerBill: t.monthsPerBill, depositRequired: t.depositRequired, noticeDays: t.noticeDays, utilities: t.utilities, conditions: t.conditions, notes: t.notes };
  await tx.propertyLease.update({ where: { id: lease.id }, data });
  await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "PropertyLease", entityId: lease.id, departmentId: ctx.department.id });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_LEASE_UPDATED", entityType: "PropertyLease", entityId: lease.id, before: { endKey: dateKeyOf(lease.endDate), dueDay: lease.dueDay, monthsPerBill: lease.monthsPerBill, depositRequired: lease.depositRequired }, after: t });
  return { leaseId: lease.id, referenceNo: lease.referenceNo };
}

/**
 * A new monthly rent from `fromMonth` (this month or later, never before the contract starts):
 * the months before keep their price. Needs the right to change prices, and a reason.
 */
export async function changeRent(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  if (!["ACTIVE", "RESERVED"].includes(lease.status)) throw invalid(`${lease.referenceNo} is ${lease.status.toLowerCase()}: its rent can no longer change.`);
  if (!permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(ctx.user, ctx.department.id))) throw forbidden("You may not change rents.");
  const amount = francs(input.amount, "The new monthly rent", { required: true, min: 1 });
  const fromMonth = monthInput(input.fromMonth, "The month the new rent starts", { required: true });
  const startMonth = monthOf(dateKeyOf(lease.startDate));
  if (fromMonth < startMonth) throw invalid("The new rent cannot start before the contract.");
  const paidMonths = await tx.propertyAllocation.count({ where: { leaseId: lease.id, voidedAt: null, monthKey: { gte: fromMonth } } });
  if (paidMonths && !input.confirmPaidMonths) throw conflict("Months from then on are already (partly) paid: confirm to change their rent anyway (what was paid stays).");
  const note = text(input.note, 200);
  if (!note) throw invalid("Give the reason (e.g. yearly increase in the contract).");
  await tx.propertyRate.deleteMany({ where: { leaseId: lease.id, fromMonth } });
  await tx.propertyRate.create({ data: { departmentId: ctx.department.id, leaseId: lease.id, amount, fromMonth, note, createdById: ctx.user.id } });
  if (fromMonth === startMonth) await tx.propertyLease.update({ where: { id: lease.id }, data: { rent: amount } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_RENT_CHANGED", entityType: "PropertyLease", entityId: lease.id, before: { rent: lease.rent }, after: { amount, fromMonth, note } });
  return { leaseId: lease.id, referenceNo: lease.referenceNo, amount, fromMonth };
}

/**
 * Cancels a reservation (the tenant never moved in). Money already received must be refunded
 * (or kept) through the payments; the deposit through its refund.
 */
export async function cancelLease(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  if (lease.status !== "RESERVED") throw invalid(lease.status === "ACTIVE" ? `${lease.referenceNo} is active: record the move-out instead.` : `${lease.referenceNo} is already ${lease.status.toLowerCase()}.`);
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Give the reason (at least 3 characters).");
  await tx.propertyLease.update({ where: { id: lease.id }, data: { status: "CANCELLED", cancelledAt: new Date(), cancelReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_LEASE_CANCELLED", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo: lease.referenceNo, reason } });
  return { leaseId: lease.id, referenceNo: lease.referenceNo };
}
