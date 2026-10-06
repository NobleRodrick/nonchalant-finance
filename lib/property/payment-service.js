/**
 * Tenants' payments (owner's rule, docs/PROPERTY_RENTAL_PLAN.md): a payment pays the oldest debts
 * first — rent before the utilities of the same month — unless the person recording it chose the
 * split; what is left is an advance that pays the next months. Every allocation is stored, so the
 * receipt and the statement say exactly which months and charges a payment covered. Refunds give
 * back only an advance. Deposits are handled apart (lib/property/deposit-service.js).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES } from "@/lib/documents/sequence";
import { assertCanPost } from "@/lib/posting-guard";
import { createTransaction, departmentDrawer, PAID_METHODS, requireAmount } from "@/lib/finance/posting-service";
import { formatMoney } from "@/lib/format";
import { toDateKey } from "@/lib/timezone";
import { checkAllocation, proposeAllocation } from "./account";
import { loadAccounts } from "./accounts";
import { text } from "./input";
import { leaseOf } from "./lease-service";
import { unitTitle } from "./unit-math";

const int = (v) => Math.round(Number(v) || 0);
export const todayOf = (ctx) => toDateKey(ctx.date || ctx.now || new Date(), ctx.timeZone);

export async function accountOf(tx, lease, todayKey, ahead = 2) {
  return (await loadAccounts({ leases: [lease], todayKey, ahead, client: tx })).get(lease.id);
}

/**
 * Money of a contract not yet allocated, by source, oldest first: payments and deposit uses, less
 * refunds (which give back the latest money). [{ transactionId | depositId, left }].
 */
async function creditSources(tx, leaseId) {
  const [payments, refunds, deposits, allocated] = await Promise.all([
    tx.transaction.findMany({ where: { leaseId, category: "lease-payment", status: { not: "VOIDED" } }, select: { id: true, amount: true, date: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    tx.transaction.aggregate({ where: { leaseId, category: "lease-refund", status: { not: "VOIDED" } }, _sum: { amount: true } }),
    tx.propertyDeposit.findMany({ where: { leaseId, voidedAt: null, kind: { in: ["APPLIED_RENT", "APPLIED_CHARGES", "APPLIED_DAMAGE"] } }, select: { id: true, amount: true, date: true }, orderBy: { date: "asc" } }),
    tx.propertyAllocation.groupBy({ by: ["transactionId", "depositId"], where: { leaseId, voidedAt: null }, _sum: { amount: true } }),
  ]);
  const used = (k, id) => int(allocated.find((a) => a[k] === id)?._sum.amount);
  const sources = [
    ...payments.map((p) => ({ transactionId: p.id, date: p.date, left: int(p.amount) - used("transactionId", p.id) })),
    ...deposits.map((d) => ({ depositId: d.id, date: d.date, left: int(d.amount) - used("depositId", d.id) })),
  ].sort((a, b) => a.date - b.date);
  let refund = int(refunds._sum.amount);
  for (const s of [...sources].reverse()) {
    const take = Math.min(refund, Math.max(0, s.left));
    s.left -= take;
    refund -= take;
  }
  return sources.filter((s) => s.left > 0);
}

/** Stores `lines` (from proposeAllocation / checkAllocation) as allocations drawn from `sources` in order. */
async function storeAllocations(tx, ctx, lease, lines, sources, date) {
  for (const line of lines) {
    let need = line.amount;
    for (const s of sources) {
      if (need <= 0) break;
      if (s.left <= 0) continue;
      const take = Math.min(need, s.left);
      await tx.propertyAllocation.create({
        data: { departmentId: ctx.department.id, leaseId: lease.id, monthKey: line.monthKey, chargeId: line.chargeId, amount: take, source: s.depositId ? "DEPOSIT" : "PAYMENT", transactionId: s.transactionId || null, depositId: s.depositId || null, date, createdById: ctx.user.id },
      });
      s.left -= take;
      need -= take;
    }
    if (need > 0) throw conflict("Not enough money to allocate: try again.");
  }
}

/**
 * Turns the contract's advance into allocations of the items already due (the oldest first), as
 * the account already shows it. Run before a new payment or deposit use, so they start from
 * clean balances.
 */
export async function settleCredit(tx, ctx, lease, account) {
  const lines = account.items
    .filter((i) => i.due && i.byCredit > 0)
    .map((i) => ({ monthKey: i.chargeId ? null : i.monthKey, chargeId: i.chargeId, amount: i.byCredit }));
  if (!lines.length) return 0;
  await storeAllocations(tx, ctx, lease, lines, await creditSources(tx, lease.id), ctx.date || ctx.now || new Date());
  return lines.reduce((s, l) => s + l.amount, 0);
}

function methodOf(input, what) {
  const m = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(m)) throw invalid(`Choose how the money was ${what}: cash, Mobile Money, bank transfer or other.`);
  const reference = text(input.reference, 80);
  if (m !== "CASH" && !reference) throw invalid("Enter the transaction reference (Mobile Money id, bank slip, cheque number…).");
  return { method: m, reference };
}

/** A money record of a contract (payment, deposit, refund) in the department's drawer. */
export async function postLeaseMoney(tx, ctx, lease, { type, category, amount, method, reference, receivedByName, description, docType }) {
  const { user, department, timeZone } = ctx;
  const date = ctx.date || ctx.now || new Date();
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  return createTransaction(tx, {
    user,
    department,
    docType,
    data: {
      type,
      amount,
      paymentMethod: method,
      customerName: lease.client.name,
      counterparty: lease.client.name,
      reference,
      receivedByName: text(receivedByName, 80) || user.name,
      description: description.slice(0, 300),
      category,
      operationCategory: type === "BOOKING_PAYMENT" ? "SALE_SERVICES" : "DISCOUNT_CUSTOMER",
      date,
      accountId: account.id,
      leaseId: lease.id,
      propertyUnitId: lease.unitId,
      buildingId: lease.unit.buildingId,
      idempotencyKey: ctx.key,
    },
  });
}

/**
 * A payment received from a tenant: amount, method (and reference unless cash), who received it,
 * proof, notes, and optionally the split (`lines`: [{ monthKey | chargeId, amount }]) — by default
 * the oldest debts first. Returns what the receipt shows: previous balance, what was covered,
 * what remains, the advance.
 */
export async function recordLeasePayment(tx, ctx, input) {
  const { user, department } = ctx;
  const lease = await leaseOf(tx, department, input?.leaseId, { lock: true });
  if (lease.status === "CANCELLED") throw conflict(`${lease.referenceNo} is cancelled: no rent can be received for it.`);
  if (lease.status === "RESERVED" && !input.advance) throw invalid(`${lease.referenceNo} has not started: record the deposit, or confirm this is rent paid in advance.`);
  const amount = requireAmount(input.amount);
  const { method, reference } = methodOf(input, "received");
  const todayKey = todayOf(ctx);
  const before = await accountOf(tx, lease, todayKey, 12);
  await settleCredit(tx, ctx, lease, before);
  let split;
  try {
    split = Array.isArray(input.lines) && input.lines.length ? checkAllocation(before, amount, input.lines) : proposeAllocation(before, amount);
  } catch (e) {
    throw invalid(e.message);
  }
  const covered = split.lines.map((l) => l.label).join(", ");
  const transaction = await postLeaseMoney(tx, ctx, lease, {
    type: "BOOKING_PAYMENT",
    category: "lease-payment",
    amount,
    method,
    reference,
    receivedByName: input.receivedByName,
    description: text(input.notes, 300) || `${lease.client.name} · ${unitTitle(lease.unit)}${covered ? ` · ${covered}` : " · advance"}`,
    docType: DOC_TYPES.BOOKING_PAYMENT,
  });
  await storeAllocations(tx, ctx, lease, split.lines, [{ transactionId: transaction.id, left: amount }], transaction.date);
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: department.id });
  const after = await accountOf(tx, lease, todayKey);
  const receipt = { previousBalance: before.outstanding, covered: split.lines, advance: split.advance, remaining: after.outstanding, credit: after.credit + after.paidAhead };
  await recordAudit(tx, { user, departmentId: department.id, action: "PROPERTY_PAYMENT_RECEIVED", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo: transaction.referenceNo, amount, method, reference, covered: split.lines.map((l) => `${l.label}: ${l.amount}`), advance: split.advance, remaining: after.outstanding } });
  return { transactionId: transaction.id, referenceNo: transaction.referenceNo, leaseId: lease.id, amount, ...receipt };
}

/** Money given back to a tenant from an advance (never from rent already allocated, never the deposit). */
export async function recordLeaseRefund(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  const amount = requireAmount(input.amount);
  const { method, reference } = methodOf(input, "given back");
  const todayKey = todayOf(ctx);
  const account = await accountOf(tx, lease, todayKey, 12);
  await settleCredit(tx, ctx, lease, account);
  const free = (await creditSources(tx, lease.id)).reduce((s, x) => s + x.left, 0);
  if (amount > free) throw invalid(free ? `Only ${formatMoney(free)} of advance can be given back.` : `${lease.client.name} has no advance to give back.`);
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Give the reason of the refund.");
  const transaction = await postLeaseMoney(tx, ctx, lease, { type: "BOOKING_REFUND", category: "lease-refund", amount, method, reference, receivedByName: input.receivedByName, description: `Refund to ${lease.client.name}: ${reason}`, docType: DOC_TYPES.BOOKING_REFUND });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_REFUND_GIVEN", entityType: "PropertyLease", entityId: lease.id, after: { referenceNo: transaction.referenceNo, amount, reason } });
  return { transactionId: transaction.id, referenceNo: transaction.referenceNo, amount };
}

/** Forgives part of a month's rent or of a charge (a reason, the right to change prices). */
export async function waiveDebt(tx, ctx, input) {
  const lease = await leaseOf(tx, ctx.department, input?.leaseId, { lock: true });
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Give the reason (at least 3 characters).");
  const account = await accountOf(tx, lease, todayOf(ctx), 12);
  await settleCredit(tx, ctx, lease, account);
  let split;
  try {
    split = checkAllocation(account, requireAmount(input.amount), [{ monthKey: input.monthKey, chargeId: input.chargeId, amount: input.amount }]);
  } catch (e) {
    throw invalid(e.message);
  }
  const [line] = split.lines;
  await tx.propertyAllocation.create({ data: { departmentId: ctx.department.id, leaseId: lease.id, monthKey: line.monthKey, chargeId: line.chargeId, amount: line.amount, source: "WAIVER", note: reason, date: ctx.date || ctx.now || new Date(), createdById: ctx.user.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_DEBT_WAIVED", entityType: "PropertyLease", entityId: lease.id, after: { item: line.label, amount: line.amount, reason } });
  return { leaseId: lease.id, waived: line.amount, item: line.label };
}
