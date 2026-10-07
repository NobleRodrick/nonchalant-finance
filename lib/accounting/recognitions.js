/**
 * The dated facts a department's records imply besides its money records (lib/accounting/rules.js
 * `recognitionEntry`): revenue of events, nights, months of rent and charges, money kept from
 * cancellations, debts forgiven or written off, deposits used, assets lost, depreciation and
 * disposals, debts from before the app. Each department type supplies its own; restaurant debts are
 * shared by every type.
 */
import { db } from "@/lib/prisma";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { venueRecognitions } from "@/lib/venue/reports";
import { stayRecognitions } from "@/lib/rooms/reports";
import { rentalRecognitions } from "@/lib/rental/reports";
import { propertyRecognitions } from "@/lib/property/reports";
import { tradeRecognitions } from "@/lib/trade/accrual";
import { serviceRecognitions } from "@/lib/services/accrual";

const BY_DOMAIN = {
  EVENT_VENUE: [venueRecognitions],
  ROOM_RENTAL: [stayRecognitions],
  MATERIAL_RENTAL: [rentalRecognitions],
  PROPERTY_RENTAL: [propertyRecognitions],
  SHOP: [tradeRecognitions],
  BAR: [tradeRecognitions],
  PRESSING: [serviceRecognitions],
  CAR_WASH: [serviceRecognitions],
  OTHER: [tradeRecognitions, serviceRecognitions],
};

const int = (v) => Math.round(Number(v || 0));

/**
 * Debts of [fromKey, toKey]: those that existed before the app (added as opening balances) and those
 * cancelled without their sale being voided (written off: what was still owed).
 */
export async function debtRecognitions({ department, fromKey, toKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [opening, cancelled] = await Promise.all([
    client.debt.findMany({ where: { departmentId: department.id, source: "OPENING_BALANCE", date: { gte: start, lte: end } }, select: { id: true, referenceNo: true, debtorName: true, amountOwed: true, date: true } }),
    client.debt.findMany({
      where: { departmentId: department.id, status: "CANCELLED", voidedAt: { gte: start, lte: end }, OR: [{ transactionId: null }, { transaction: { status: { not: "VOIDED" } } }] },
      select: { id: true, referenceNo: true, debtorName: true, amountOwed: true, voidedAt: true, voidReason: true, payments: { where: { voidedAt: null }, select: { amount: true } } },
    }),
  ]);
  return writeOffsAndOpenings({ department, opening, cancelled, timeZone });
}

/** Pure part of debtRecognitions. */
export function writeOffsAndOpenings({ department, opening, cancelled, timeZone }) {
  const out = [];
  for (const d of opening) {
    out.push({ sourceKey: `debt-opening:${d.id}`, kind: "opening-debt", dateKey: toDateKey(d.date, timeZone), amount: int(d.amountOwed), partner: { key: `debt:${d.id}`, name: d.debtorName }, label: `Debt from before the app · ${d.debtorName}`, reference: d.referenceNo, departmentId: department.id });
  }
  for (const d of cancelled) {
    const left = int(d.amountOwed) - d.payments.reduce((s, p) => s + int(p.amount), 0);
    if (left > 0) out.push({ sourceKey: `debt-write-off:${d.id}`, kind: "write-off", dateKey: toDateKey(d.voidedAt, timeZone), amount: left, partner: { key: `debt:${d.id}`, name: d.debtorName }, label: `Debt written off · ${d.debtorName}${d.voidReason ? ` · ${d.voidReason}` : ""}`, reference: d.referenceNo, departmentId: department.id });
  }
  return out;
}

/** Every recognition of `department` dated in [fromKey, toKey]. */
export async function recognitionsFor({ department, fromKey, toKey, timeZone, client = db }) {
  const own = BY_DOMAIN[department.domain] || [];
  const lists = await Promise.all([...own.map((f) => f({ department, fromKey, toKey, timeZone, client })), debtRecognitions({ department, fromKey, toKey, timeZone, client })]);
  return lists.flat().filter((r) => r.dateKey >= fromKey && r.dateKey <= toKey);
}
