/**
 * What job tickets add to the statements and the books: a ticket is revenue on the day it is
 * collected (money received before is the customer's advance); money kept on a cancelled ticket is
 * income on the day it is cancelled. Same sources for the statements (Simple) and the ledger.
 */
import { db } from "@/lib/prisma";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { SERVICE_DOMAINS } from "@/lib/domains/trade";
import { ticketMoney } from "./ticket-math";

async function parts(client, departmentId, fromKey, toKey, timeZone) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [collected, cancelled] = await Promise.all([
    client.serviceTicket.findMany({ where: { departmentId, status: "COLLECTED", collectedAt: { gte: start, lte: end } }, select: { id: true, referenceNo: true, total: true, collectedAt: true, customerName: true, vehiclePlate: true } }),
    client.serviceTicket.findMany({ where: { departmentId, status: "CANCELLED", cancelledAt: { gte: start, lte: end } }, select: { id: true, referenceNo: true, total: true, status: true, cancelledAt: true, customerName: true, vehiclePlate: true, records: { where: { type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, select: { type: true, status: true, amount: true } } } }),
  ]);
  return {
    collected: collected.map((t) => ({ ...t, dateKey: toDateKey(t.collectedAt, timeZone) })),
    cancelled: cancelled.map((t) => ({ ...t, dateKey: toDateKey(t.cancelledAt, timeZone), kept: ticketMoney(t, t.records).kept })).filter((t) => t.kept > 0),
  };
}

export async function serviceStatementFigures({ departments, fromKey, toKey, timeZone, client = db }) {
  const out = {};
  await Promise.all(
    departments
      .filter((d) => SERVICE_DOMAINS.includes(d.domain))
      .map(async (d) => {
        const p = await parts(client, d.id, fromKey, toKey, timeZone);
        const days = {};
        const day = (k) => (days[k] ||= { revenue: 0, assetLosses: 0 });
        for (const t of p.collected) day(t.dateKey).revenue += t.total;
        for (const t of p.cancelled) day(t.dateKey).revenue += t.kept;
        const servicesRevenue = p.collected.reduce((s, t) => s + t.total, 0);
        const cancellationIncome = p.cancelled.reduce((s, t) => s + t.kept, 0);
        if (servicesRevenue || cancellationIncome) out[d.id] = { servicesRevenue, cancellationIncome, days };
      })
  );
  return out;
}

export async function serviceRecognitions({ department, fromKey, toKey, timeZone, client = db }) {
  const p = await parts(client, department.id, fromKey, toKey, timeZone);
  const who = (t) => t.customerName || t.vehiclePlate || "Walk-in customer";
  return [
    ...p.collected.filter((t) => t.total).map((t) => ({ sourceKey: `ticket:${t.id}`, kind: "revenue", role: "SERVICES", dateKey: t.dateKey, amount: t.total, partner: { key: `ticket:${t.id}`, name: who(t) }, label: `${t.referenceNo} · ${who(t)}`, reference: t.referenceNo, departmentId: department.id })),
    ...p.cancelled.map((t) => ({ sourceKey: `ticket-kept:${t.id}`, kind: "revenue", role: "KEPT", dateKey: t.dateKey, amount: t.kept, partner: { key: `ticket:${t.id}`, name: who(t) }, label: `Kept on cancelled ${t.referenceNo}`, reference: t.referenceNo, departmentId: department.id })),
  ];
}
