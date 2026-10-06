/**
 * One search box across an event rental department: customers (name, phone, company, e-mail),
 * bookings (reference, customer, event type, place), items (name, code, category, supplier),
 * money records (reference no., payee, description, MoMo / bank reference) and documents
 * (dispatch notes, return notes, purchases). Each group is capped; case-insensitive.
 */
import { db } from "@/lib/prisma";
import { categoryLabel } from "@/data/categories";
import { ORDER_STATUS_LABELS } from "./booking-math";
import { dateKeyOf } from "@/lib/venue/dates";
import { toDateKey } from "@/lib/timezone";

const like = (q) => ({ contains: q, mode: "insensitive" });

/** Cleans a query: trimmed, at most 80 characters; null when shorter than 2. */
export function searchQuery(raw) {
  const q = String(raw ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  return q.length >= 2 ? q : null;
}

export async function rentalSearch({ departmentId, q: raw, timeZone, take = 20, client = db }) {
  const q = searchQuery(raw);
  if (!q) return null;
  const digits = q.replace(/\D/g, "");
  const [customers, bookings, items, money, checks, purchases] = await Promise.all([
    client.venueClient.findMany({
      where: { departmentId, OR: [{ name: like(q) }, { company: like(q) }, { email: like(q) }, ...(digits.length >= 3 ? [{ phone: { contains: digits } }, { phoneAlt: { contains: digits } }] : [])] },
      select: { id: true, name: true, phone: true, company: true, _count: { select: { rentalOrders: true } } },
      orderBy: { name: "asc" },
      take,
    }),
    client.rentalOrder.findMany({
      where: { departmentId, OR: [{ referenceNo: like(q) }, { eventType: like(q) }, { eventLocation: like(q) }, { client: { name: like(q) } }, { client: { phone: { contains: digits || q } } }] },
      select: { id: true, referenceNo: true, eventType: true, eventDate: true, status: true, agreedPrice: true, client: { select: { name: true } } },
      orderBy: { eventDate: "desc" },
      take,
    }),
    client.rentalItem.findMany({
      where: { departmentId, OR: [{ name: like(q) }, { code: like(q) }, { category: like(q) }, { supplier: like(q) }] },
      select: { id: true, code: true, name: true, category: true, owned: true, out: true, damaged: true, inRepair: true, missing: true, archivedAt: true },
      orderBy: { name: "asc" },
      take,
    }),
    client.transaction.findMany({
      where: { departmentId, OR: [{ referenceNo: like(q) }, { counterparty: like(q) }, { description: like(q) }, { reference: like(q) }, { receivedByName: like(q) }] },
      select: { id: true, referenceNo: true, type: true, category: true, amount: true, date: true, status: true, counterparty: true, description: true, rentalOrderId: true },
      orderBy: { date: "desc" },
      take,
    }),
    client.rentalCheck.findMany({
      where: { departmentId, OR: [{ referenceNo: like(q) }, { counterpart: like(q) }] },
      select: { id: true, referenceNo: true, kind: true, date: true, orderId: true, order: { select: { referenceNo: true, client: { select: { name: true } } } } },
      orderBy: { date: "desc" },
      take,
    }),
    client.purchase.findMany({
      where: { departmentId, OR: [{ supplierName: like(q) }, { reference: like(q) }, { lines: { some: { description: like(q) } } }, { transaction: { referenceNo: like(q) } }] },
      select: { id: true, supplierName: true, totalAmount: true, date: true, status: true, transaction: { select: { referenceNo: true } } },
      orderBy: { date: "desc" },
      take,
    }),
  ]);
  const groups = {
    customers: customers.map((c) => ({ id: c.id, title: c.name, detail: [c.company, c.phone, `${c._count.rentalOrders} booking(s)`].filter(Boolean).join(" · "), href: `/customers/${c.id}` })),
    bookings: bookings.map((o) => ({ id: o.id, title: `${o.referenceNo} · ${o.eventType} · ${o.client.name}`, detail: `${dateKeyOf(o.eventDate)} · ${ORDER_STATUS_LABELS[o.status] || o.status}`, amount: o.agreedPrice, href: `/bookings/${o.id}` })),
    items: items.map((i) => ({ id: i.id, title: `${i.code} · ${i.name}`, detail: `${i.category} · ${i.owned - i.out - i.damaged - i.inRepair - i.missing} in store of ${i.owned}${i.archivedAt ? " · archived" : ""}`, href: `/stock/${i.id}` })),
    money: money.map((t) => ({
      id: t.id,
      title: `${t.referenceNo} · ${categoryLabel(t.category) || t.type}`,
      detail: [toDateKey(t.date, timeZone), t.counterparty, t.description, t.status === "VOIDED" ? "void" : null].filter(Boolean).join(" · "),
      amount: Number(t.amount),
      href: t.type === "BOOKING_PAYMENT" && t.rentalOrderId ? `/bookings/${t.rentalOrderId}/documents/receipt?t=${t.id}` : `/money?ref=${encodeURIComponent(t.referenceNo)}`,
    })),
    documents: [
      ...checks.map((c) => ({ id: c.id, title: `${c.referenceNo} · ${c.kind === "DISPATCH" ? "Dispatch note" : "Return note"}`, detail: `${toDateKey(c.date, timeZone)} · ${c.order.referenceNo} · ${c.order.client.name}`, href: `/bookings/${c.orderId}` })),
      ...purchases.map((p) => ({ id: p.id, title: `${p.transaction?.referenceNo || "Purchase"} · ${p.supplierName || "Purchase"}`, detail: `${toDateKey(p.date, timeZone)}${p.status === "VOIDED" ? " · void" : ""}`, amount: Number(p.totalAmount), href: `/purchases` })),
    ],
  };
  return { q, groups, total: Object.values(groups).reduce((s, g) => s + g.length, 0) };
}
