/**
 * Money of event rental bookings, run by the operations inside their transaction: payments
 * received (receipt RC-0001) and refunds (RF-0001). Every payment says who received it, how, with
 * which external reference, and may carry proof. Payments move the department's cash drawer like
 * any money record (Cash to Boss and the cash count include them). A booking's price is revenue of
 * its event date; money received before is the customer's advance.
 *
 *   balance = items + services − discount + charges − (payments − refunds)
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { assertCanPost } from "@/lib/posting-guard";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES } from "@/lib/documents/sequence";
import { PAID_METHODS, createTransaction, departmentDrawer, requireAmount } from "@/lib/finance/posting-service";
import { bookingFigures } from "@/lib/finance/booking-money";
import { formatMoney } from "@/lib/format";

const text = (v, max = 300) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max) || null;

/** A booking and its money figures (summed by the database), under a lock on its money. */
export async function orderWithFigures(tx, department, orderId, { lock = true } = {}) {
  if (lock) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rental-money:${orderId || "-"}`}))`;
  const order = await tx.rentalOrder.findFirst({ where: { id: orderId || "-", departmentId: department.id }, include: { client: { select: { name: true } } } });
  if (!order) throw notFound("Booking not found in this department.");
  const [money, charges] = await Promise.all([
    tx.transaction.groupBy({ by: ["type", "status"], where: { rentalOrderId: order.id, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, _sum: { amount: true } }),
    tx.rentalCharge.aggregate({ where: { orderId: order.id, voidedAt: null }, _sum: { amount: true } }),
  ]);
  const figures = bookingFigures({ agreedPrice: order.agreedPrice, status: order.status, charges: [{ amount: charges._sum.amount || 0 }], money: money.map((m) => ({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) })) });
  return { order, figures };
}

function method(input, what) {
  const m = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(m)) throw invalid(`Choose how the money was ${what}: cash, Mobile Money, bank transfer or other.`);
  return m;
}

/**
 * A payment received for a booking (deposit or balance): not more than the balance unless
 * `overpay`; never on a cancelled booking. Mobile Money, bank and other methods need their
 * transaction reference.
 */
export async function recordOrderPayment(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const { order, figures } = await orderWithFigures(tx, department, input?.orderId);
  if (order.status === "CANCELLED") throw conflict(`${order.referenceNo} is cancelled: no payment can be received for it.`);
  const amount = requireAmount(input.amount);
  const m = method(input, "received");
  if (amount > figures.balance && !input.overpay) {
    throw invalid(figures.balance <= 0 ? `${order.referenceNo} is already paid in full.` : `The balance of ${order.referenceNo} is ${formatMoney(figures.balance)}: the payment cannot be more.`);
  }
  const reference = text(input.reference, 80);
  if (m !== "CASH" && !reference) throw invalid("Enter the transaction reference (Mobile Money id, bank slip, cheque number…).");
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
      paymentMethod: m,
      customerName: order.client.name,
      counterparty: order.client.name,
      reference,
      receivedByName: receivedBy,
      description: text(input.remarks, 300) || `Payment for ${order.referenceNo} (${order.eventType})`,
      category: "rental-payment",
      operationCategory: "SALE_SERVICES",
      date,
      accountId: account.id,
      rentalOrderId: order.id,
      idempotencyKey: ctx.key,
    },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: department.id });
  const balance = figures.balance - amount;
  await recordAudit(tx, { user, departmentId: department.id, action: "RENTAL_PAYMENT_RECEIVED", entityType: "RentalOrder", entityId: order.id, after: { referenceNo: transaction.referenceNo, amount, method: m, receivedBy, reference, balance } });
  return { referenceNo: transaction.referenceNo, transactionId: transaction.id, orderId: order.id, amount, balance };
}

/**
 * Money given back to a customer (cancellation, overpayment): never more than was paid; on a
 * booking that is not cancelled, only what was paid too much.
 */
export async function recordOrderRefund(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const { order, figures } = await orderWithFigures(tx, department, input?.orderId);
  const amount = requireAmount(input.amount);
  const m = method(input, "given back");
  if (amount > figures.paid) throw invalid(`Only ${formatMoney(figures.paid)} was paid for ${order.referenceNo}: the refund cannot be more.`);
  if (order.status !== "CANCELLED" && amount > -figures.balance) {
    throw invalid(`${order.referenceNo} is not cancelled and was not overpaid${figures.balance < 0 ? ` by more than ${formatMoney(-figures.balance)}` : ""}: cancel it or change its price first.`);
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
      paymentMethod: m,
      customerName: order.client.name,
      counterparty: order.client.name,
      reference: text(input.reference, 80),
      receivedByName: text(input.givenByName, 80) || user.name,
      description: `Refund for ${order.referenceNo}: ${reason}`,
      category: "rental-refund",
      operationCategory: "DISCOUNT_CUSTOMER",
      date,
      accountId: account.id,
      rentalOrderId: order.id,
      idempotencyKey: ctx.key,
    },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: department.id });
  await recordAudit(tx, { user, departmentId: department.id, action: "RENTAL_REFUND_GIVEN", entityType: "RentalOrder", entityId: order.id, after: { referenceNo: transaction.referenceNo, amount, method: m, reason } });
  return { referenceNo: transaction.referenceNo, transactionId: transaction.id, orderId: order.id, amount };
}
