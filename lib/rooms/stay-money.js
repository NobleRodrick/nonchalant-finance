/**
 * Money of stays, run by the operations inside their transaction: payments received (receipt
 * RC-0001) and refunds (RF-0001). Every payment says who received it, how, with which external
 * reference, and may carry proof (photo or PDF). Payments move the department's cash drawer like
 * any money record, so "Cash to Boss" and the cash count include them. The money of a stay is
 * an advance until its nights are stayed (lib/rooms/stay-math → nightlyRevenue).
 */
import { recordAudit } from "@/lib/audit";
import { invalid, notFound } from "@/lib/errors";
import { assertCanPost } from "@/lib/posting-guard";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES } from "@/lib/documents/sequence";
import { PAID_METHODS, createTransaction, departmentDrawer, requireAmount } from "@/lib/finance/posting-service";
import { bookingFigures } from "@/lib/finance/booking-money";
import { formatMoney } from "@/lib/format";
import { dateKeyOf } from "@/lib/venue/dates";

const text = (v, max = 300) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max) || null;

/** Money of a stay summed by the database → its figures (total = the stay's price). */
export async function stayWithFigures(tx, department, stayId) {
  const stay = await tx.roomBooking.findFirst({ where: { id: stayId || "-", departmentId: department.id }, include: { room: { select: { id: true, name: true } } } });
  if (!stay) throw notFound("Stay not found.");
  const money = await tx.transaction.groupBy({ by: ["type", "status"], where: { stayId: stay.id, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, _sum: { amount: true } });
  const figures = bookingFigures({ agreedPrice: stay.totalPrice, status: stay.status, money: money.map((m) => ({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) })) });
  return { stay, figures };
}

/** Serializes money changes of one stay (two payments at the same moment see each other). */
async function lockStay(tx, stayId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`stay-money:${stayId}`}))`;
}

/** A payment received for a stay: not more than the balance (unless `overpay`), not on a cancelled or free stay. */
export async function recordStayPayment(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  await lockStay(tx, input?.stayId);
  const { stay, figures } = await stayWithFigures(tx, department, input?.stayId);
  if (stay.status === "CANCELLED") throw invalid(`Stay ${stay.referenceNo} is cancelled: no payment can be received for it.`);
  if (stay.complimentary) throw invalid(`Stay ${stay.referenceNo} is free (venue package): nothing is paid for it.`);
  const amount = requireAmount(input.amount);
  const method = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(method)) throw invalid("Choose how the money was received: cash, Mobile Money or bank.");
  if (amount > figures.balance && !input.overpay) {
    throw invalid(figures.balance <= 0 ? `Stay ${stay.referenceNo} is already paid in full.` : `The balance of ${stay.referenceNo} is ${formatMoney(figures.balance)}: the payment cannot be more (or mark it as an overpayment).`);
  }
  const reference = text(input.reference, 80);
  if (method !== "CASH" && !reference) throw invalid("Enter the transaction reference of the Mobile Money or bank payment.");
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const receivedBy = text(input.receivedByName, 80) || user.name;
  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.BOOKING_PAYMENT,
    data: {
      type: "BOOKING_PAYMENT",
      amount,
      paymentMethod: method,
      customerName: stay.guestName,
      counterparty: stay.guestName,
      reference,
      receivedByName: receivedBy,
      description: text(input.remarks, 300) || `Payment for ${stay.referenceNo} (${stay.room.name}, ${dateKeyOf(stay.checkIn)} → ${dateKeyOf(stay.checkOut)})`,
      category: "stay-payment",
      operationCategory: "SALE_SERVICES",
      date,
      accountId: account.id,
      stayId: stay.id,
      roomId: stay.roomId,
      idempotencyKey: ctx.key,
    },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: department.id });
  const after = bookingFigures({ agreedPrice: stay.totalPrice, status: stay.status, money: [{ type: "BOOKING_PAYMENT", amount: figures.received + amount }, { type: "BOOKING_REFUND", amount: figures.refunded }] });
  await recordAudit(tx, { user, departmentId: department.id, action: "STAY_PAYMENT_RECEIVED", entityType: "RoomBooking", entityId: stay.id, after: { referenceNo: transaction.referenceNo, amount, method, receivedBy, reference, balance: after.balance } });
  return { referenceNo: transaction.referenceNo, transactionId: transaction.id, stayId: stay.id, amount, balance: after.balance, paymentStatus: after.paymentStatus };
}

/** Money given back to a guest (cancellation, overpayment, early departure): never more than was paid. */
export async function recordStayRefund(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  await lockStay(tx, input?.stayId);
  const { stay, figures } = await stayWithFigures(tx, department, input?.stayId);
  const amount = requireAmount(input.amount);
  const method = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(method)) throw invalid("Choose how the money was given back.");
  if (amount > figures.paid) throw invalid(`Only ${formatMoney(figures.paid)} was paid for ${stay.referenceNo}: the refund cannot be more.`);
  if (stay.status !== "CANCELLED" && amount > -figures.balance) {
    throw invalid(`Stay ${stay.referenceNo} is not cancelled and was not overpaid${figures.balance < 0 ? ` by more than ${formatMoney(-figures.balance)}` : ""}: cancel it or lower its price first, or refund only what was paid too much.`);
  }
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the money is given back.");
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.BOOKING_REFUND,
    data: {
      type: "BOOKING_REFUND",
      amount,
      paymentMethod: method,
      customerName: stay.guestName,
      counterparty: stay.guestName,
      reference: text(input.reference, 80),
      receivedByName: text(input.givenByName, 80) || user.name,
      description: `Refund for ${stay.referenceNo}: ${reason}`,
      category: "stay-refund",
      operationCategory: "DISCOUNT_CUSTOMER",
      date,
      accountId: account.id,
      stayId: stay.id,
      roomId: stay.roomId,
      idempotencyKey: ctx.key,
    },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: department.id });
  await recordAudit(tx, { user, departmentId: department.id, action: "STAY_REFUND_GIVEN", entityType: "RoomBooking", entityId: stay.id, after: { referenceNo: transaction.referenceNo, amount, method, reason } });
  return { referenceNo: transaction.referenceNo, transactionId: transaction.id, stayId: stay.id, amount };
}
