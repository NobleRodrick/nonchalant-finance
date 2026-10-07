/**
 * The figures of a shop, bar, pressing, car wash or other activity on the Boss overview card:
 * sales of the day, stock value and products low or out, open tabs (bar), crates owed (bar);
 * tickets in the shop, ready, late and left owing (job tickets). Cheap reads, one department each.
 */
import { db } from "@/lib/prisma";
import { rangeBounds } from "@/lib/timezone";
import { TRADE_DOMAINS, SERVICE_DOMAINS } from "@/lib/domains/trade";
import { isLow, packagingBalances, qty } from "./stock-math";
import { ticketMoney } from "@/lib/services/ticket-math";

export async function tradeCardSummary({ department, dateKey, timeZone, now = new Date(), client = db }) {
  const { start, end } = rangeBounds(dateKey, dateKey, timeZone);
  const out = {};
  if (TRADE_DOMAINS.includes(department.domain)) {
    const [sales, products, tabs, crates] = await Promise.all([
      client.transaction.aggregate({ where: { departmentId: department.id, type: "SALE", status: { not: "VOIDED" }, date: { gte: start, lte: end } }, _sum: { amount: true }, _count: true }),
      client.tradeProduct.findMany({ where: { departmentId: department.id, isActive: true, kind: "GOODS" }, select: { quantity: true, costPrice: true, lowStock: true, kind: true } }),
      department.domain === "BAR" ? client.tradeTab.count({ where: { departmentId: department.id, status: "OPEN" } }) : 0,
      department.domain === "BAR" ? client.packagingMovement.findMany({ where: { departmentId: department.id, voidedAt: null }, select: { kind: true, quantity: true, amount: true } }) : [],
    ]);
    out.trade = {
      sales: Math.round(Number(sales._sum.amount || 0)),
      salesCount: sales._count,
      stockValue: products.reduce((s, p) => s + Math.round(qty(p.quantity) * p.costPrice), 0),
      low: products.filter((p) => isLow(p) && qty(p.quantity) > 0).length,
      empty: products.filter((p) => qty(p.quantity) <= 0).length,
      tabs,
      cratesOwed: department.domain === "BAR" ? packagingBalances(crates).owedToSuppliers : null,
    };
  }
  if (SERVICE_DOMAINS.includes(department.domain)) {
    const tickets = await client.serviceTicket.findMany({ where: { departmentId: department.id, OR: [{ status: { in: ["RECEIVED", "IN_PROGRESS", "READY"] } }, { status: "COLLECTED", collectedAt: { gte: new Date(now.getTime() - 90 * 86400000) } }] }, select: { status: true, total: true, promisedAt: true, collectedAt: true, records: { where: { type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, select: { type: true, status: true, amount: true } } } });
    const open = tickets.filter((t) => t.status !== "COLLECTED");
    const collectedToday = tickets.filter((t) => t.status === "COLLECTED" && t.collectedAt >= start && t.collectedAt <= end);
    const owing = tickets.filter((t) => t.status === "COLLECTED" && ticketMoney(t, t.records).balance > 0);
    out.services = {
      open: open.length,
      ready: open.filter((t) => t.status === "READY").length,
      late: open.filter((t) => t.status !== "READY" && t.promisedAt && t.promisedAt < now).length,
      collectedToday: collectedToday.length,
      revenueToday: collectedToday.reduce((s, t) => s + t.total, 0),
      owing: owing.reduce((s, t) => s + ticketMoney(t, t.records).balance, 0),
    };
  }
  return out;
}
