/**
 * A tenant leaves (docs/PROPERTY_RENTAL_PLAN.md §15): the last day billed (the last month is
 * prorated), a final inspection (rows, photos, damages billed), the deposit settled — applied to
 * what is owed (rent, charges, damages) and/or refunded, or kept pending — and the office
 * becomes "vacant, awaiting handover" until management confirms it is ready (then available,
 * from a date). The contract keeps its whole history and a settlement summary.
 */
import { recordAudit } from "@/lib/audit";
import { invalid } from "@/lib/errors";
import { dateKeyOf } from "@/lib/venue/dates";
import { dateKeyInput, dbDay, text } from "./input";
import { leaseOf } from "./lease-service";
import { lockUnits } from "./unit-service";
import { accountOf, todayOf } from "./payment-service";
import { applyDeposit, depositOf, refundDeposit } from "./deposit-service";
import { recordInspection } from "./inspection-service";

/**
 * `moveOutKey` (last day billed), `reason`, `inspection` ({ condition, rows, damageCost, notes,
 * inspector, attachmentIds }), `chargeDamages` (bill the damages found), `deposit`: { rent,
 * charges, damage } amounts to apply, `refund` ({ amount, paymentMethod, reference }),
 * `availableFromKey` (when the office should be ready), `repairs` (what must be done).
 */
export async function endLease(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  await lockUnits(tx, [lease.unitId]);
  if (lease.status !== "ACTIVE") throw invalid(lease.status === "RESERVED" ? `${lease.referenceNo} has not started: cancel the reservation instead.` : `${lease.referenceNo} is already ${lease.status.toLowerCase()}.`);
  const moveOutKey = dateKeyInput(input.moveOutKey, "The date the tenant left", { required: true });
  const startKey = dateKeyOf(lease.startDate);
  if (moveOutKey < startKey) throw invalid("The tenant cannot leave before the contract starts.");
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the tenant leaves (end of contract, notice given, eviction …).");

  await tx.propertyLease.update({ where: { id: lease.id }, data: { moveOutDate: dbDay(moveOutKey) } });
  const ended = { ...lease, moveOutDate: dbDay(moveOutKey) };

  let inspection = null;
  if (input.inspection) {
    inspection = await recordInspection(tx, ctx, { ...input.inspection, unitId: lease.unitId, leaseId: lease.id, kind: "MOVE_OUT", chargeDamages: Boolean(input.chargeDamages) && !(input.deposit?.damage > 0) });
  }
  const todayKey = todayOf(ctx);
  const before = await accountOf(tx, ended, todayKey, 0);
  const uses = [];
  for (const [use, key] of [["damage", "damage"], ["rent", "rent"], ["charges", "charges"]]) {
    const amount = Math.round(Number(input.deposit?.[key]) || 0);
    if (amount > 0) uses.push(await applyDeposit(tx, ctx, { leaseId: lease.id, use, amount, label: use === "damage" ? `Damages found at move-out${inspection ? ` (${inspection.referenceNo})` : ""}` : undefined, inspectionId: inspection?.inspectionId }));
  }
  let refund = null;
  if (input.refund && Number(input.refund.amount) > 0) refund = await refundDeposit(tx, ctx, { leaseId: lease.id, ...input.refund, notes: input.refund.notes || "Deposit returned at move-out" });

  const after = await accountOf(tx, ended, todayKey, 0);
  const deposit = await depositOf(tx, lease);
  const availableFromKey = dateKeyInput(input.availableFromKey, "The date the office should be ready");
  const repairs = text(input.repairs, 1000);
  const settlement = {
    moveOutKey,
    reason,
    owedBefore: before.outstanding,
    byKindBefore: before.byKind,
    depositUsed: uses.map((u) => ({ kind: u.kind, amount: u.amount })),
    depositRefunded: refund?.amount || 0,
    depositHeld: deposit.held,
    owedAfter: after.outstanding,
    utilitiesOwed: after.utilitiesOutstanding,
    inspection: inspection ? { id: inspection.inspectionId, referenceNo: inspection.referenceNo, damageCost: inspection.damageCost } : null,
    repairs,
    availableFromKey,
  };
  await tx.propertyLease.update({ where: { id: lease.id }, data: { status: "ENDED", endedAt: new Date(), endReason: reason, settlement } });
  await tx.propertyUnit.update({ where: { id: lease.unitId }, data: { state: "AWAITING_HANDOVER", stateNote: repairs || "Tenant left: check and confirm the office is ready", availableFrom: dbDay(availableFromKey) } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_LEASE_ENDED", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo: lease.referenceNo, ...settlement } });
  return { leaseId: lease.id, referenceNo: lease.referenceNo, ...settlement };
}

export { depositStatus, DEPOSIT_STATUS_LABELS } from "./account";
