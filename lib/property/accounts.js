/**
 * Tenants' accounts, loaded in a few queries for any number of contracts (lists, arrears, reports,
 * the dashboard): rent schedule + charges + allocations + money received → lib/property/account.
 */
import { db } from "@/lib/prisma";
import { dateKeyOf } from "@/lib/venue/dates";
import { leaseAccount } from "./account";
import { rentSchedule, scheduleHorizon } from "./rent-schedule";

const int = (v) => Math.round(Number(v) || 0);

/** A contract row as the pure functions read it (keys of its dates). */
export function leaseTerms(l, rates = []) {
  return {
    id: l.id,
    status: l.status,
    startKey: dateKeyOf(l.startDate),
    endKey: dateKeyOf(l.endDate),
    moveInKey: dateKeyOf(l.moveInDate),
    moveOutKey: dateKeyOf(l.moveOutDate),
    rent: l.rent,
    dueDay: l.dueDay,
    monthsPerBill: l.monthsPerBill,
    rates: rates.map((r) => ({ fromMonth: r.fromMonth, amount: r.amount })),
  };
}

/** Whether a contract's rent runs (active or ended; a reservation or a cancelled one bills nothing). */
export const billsRent = (status) => status === "ACTIVE" || status === "ENDED";

/**
 * The account of each contract on `todayKey` (Map leaseId → account + terms). `ahead`: months of
 * rent shown after the current one (so advances can pay them).
 */
export async function loadAccounts({ leases, todayKey, ahead = 2, client = db }) {
  const ids = leases.map((l) => l.id);
  const out = new Map();
  if (!ids.length) return out;
  const [rates, charges, allocations, money, deposits] = await Promise.all([
    client.propertyRate.findMany({ where: { leaseId: { in: ids } }, select: { leaseId: true, fromMonth: true, amount: true } }),
    client.propertyCharge.findMany({ where: { leaseId: { in: ids }, voidedAt: null }, select: { id: true, leaseId: true, referenceNo: true, kind: true, label: true, monthKey: true, dueDate: true, amount: true } }),
    client.propertyAllocation.findMany({ where: { leaseId: { in: ids }, voidedAt: null }, select: { leaseId: true, monthKey: true, chargeId: true, amount: true, source: true } }),
    client.transaction.groupBy({ by: ["leaseId", "type", "category"], where: { leaseId: { in: ids }, status: { not: "VOIDED" }, category: { in: ["lease-payment", "lease-refund"] } }, _sum: { amount: true } }),
    client.propertyDeposit.groupBy({ by: ["leaseId", "kind"], where: { leaseId: { in: ids }, voidedAt: null }, _sum: { amount: true } }),
  ]);
  for (const l of leases) {
    const terms = leaseTerms(l, rates.filter((r) => r.leaseId === l.id));
    const schedule = billsRent(l.status) ? rentSchedule(terms, scheduleHorizon(terms, todayKey, ahead)) : [];
    const paid = money.filter((m) => m.leaseId === l.id).reduce((s, m) => s + (m.category === "lease-payment" ? 1 : -1) * int(m._sum.amount), 0);
    const dep = Object.fromEntries(deposits.filter((d) => d.leaseId === l.id).map((d) => [d.kind, int(d._sum.amount)]));
    const applied = (dep.APPLIED_RENT || 0) + (dep.APPLIED_CHARGES || 0) + (dep.APPLIED_DAMAGE || 0);
    const account = leaseAccount({
      schedule,
      charges: charges.filter((c) => c.leaseId === l.id).map((c) => ({ ...c, dueKey: dateKeyOf(c.dueDate) })),
      allocations: allocations.filter((a) => a.leaseId === l.id),
      received: paid + applied,
      todayKey,
    });
    const deposit = { required: l.depositRequired, received: dep.RECEIVED || 0, refunded: dep.REFUNDED || 0, applied, held: (dep.RECEIVED || 0) - (dep.REFUNDED || 0) - applied };
    deposit.missing = Math.max(0, deposit.required - deposit.received);
    out.set(l.id, { ...account, terms, deposit, schedule });
  }
  return out;
}
