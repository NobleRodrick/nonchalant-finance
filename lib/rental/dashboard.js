/**
 * The facts behind an event rental department's dashboard and alerts: open bookings (with their
 * money), stock, open damages, refused double bookings, expenses waiting for approval →
 * warnings (lib/rental/alert-math); today's agenda and the next events.
 */
import { db } from "@/lib/prisma";
import { addDaysToKey, rangeBounds, toDateKey } from "@/lib/timezone";
import { rentalWarnings } from "./alert-math";
import { listOrders } from "./order-queries";
import { incidentList, stockSheet, stockTotals } from "./item-queries";

const REFUSED_DAYS = 7;

export async function rentalAttention({ departmentId, todayKey, timeZone, client = db }) {
  const since = rangeBounds(addDaysToKey(todayKey, -REFUSED_DAYS), todayKey, timeZone).start;
  const [orders, items, incidents, refused, unvalidated] = await Promise.all([
    listOrders({ departmentId, todayKey, status: "open", take: 1000, client }),
    stockSheet({ departmentId, client }),
    incidentList({ departmentId, status: "OPEN", client }),
    client.auditEvent.findMany({ where: { departmentId, action: "RENTAL_DOUBLE_BOOKING_REFUSED", createdAt: { gte: since } }, select: { id: true, createdAt: true, afterJson: true }, orderBy: { createdAt: "desc" }, take: 50 }),
    client.transaction.aggregate({ where: { departmentId, type: { in: ["EXPENSE", "OTHER_EXPENSE"] }, status: { not: "VOIDED" }, validatedAt: null, NOT: { category: "rental-stock" } }, _sum: { amount: true }, _count: { _all: true } }),
  ]);
  const refusals = refused.map((a) => {
    const short = Array.isArray(a.afterJson?.shortages) ? a.afterJson.shortages : [];
    return { id: a.id, dateKey: toDateKey(a.createdAt, timeZone), label: short.map((s) => `${s.name || "item"}: ${s.requested ?? "?"} asked, ${s.available ?? "?"} free`).join(", ") || "Not enough items" };
  });
  const warnings = rentalWarnings({ orders, items, incidents, refused: refusals, unvalidated: { count: unvalidated._count._all, amount: Math.round(Number(unvalidated._sum.amount || 0)) }, todayKey });
  return { orders, items, stock: stockTotals(items), warnings };
}

/** Dashboard: warnings, today's work (items leaving, coming back, events), the next 7 days. */
export async function rentalDashboard({ departmentId, todayKey, timeZone, client = db }) {
  const { orders, stock, warnings, items } = await rentalAttention({ departmentId, todayKey, timeZone, client });
  const week = addDaysToKey(todayKey, 7);
  const holding = orders.filter((o) => ["CONFIRMED", "PREPARING", "DISPATCHED"].includes(o.status));
  return {
    warnings,
    stock,
    lowItems: items.filter((i) => i.alert).slice(0, 8),
    today: {
      leaving: holding.filter((o) => o.status !== "DISPATCHED" && o.dispatchDateKey <= todayKey),
      events: holding.filter((o) => o.eventDateKey === todayKey),
      returning: holding.filter((o) => o.status === "DISPATCHED" && o.returnDateKey <= todayKey),
    },
    upcoming: holding.filter((o) => o.eventDateKey > todayKey && o.eventDateKey <= week).sort((a, b) => a.eventDateKey.localeCompare(b.eventDateKey)),
    pipeline: {
      inquiries: orders.filter((o) => o.status === "INQUIRY").length,
      quoted: orders.filter((o) => o.status === "QUOTED").length,
      quotedValue: orders.filter((o) => o.status === "QUOTED").reduce((s, o) => s + o.agreedPrice, 0),
      out: orders.filter((o) => o.status === "DISPATCHED").length,
      toClose: orders.filter((o) => o.status === "RETURNED").length,
    },
  };
}
