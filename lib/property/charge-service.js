/**
 * Charges billed to tenants besides rent (docs/PROPERTY_RENTAL_PLAN.md): electricity and water
 * from meter readings (current − previous × rate), fixed monthly amounts (internet, cleaning,
 * security …), a share of a building's bill, and one-off charges (damages, late fees, other).
 * Each is identified (UB-0001), belongs to a month, has a due date, and is voided with a reason,
 * never deleted (what paid it becomes the tenant's advance again).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { toDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";
import { CHARGE_KIND_LABELS } from "./account";
import { dateKeyInput, dbDay, decimal, francs, monthInput, text } from "./input";
import { addMonths, dayOfMonth, monthLabel, monthOf } from "./rent-schedule";
import { leaseOf, lockLease } from "./lease-service";

const KINDS = Object.keys(CHARGE_KIND_LABELS).filter((k) => k !== "RENT");

/** Default due date of a charge of `monthKey`: the contract's due day of the next month. */
export const defaultDueKey = (lease, monthKey) => dayOfMonth(addMonths(monthKey, 1), lease.dueDay || 5);

/**
 * Bills one charge to a contract. Meter charges: `currentReading` (and `previousReading`, by
 * default the last one billed for that office and kind), `rate` (by default the office's
 * setting): amount = units × rate, rounded. Others: `amount`. `monthKey` (this month by
 * default), `dueKey` (the contract's due day next month by default), `label`, `note`.
 */
export async function addCharge(tx, ctx, input) {
  const { user, department } = ctx;
  const lease = await leaseOf(tx, department, input?.leaseId, { lock: true });
  if (!["ACTIVE", "ENDED"].includes(lease.status)) throw invalid(`${lease.referenceNo} is ${lease.status.toLowerCase()}: nothing can be billed on it.`);
  if (!KINDS.includes(input.kind)) throw invalid("Choose what is billed.");
  const todayKey = toDateKey(ctx.date || ctx.now || new Date(), ctx.timeZone);
  const monthKey = monthInput(input.monthKey, "The month") || monthOf(todayKey);
  const setting = await tx.propertyUnitCharge.findFirst({ where: { unitId: lease.unitId, kind: input.kind, ...(input.kind === "OTHER" && input.label ? { label: input.label } : {}) } });

  let amount;
  let meter = {};
  const current = decimal(input.currentReading, "The current reading");
  if (current !== null) {
    const last = await tx.propertyCharge.findFirst({ where: { unitId: lease.unitId, kind: input.kind, voidedAt: null, currentReading: { not: null } }, orderBy: { date: "desc" }, select: { currentReading: true } });
    const previous = decimal(input.previousReading, "The previous reading") ?? last?.currentReading ?? setting?.lastReading ?? null;
    if (previous === null) throw invalid("Enter the previous reading (the first time a meter is billed).");
    if (current < previous) throw invalid(`The current reading (${current}) is below the previous one (${previous}).`);
    const rate = decimal(input.rate, "The rate per unit") ?? setting?.rate ?? null;
    if (!rate) throw invalid("Enter the rate per unit.");
    const units = Math.round((current - previous) * 1000) / 1000;
    amount = Math.round(units * rate);
    if (!amount) throw invalid("Nothing was consumed: no charge to bill.");
    meter = { previousReading: previous, currentReading: current, units, rate };
  } else {
    amount = francs(input.amount, "The amount", { required: true, min: 1 });
  }
  // Utilities are due on the contract's day the month after; damages, repairs and other one-off charges at once.
  const oneOff = ["DAMAGE", "MAINTENANCE", "LATE_FEE"].includes(input.kind);
  const dueKey = dateKeyInput(input.dueKey, "The due date") || (oneOff ? todayKey : defaultDueKey(lease, monthKey));
  const label = text(input.label, 80) || `${CHARGE_KIND_LABELS[input.kind]} ${monthLabel(monthKey, true)}`;
  if (!input.allowDuplicate && ["ELECTRICITY", "WATER", "INTERNET", "CLEANING", "SECURITY", "WASTE"].includes(input.kind)) {
    const same = await tx.propertyCharge.findFirst({ where: { leaseId: lease.id, kind: input.kind, monthKey, voidedAt: null, ...(input.kind === "OTHER" ? { label } : {}) } });
    if (same) throw conflict(`${CHARGE_KIND_LABELS[input.kind]} of ${monthLabel(monthKey)} is already billed (${same.referenceNo}). Void it first to bill it again.`);
  }
  const referenceNo = await nextReference(tx, department.id, DOC_TYPES.TENANT_CHARGE);
  const charge = await tx.propertyCharge.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      referenceNo,
      leaseId: lease.id,
      unitId: lease.unitId,
      kind: input.kind,
      label,
      monthKey,
      date: ctx.date || ctx.now || new Date(),
      dueDate: dbDay(dueKey),
      amount,
      ...meter,
      note: text(input.note, 300),
      maintenanceId: input.maintenanceId || null,
      inspectionId: input.inspectionId || null,
      createdById: user.id,
    },
  });
  if (setting && meter.currentReading !== undefined) await tx.propertyUnitCharge.update({ where: { id: setting.id }, data: { lastReading: meter.currentReading } });
  await recordAudit(tx, { user, departmentId: department.id, action: "PROPERTY_CHARGE_ADDED", entityType: "PropertyCharge", entityId: charge.id, after: { referenceNo, lease: lease.referenceNo, kind: input.kind, label, monthKey, amount, ...meter } });
  return { chargeId: charge.id, referenceNo, amount, label, ...meter };
}

/**
 * The month's bills for every active contract (the billing sheet): meter readings entered for
 * each contract and kind, fixed charges of each office's settings, shares of buildings' bills
 * (`buildingBills`: [{ buildingId, kind, amount }]). What is already billed for the month is
 * skipped, so running it twice bills nothing twice. Returns what was billed.
 */
export async function billMonth(tx, ctx, input) {
  const { department } = ctx;
  const monthKey = monthInput(input?.monthKey, "The month", { required: true });
  const readings = new Map((input.readings || []).filter((r) => r && r.currentReading !== "" && r.currentReading !== null && r.currentReading !== undefined).map((r) => [`${r.leaseId}:${r.kind}`, r]));
  const bills = new Map((input.buildingBills || []).filter((b) => Number(b?.amount) > 0).map((b) => [`${b.buildingId}:${b.kind}`, Number(b.amount)]));
  const leases = await tx.propertyLease.findMany({ where: { departmentId: department.id, status: "ACTIVE" }, include: { unit: { include: { chargeSettings: true } } }, orderBy: { referenceNo: "asc" } });
  const done = [];
  const skipped = [];
  for (const lease of leases) {
    if (dateKeyOf(lease.startDate) > `${monthKey}-31`) continue;
    for (const s of lease.unit.chargeSettings) {
      if (s.method === "INCLUDED") continue;
      const label = s.kind === "OTHER" ? `${s.label || "Other"} ${monthLabel(monthKey, true)}` : undefined;
      const exists = await tx.propertyCharge.findFirst({ where: { leaseId: lease.id, kind: s.kind, monthKey, voidedAt: null, ...(label ? { label } : {}) }, select: { referenceNo: true } });
      if (exists) {
        skipped.push({ lease: lease.referenceNo, kind: s.kind, reason: `already billed (${exists.referenceNo})` });
        continue;
      }
      let one = null;
      if (s.method === "METER") {
        const r = readings.get(`${lease.id}:${s.kind}`);
        if (!r) continue;
        one = { currentReading: r.currentReading, previousReading: r.previousReading, rate: r.rate };
      } else if (s.method === "FIXED") {
        one = { amount: Math.round(s.rate) };
      } else if (s.method === "SHARE") {
        const total = bills.get(`${lease.unit.buildingId}:${s.kind}`);
        if (!total) continue;
        one = { amount: Math.round((total * s.rate) / 100), note: `${s.rate}% of the building's bill of ${total} FCFA` };
      }
      if (!one || (one.amount !== undefined && one.amount <= 0)) continue;
      const res = await addCharge(tx, ctx, { leaseId: lease.id, kind: s.kind, monthKey, label, ...one, allowDuplicate: true });
      done.push({ lease: lease.referenceNo, kind: s.kind, referenceNo: res.referenceNo, amount: res.amount });
    }
  }
  return { monthKey, billed: done, skipped, total: done.reduce((s, d) => s + d.amount, 0) };
}

/** Voids a charge billed by mistake (reason required): whatever paid it becomes the tenant's advance. */
export async function voidCharge(tx, ctx, input) {
  const charge = await tx.propertyCharge.findFirst({ where: { id: input?.chargeId || "-", departmentId: ctx.department.id } });
  if (!charge) throw notFound("Charge not found.");
  if (charge.voidedAt) throw invalid(`${charge.referenceNo} is already void.`);
  await lockLease(tx, charge.leaseId);
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Give the reason (at least 3 characters).");
  const freed = await tx.propertyAllocation.updateMany({ where: { chargeId: charge.id, voidedAt: null }, data: { voidedAt: new Date() } });
  await tx.propertyCharge.update({ where: { id: charge.id }, data: { voidedAt: new Date(), voidedById: ctx.user.id, voidReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_CHARGE_VOIDED", entityType: "PropertyCharge", entityId: charge.id, after: { referenceNo: charge.referenceNo, amount: charge.amount, reason, paymentsFreed: freed.count } });
  return { chargeId: charge.id, referenceNo: charge.referenceNo };
}

