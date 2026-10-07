/**
 * Money records of a department shaped for the posting rules (lib/accounting/rules.js): the business
 * date, and the partner whose account they move (the booking, stay, order or contract they belong
 * to, the debt of a credit sale or repayment, the supplier of an expense or bill).
 */
import { db } from "@/lib/prisma";
import { toDateKey } from "@/lib/timezone";

const SELECT = {
  id: true,
  type: true,
  status: true,
  amount: true,
  grossAmount: true,
  discountAmount: true,
  paymentMethod: true,
  category: true,
  operationCategory: true,
  date: true,
  referenceNo: true,
  description: true,
  counterparty: true,
  customerName: true,
  departmentId: true,
  taxAmount: true,
  updatedAt: true,
  bookingId: true,
  stayId: true,
  rentalOrderId: true,
  leaseId: true,
  supplierId: true,
  supplierBillId: true,
  serviceTicketId: true,
  serviceTicket: { select: { customerName: true, vehiclePlate: true } },
  booking: { select: { client: { select: { name: true } } } },
  stay: { select: { guestName: true } },
  rentalOrder: { select: { client: { select: { name: true } } } },
  lease: { select: { client: { select: { name: true } } } },
  debt: { select: { id: true, debtorName: true } },
  debtPayment: { select: { debt: { select: { id: true, debtorName: true } } } },
  supplier: { select: { id: true, name: true } },
};

/** The partner account a money record moves, or null (cash sales, expenses paid at once …). */
export function partnerOf(t) {
  if (t.bookingId) return { key: `booking:${t.bookingId}`, name: t.booking?.client?.name || t.counterparty || "Client" };
  if (t.stayId) return { key: `stay:${t.stayId}`, name: t.stay?.guestName || t.counterparty || "Guest" };
  if (t.rentalOrderId) return { key: `order:${t.rentalOrderId}`, name: t.rentalOrder?.client?.name || t.counterparty || "Customer" };
  if (t.serviceTicketId && ["BOOKING_PAYMENT", "BOOKING_REFUND"].includes(t.type)) return { key: `ticket:${t.serviceTicketId}`, name: t.serviceTicket?.customerName || t.serviceTicket?.vehiclePlate || t.counterparty || "Walk-in customer" };
  if (t.leaseId) return { key: `lease:${t.leaseId}`, name: t.lease?.client?.name || t.counterparty || "Tenant" };
  if (t.debt) return { key: `debt:${t.debt.id}`, name: t.debt.debtorName };
  if (t.debtPayment?.debt) return { key: `debt:${t.debtPayment.debt.id}`, name: t.debtPayment.debt.debtorName };
  if (t.supplier) return { key: `supplier:${t.supplier.id}`, name: t.supplier.name };
  const name = (t.counterparty || t.customerName || "").trim();
  if (name) return { key: `name:${name.toLowerCase().replace(/\s+/g, " ")}`, name };
  return null;
}

export function shapeTransaction(t, timeZone) {
  return {
    ...t,
    amount: Number(t.amount),
    grossAmount: t.grossAmount === null || t.grossAmount === undefined ? null : Number(t.grossAmount),
    discountAmount: Number(t.discountAmount || 0),
    dateKey: toDateKey(t.date, timeZone),
    partner: partnerOf(t),
  };
}

/**
 * Money records of a department dated from `from` (a Date) and, when `changedSince` is given, only
 * those created or changed since then.
 */
export async function transactionsFor({ departmentId, from, changedSince, timeZone, client = db }) {
  const where = { departmentId, ...(from ? { date: { gte: from } } : {}), ...(changedSince ? { updatedAt: { gte: changedSince } } : {}) };
  const rows = await client.transaction.findMany({ where, select: SELECT, orderBy: { date: "asc" } });
  return rows.map((t) => shapeTransaction(t, timeZone));
}
