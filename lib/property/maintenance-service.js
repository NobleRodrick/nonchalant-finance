/**
 * Maintenance requests of offices (docs/PROPERTY_RENTAL_PLAN.md §18): reported → approved → in
 * progress → completed, or cancelled. A request names its office (and tenant), the problem, who
 * reported it, priority, the person assigned, an appointment, the technician and the cost. When
 * completed, the cost can be paid from the drawer (an expense of the office, MR number in its
 * description) and/or billed to the tenant (damage caused by the tenant).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { postMoneyEntry } from "@/lib/finance/posting-service";
import { francs, text } from "./input";
import { unitOf } from "./unit-service";
import { addCharge } from "./charge-service";

import { PRIORITY_LABELS } from "./unit-math";

export { MAINTENANCE_STATUS_LABELS, MAINTENANCE_STATUS_TONES, PRIORITY_LABELS } from "./unit-math";

const when = (v, label) => {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) throw invalid(`${label} is not a valid date.`);
  return d;
};

async function requestOf(tx, ctx, id) {
  const r = await tx.propertyMaintenance.findFirst({ where: { id: id || "-", departmentId: ctx.department.id }, include: { unit: { include: { building: true } } } });
  if (!r) throw notFound("Maintenance request not found.");
  return r;
}

/** A problem reported on an office (by the tenant, a caretaker, an inspection …). */
export async function reportMaintenance(tx, ctx, input) {
  const { user, department } = ctx;
  const unit = await unitOf(tx, department, input?.unitId);
  const title = text(input.title, 160);
  if (!title) throw invalid("Describe the problem.");
  const lease = await tx.propertyLease.findFirst({ where: { unitId: unit.id, status: "ACTIVE" }, select: { id: true } });
  const referenceNo = await nextReference(tx, department.id, DOC_TYPES.REPAIR);
  const r = await tx.propertyMaintenance.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      referenceNo,
      unitId: unit.id,
      leaseId: lease?.id || null,
      title,
      description: text(input.description, 2000),
      priority: PRIORITY_LABELS[input.priority] ? input.priority : "NORMAL",
      reportedAt: ctx.date || ctx.now || new Date(),
      reportedBy: text(input.reportedBy, 80),
      assignedTo: text(input.assignedTo, 80),
      scheduledFor: when(input.scheduledFor, "The appointment"),
      technician: text(input.technician, 80),
      cost: francs(input.estimatedCost, "The estimated cost"),
      notes: text(input.notes, 2000),
      createdById: user.id,
    },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "PropertyMaintenance", entityId: r.id, departmentId: department.id });
  await recordAudit(tx, { user, departmentId: department.id, action: "PROPERTY_MAINTENANCE_REPORTED", entityType: "PropertyMaintenance", entityId: r.id, after: { referenceNo, unit: unit.name, title, priority: r.priority } });
  return { maintenanceId: r.id, referenceNo };
}

const NEXT = { approve: ["REPORTED"], start: ["REPORTED", "APPROVED"], complete: ["APPROVED", "IN_PROGRESS"], cancel: ["REPORTED", "APPROVED", "IN_PROGRESS"], plan: ["REPORTED", "APPROVED", "IN_PROGRESS"] };

/**
 * Moves a request on: `step` approve | plan (assignedTo, scheduledFor, technician, cost) | start |
 * complete (cost, technician, `pay`: { paymentMethod, reference, counterparty } to pay it now,
 * `chargeTenant` to bill it to the tenant) | cancel (reason).
 */
export async function stepMaintenance(tx, ctx, input) {
  const r = await requestOf(tx, ctx, input?.maintenanceId);
  const step = input.step;
  if (!NEXT[step]) throw invalid("Unknown step.");
  if (!NEXT[step].includes(r.status)) throw conflict(`${r.referenceNo} is ${r.status.replace("_", " ").toLowerCase()}: it cannot be ${step === "plan" ? "planned" : `${step}d`} now.`);
  const data = {};
  let expense = null;
  let charge = null;
  if (step === "approve") Object.assign(data, { status: "APPROVED", approvedById: ctx.user.id, approvedAt: new Date() });
  if (step === "plan") Object.assign(data, { assignedTo: text(input.assignedTo, 80) ?? r.assignedTo, scheduledFor: input.scheduledFor ? when(input.scheduledFor, "The appointment") : r.scheduledFor, technician: text(input.technician, 80) ?? r.technician, ...(input.cost !== undefined && input.cost !== "" ? { cost: francs(input.cost, "The cost") } : {}) });
  if (step === "start") Object.assign(data, { status: "IN_PROGRESS", startedAt: new Date(), ...(r.status === "REPORTED" ? { approvedById: ctx.user.id, approvedAt: new Date() } : {}) });
  if (step === "cancel") {
    const reason = text(input.reason, 300);
    if (!reason || reason.length < 3) throw invalid("Give the reason (at least 3 characters).");
    Object.assign(data, { status: "CANCELLED", cancelReason: reason });
  }
  if (step === "complete") {
    const cost = input.cost !== undefined && input.cost !== "" ? francs(input.cost, "The cost") : r.cost;
    Object.assign(data, { status: "COMPLETED", completedAt: ctx.date || ctx.now || new Date(), cost, technician: text(input.technician, 80) || r.technician, notes: text(input.notes, 2000) || r.notes });
    if (input.pay && cost > 0) {
      const counterparty = text(input.pay.counterparty, 120) || data.technician;
      if (!counterparty) throw invalid("Enter who was paid (technician or supplier).");
      expense = (
        await postMoneyEntry(tx, {
          ...ctx,
          type: "EXPENSE",
          amount: cost,
          category: "property-maintenance",
          paymentMethod: input.pay.paymentMethod || "CASH",
          counterparty,
          reference: input.pay.reference,
          description: `${r.referenceNo} · ${r.unit.name} · ${r.title}`,
          propertyUnitId: r.unitId,
          authorizedByName: input.pay.authorizedByName,
          receivedByName: input.pay.spentByName,
          idempotencyKey: ctx.key,
        })
      ).transaction;
      data.transactionId = expense.id;
      await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: expense.id, departmentId: ctx.department.id });
    }
    if (input.chargeTenant) {
      if (!r.leaseId) throw invalid("No tenant is linked to this request.");
      const amount = francs(input.chargeAmount ?? cost, "The amount billed to the tenant", { min: 1 });
      charge = await addCharge(tx, ctx, { leaseId: r.leaseId, kind: "MAINTENANCE", amount, label: `Repair ${r.referenceNo}: ${r.title}`.slice(0, 80), maintenanceId: r.id, allowDuplicate: true });
    }
  }
  await tx.propertyMaintenance.update({ where: { id: r.id }, data });
  if (step !== "complete") await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "PropertyMaintenance", entityId: r.id, departmentId: ctx.department.id });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: `PROPERTY_MAINTENANCE_${step.toUpperCase()}`, entityType: "PropertyMaintenance", entityId: r.id, before: { status: r.status }, after: { ...data, expense: expense?.referenceNo, charge: charge?.referenceNo } });
  return { maintenanceId: r.id, referenceNo: r.referenceNo, status: data.status || r.status, expense: expense?.referenceNo || null, charge: charge?.referenceNo || null };
}
