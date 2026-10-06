/**
 * Office inspections (move-in, move-out, damage reported, maintenance, routine): planned for a
 * date and/or done, with rows (area, condition, note), photos, the overall condition and the
 * cost of damages found — which can be billed to the tenant (a DAMAGE charge) or taken from the
 * deposit at move-out.
 */
import { recordAudit } from "@/lib/audit";
import { invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { CONDITION_LABELS, INSPECTION_KIND_LABELS } from "./unit-math";
import { dateKeyInput, dbDay, francs, text } from "./input";
import { unitOf } from "./unit-service";
import { addCharge } from "./charge-service";

export { INSPECTION_KIND_LABELS } from "./unit-math";

function rowsOf(rows) {
  return (Array.isArray(rows) ? rows : [])
    .map((r) => ({ area: text(r?.area, 80), condition: CONDITION_LABELS[r?.condition] ? r.condition : null, note: text(r?.note, 300) }))
    .filter((r) => r.area);
}

/**
 * Records an inspection. `done` false (or a `scheduledFor` in the future without findings) plans
 * it; otherwise it is done now. `chargeDamages` bills `damageCost` to the contract.
 */
export async function recordInspection(tx, ctx, input) {
  const { user, department } = ctx;
  const unit = await unitOf(tx, department, input?.unitId);
  const kind = INSPECTION_KIND_LABELS[input.kind] ? input.kind : null;
  if (!kind) throw invalid("Choose the kind of inspection.");
  let lease = null;
  if (input.leaseId) {
    lease = await tx.propertyLease.findFirst({ where: { id: input.leaseId, departmentId: department.id, unitId: unit.id } });
    if (!lease) throw notFound("Contract not found for this office.");
  } else if (["MOVE_IN", "MOVE_OUT"].includes(kind)) {
    lease = await tx.propertyLease.findFirst({ where: { unitId: unit.id, status: { in: ["ACTIVE", "RESERVED"] } }, orderBy: { startDate: "desc" } });
  }
  const scheduledFor = dateKeyInput(input.scheduledFor, "The planned date");
  const planned = input.done === false;
  if (planned && !scheduledFor) throw invalid("Choose the date of the inspection.");
  const rows = rowsOf(input.rows);
  const damageCost = francs(input.damageCost, "The cost of damages");
  const referenceNo = await nextReference(tx, department.id, DOC_TYPES.INSPECTION);
  const created = await tx.propertyInspection.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      referenceNo,
      unitId: unit.id,
      leaseId: lease?.id || null,
      maintenanceId: input.maintenanceId || null,
      kind,
      scheduledFor: dbDay(scheduledFor),
      doneAt: planned ? null : ctx.date || ctx.now || new Date(),
      inspector: text(input.inspector, 80) || (planned ? null : user.name),
      condition: CONDITION_LABELS[input.condition] ? input.condition : null,
      rows,
      damageCost,
      notes: text(input.notes, 2000),
      createdById: user.id,
    },
  });
  if (!planned && input.condition && CONDITION_LABELS[input.condition]) await tx.propertyUnit.update({ where: { id: unit.id }, data: { condition: input.condition } });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "PropertyInspection", entityId: created.id, departmentId: department.id });
  let charge = null;
  if (!planned && input.chargeDamages && damageCost > 0) {
    if (!lease) throw invalid("There is no tenant to bill the damages to.");
    charge = await addCharge(tx, ctx, { leaseId: lease.id, kind: "DAMAGE", amount: damageCost, label: `Damages (${referenceNo})`, note: text(input.notes, 300), inspectionId: created.id, allowDuplicate: true });
  }
  await recordAudit(tx, { user, departmentId: department.id, action: planned ? "PROPERTY_INSPECTION_PLANNED" : "PROPERTY_INSPECTION_DONE", entityType: "PropertyInspection", entityId: created.id, after: { referenceNo, kind, unit: unit.name, scheduledFor, condition: input.condition, damageCost, charge: charge?.referenceNo } });
  return { inspectionId: created.id, referenceNo, damageCost, charge: charge?.referenceNo || null };
}

/** A planned inspection is done: findings, condition, photos, damages (optionally billed). */
export async function completeInspection(tx, ctx, input) {
  const i = await tx.propertyInspection.findFirst({ where: { id: input?.inspectionId || "-", departmentId: ctx.department.id } });
  if (!i) throw notFound("Inspection not found.");
  if (i.doneAt) throw invalid(`${i.referenceNo} is already done.`);
  const damageCost = francs(input.damageCost, "The cost of damages");
  const rows = rowsOf(input.rows);
  await tx.propertyInspection.update({ where: { id: i.id }, data: { doneAt: ctx.date || ctx.now || new Date(), inspector: text(input.inspector, 80) || ctx.user.name, condition: CONDITION_LABELS[input.condition] ? input.condition : null, rows, damageCost, notes: text(input.notes, 2000) } });
  if (CONDITION_LABELS[input.condition]) await tx.propertyUnit.update({ where: { id: i.unitId }, data: { condition: input.condition } });
  await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "PropertyInspection", entityId: i.id, departmentId: ctx.department.id });
  let charge = null;
  if (input.chargeDamages && damageCost > 0) {
    if (!i.leaseId) throw invalid("There is no tenant to bill the damages to.");
    charge = await addCharge(tx, ctx, { leaseId: i.leaseId, kind: "DAMAGE", amount: damageCost, label: `Damages (${i.referenceNo})`, inspectionId: i.id, allowDuplicate: true });
  }
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_INSPECTION_DONE", entityType: "PropertyInspection", entityId: i.id, after: { referenceNo: i.referenceNo, condition: input.condition, damageCost, charge: charge?.referenceNo } });
  return { inspectionId: i.id, referenceNo: i.referenceNo, charge: charge?.referenceNo || null };
}
