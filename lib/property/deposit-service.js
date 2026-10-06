/**
 * Deposits (cautions), kept apart from income (docs/PROPERTY_RENTAL_PLAN.md): money received is
 * held for the tenant; it is refunded, or applied to unpaid rent, charges or damages — only the
 * applied part pays debts. Its own receipts (DP-0001) and refunds (DF-0001).
 */
import { recordAudit } from "@/lib/audit";
import { invalid } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES } from "@/lib/documents/sequence";
import { PAID_METHODS, requireAmount } from "@/lib/finance/posting-service";
import { formatMoney } from "@/lib/format";
import { checkAllocation, proposeAllocation } from "./account";
import { text } from "./input";
import { leaseOf } from "./lease-service";
import { accountOf, postLeaseMoney, settleCredit, todayOf } from "./payment-service";
import { addCharge } from "./charge-service";
import { unitTitle } from "./unit-math";

const int = (v) => Math.round(Number(v) || 0);

/** What a contract's deposit is: required, received, refunded, applied, held. */
export async function depositOf(tx, lease) {
  const rows = await tx.propertyDeposit.groupBy({ by: ["kind"], where: { leaseId: lease.id, voidedAt: null }, _sum: { amount: true } });
  const k = Object.fromEntries(rows.map((r) => [r.kind, int(r._sum.amount)]));
  const applied = (k.APPLIED_RENT || 0) + (k.APPLIED_CHARGES || 0) + (k.APPLIED_DAMAGE || 0);
  return { required: lease.depositRequired, received: k.RECEIVED || 0, refunded: k.REFUNDED || 0, applied, held: (k.RECEIVED || 0) - (k.REFUNDED || 0) - applied };
}

function methodOf(input, what) {
  const m = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(m)) throw invalid(`Choose how the money was ${what}.`);
  const reference = text(input.reference, 80);
  if (m !== "CASH" && !reference) throw invalid("Enter the transaction reference (Mobile Money id, bank slip …).");
  return { method: m, reference };
}

/** A deposit received (not more than what is still required unless `extra`). */
export async function receiveDeposit(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  if (["ENDED", "CANCELLED"].includes(lease.status)) throw invalid(`${lease.referenceNo} is ${lease.status.toLowerCase()}.`);
  const amount = requireAmount(input.amount);
  const d = await depositOf(tx, lease);
  const missing = Math.max(0, d.required - d.received);
  if (amount > missing && !input.extra) throw invalid(missing ? `Only ${formatMoney(missing)} of deposit is still due.` : `The deposit of ${lease.referenceNo} is already paid in full.`);
  const { method, reference } = methodOf(input, "received");
  const transaction = await postLeaseMoney(tx, ctx, lease, { type: "BOOKING_PAYMENT", category: "lease-deposit", amount, method, reference, receivedByName: input.receivedByName, description: `Deposit · ${lease.client.name} · ${unitTitle(lease.unit)}`, docType: DOC_TYPES.DEPOSIT });
  await tx.propertyDeposit.create({ data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, leaseId: lease.id, kind: "RECEIVED", amount, date: transaction.date, transactionId: transaction.id, note: text(input.notes, 300), createdById: ctx.user.id } });
  await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: ctx.department.id });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_DEPOSIT_RECEIVED", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo: transaction.referenceNo, amount, method } });
  return { transactionId: transaction.id, referenceNo: transaction.referenceNo, amount, held: d.held + amount, stillDue: Math.max(0, missing - amount) };
}

/** Deposit money given back to the tenant (not more than held). */
export async function refundDeposit(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  const amount = requireAmount(input.amount);
  const d = await depositOf(tx, lease);
  if (amount > d.held) throw invalid(d.held ? `Only ${formatMoney(d.held)} of deposit is held.` : "No deposit is held for this contract.");
  const { method, reference } = methodOf(input, "given back");
  const transaction = await postLeaseMoney(tx, ctx, lease, { type: "BOOKING_REFUND", category: "lease-deposit-refund", amount, method, reference, receivedByName: input.receivedByName, description: `Deposit refunded · ${lease.client.name}${input.notes ? `: ${text(input.notes, 200)}` : ""}`, docType: DOC_TYPES.DEPOSIT_REFUND });
  await tx.propertyDeposit.create({ data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, leaseId: lease.id, kind: "REFUNDED", amount, date: transaction.date, transactionId: transaction.id, note: text(input.notes, 300), createdById: ctx.user.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_DEPOSIT_REFUNDED", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo: transaction.referenceNo, amount } });
  return { transactionId: transaction.id, referenceNo: transaction.referenceNo, amount, held: d.held - amount };
}

/**
 * Uses held deposit money: `use` "rent" (unpaid rent, oldest first), "charges" (utilities and
 * other charges, oldest first) or "damage" (bills the damages first — `label`, `amount` — then
 * pays them). `lines` may name the items instead. No money moves: the deposit pays the debt.
 */
export async function applyDeposit(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  const amount = requireAmount(input.amount);
  const d = await depositOf(tx, lease);
  if (amount > d.held) throw invalid(d.held ? `Only ${formatMoney(d.held)} of deposit is held.` : "No deposit is held for this contract.");
  const use = ["rent", "charges", "damage"].includes(input.use) ? input.use : null;
  if (!use) throw invalid("Choose what the deposit pays: rent, charges or damages.");
  let damage = null;
  if (use === "damage") {
    damage = await addCharge(tx, ctx, { leaseId: lease.id, kind: "DAMAGE", amount, label: text(input.label, 80) || "Damages", note: text(input.notes, 300), inspectionId: input.inspectionId, allowDuplicate: true });
  }
  const todayKey = todayOf(ctx);
  const account = await accountOf(tx, lease, todayKey, 12);
  await settleCredit(tx, ctx, lease, account);
  const open = { ...account, items: account.items.filter((i) => (use === "rent" ? i.kind === "RENT" : use === "damage" ? i.chargeId === damage.chargeId : i.kind !== "RENT")) };
  let split;
  try {
    split = Array.isArray(input.lines) && input.lines.length ? checkAllocation(open, amount, input.lines) : proposeAllocation(open, amount);
  } catch (e) {
    throw invalid(e.message);
  }
  if (split.advance > 0 && !input.allowAdvance) throw invalid(`Only ${formatMoney(amount - split.advance)} of ${use === "rent" ? "rent" : use === "damage" ? "damages" : "charges"} is owed: use less of the deposit.`);
  const kind = use === "rent" ? "APPLIED_RENT" : use === "damage" ? "APPLIED_DAMAGE" : "APPLIED_CHARGES";
  const dep = await tx.propertyDeposit.create({ data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, leaseId: lease.id, kind, amount, date: ctx.date || ctx.now || new Date(), note: text(input.notes, 300), createdById: ctx.user.id } });
  for (const l of split.lines) {
    await tx.propertyAllocation.create({ data: { departmentId: ctx.department.id, leaseId: lease.id, monthKey: l.monthKey, chargeId: l.chargeId, amount: l.amount, source: "DEPOSIT", depositId: dep.id, date: dep.date, createdById: ctx.user.id } });
  }
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_DEPOSIT_APPLIED", entityType: "PropertyLease", entityId: lease.id, after: { kind, amount, covered: split.lines.map((l) => `${l.label}: ${l.amount}`), damage: damage?.referenceNo } });
  return { leaseId: lease.id, kind, amount, covered: split.lines, held: d.held - amount, damage: damage?.referenceNo || null };
}

