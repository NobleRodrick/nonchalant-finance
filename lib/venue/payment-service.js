/**
 * Money of venue bookings, run by the operations inside their transaction: payments received
 * (receipt RC-0001), refunds (RF-0001), and charges added to what the client owes (damages,
 * extra services: CH-0001). Every payment says who received it, how, with which external
 * reference, and may carry proof (photo or PDF). Payments move the department's cash drawer like
 * any money record, so "Cash to Boss" and the daily cash count include them.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { assertCanPost } from "@/lib/posting-guard";
import { linkAttachments } from "@/lib/attachments";
import { nextReference, DOC_TYPES } from "@/lib/documents/sequence";
import { PAID_METHODS, createTransaction, departmentDrawer, requireAmount } from "@/lib/finance/posting-service";
import { bookingFigures } from "./booking-math";
import { dateKeyOf } from "./dates";
import { formatMoney } from "@/lib/format";

const text = (v, max = 300) => String(v ?? "").trim().replace(/\s+/g, " ").slice(0, max) || null;

/** The booking with what it owes now (charges and money summed by the database). */
async function bookingWithFigures(tx, department, bookingId) {
  const b = await tx.venueBooking.findFirst({ where: { id: bookingId || "-", departmentId: department.id }, include: { client: { select: { name: true, phone: true } } } });
  if (!b) throw notFound("Booking not found.");
  const [money, charges] = await Promise.all([
    tx.transaction.groupBy({ by: ["type", "status"], where: { bookingId: b.id, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, _sum: { amount: true } }),
    tx.venueBookingCharge.aggregate({ where: { bookingId: b.id, voidedAt: null }, _sum: { amount: true } }),
  ]);
  const figures = bookingFigures({
    agreedPrice: b.agreedPrice,
    status: b.status,
    charges: [{ amount: Number(charges._sum.amount || 0) }],
    money: money.map((m) => ({ type: m.type, status: m.status, amount: Number(m._sum.amount || 0) })),
  });
  return { booking: b, figures };
}

/** Serializes money changes of one booking (two payments at the same moment see each other). */
async function lockBooking(tx, bookingId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`venue-booking-money:${bookingId}`}))`;
}

/**
 * A payment received for a booking. Not more than the balance unless `overpay` is set (the
 * client pays in advance for something else); not on a cancelled booking.
 */
export async function recordBookingPayment(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  await lockBooking(tx, input?.bookingId);
  const { booking, figures } = await bookingWithFigures(tx, department, input?.bookingId);
  if (booking.status === "CANCELLED") throw invalid(`Booking ${booking.referenceNo} is cancelled: no payment can be received for it.`);
  const amount = requireAmount(input.amount);
  const method = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(method)) throw invalid("Choose how the money was received: cash, Mobile Money or bank.");
  if (amount > figures.balance && !input.overpay) {
    throw invalid(figures.balance <= 0 ? `Booking ${booking.referenceNo} is already paid in full.` : `The balance of ${booking.referenceNo} is ${formatMoney(figures.balance)}: the payment cannot be more (or mark it as an overpayment).`);
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
      customerName: booking.client.name,
      counterparty: booking.client.name,
      reference,
      receivedByName: receivedBy,
      description: text(input.remarks, 300) || `Payment for ${booking.referenceNo} (${booking.eventType}, ${dateKeyOf(booking.eventDate)})`,
      category: "venue-booking",
      operationCategory: "SALE_SERVICES",
      date,
      accountId: account.id,
      bookingId: booking.id,
      idempotencyKey: ctx.key,
    },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: department.id });
  const after = bookingFigures({ agreedPrice: booking.agreedPrice, status: booking.status, charges: [{ amount: figures.charges }], money: [{ type: "BOOKING_PAYMENT", amount: figures.received + amount }, { type: "BOOKING_REFUND", amount: figures.refunded }] });
  await recordAudit(tx, {
    user,
    departmentId: department.id,
    action: "VENUE_PAYMENT_RECEIVED",
    entityType: "VenueBooking",
    entityId: booking.id,
    after: { referenceNo: transaction.referenceNo, amount, method, receivedBy, reference, balance: after.balance },
  });
  return { referenceNo: transaction.referenceNo, transactionId: transaction.id, bookingId: booking.id, amount, balance: after.balance, paymentStatus: after.paymentStatus };
}

/** Money given back to a client (cancellation, overpayment): never more than was paid. */
export async function recordBookingRefund(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  await lockBooking(tx, input?.bookingId);
  const { booking, figures } = await bookingWithFigures(tx, department, input?.bookingId);
  const amount = requireAmount(input.amount);
  const method = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(method)) throw invalid("Choose how the money was given back.");
  if (amount > figures.paid) throw invalid(`Only ${formatMoney(figures.paid)} was paid for ${booking.referenceNo}: the refund cannot be more.`);
  if (booking.status !== "CANCELLED" && amount > -figures.balance) {
    throw invalid(`Booking ${booking.referenceNo} is not cancelled and was not overpaid${figures.balance < 0 ? ` by more than ${formatMoney(-figures.balance)}` : ""}: cancel it first, or refund only what was paid too much.`);
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
      customerName: booking.client.name,
      counterparty: booking.client.name,
      reference: text(input.reference, 80),
      receivedByName: text(input.givenByName, 80) || user.name,
      description: `Refund for ${booking.referenceNo}: ${reason}`,
      category: "venue-refund",
      operationCategory: "DISCOUNT_CUSTOMER",
      date,
      accountId: account.id,
      bookingId: booking.id,
      idempotencyKey: ctx.key,
    },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: department.id });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_REFUND_GIVEN", entityType: "VenueBooking", entityId: booking.id, after: { referenceNo: transaction.referenceNo, amount, method, reason } });
  return { referenceNo: transaction.referenceNo, transactionId: transaction.id, bookingId: booking.id, amount };
}

const CHARGE_KINDS = ["DAMAGE", "EXTRA_SERVICE", "OTHER"];

/** Adds an amount to what the client owes (an extra service, damages …). */
export async function addBookingCharge(tx, ctx, input, { incidentId = null } = {}) {
  const { user, department } = ctx;
  await lockBooking(tx, input?.bookingId);
  const { booking } = await bookingWithFigures(tx, department, input?.bookingId);
  if (booking.status === "CANCELLED") throw invalid(`Booking ${booking.referenceNo} is cancelled: nothing can be charged on it.`);
  const kind = CHARGE_KINDS.includes(input.kind) ? input.kind : "OTHER";
  const label = text(input.label, 160);
  if (!label) throw invalid("Say what is charged (e.g. extra hours, 4 broken chairs).");
  const amount = requireAmount(input.amount);
  const charge = await tx.venueBookingCharge.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      bookingId: booking.id,
      referenceNo: await nextReference(tx, department.id, DOC_TYPES.BOOKING_CHARGE),
      kind,
      label,
      amount,
      date: ctx.date || ctx.now,
      createdById: user.id,
    },
  });
  if (incidentId) await tx.venueAssetIncident.update({ where: { id: incidentId }, data: { status: "CHARGED", chargeId: charge.id, settledAt: ctx.now } });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_CHARGE_ADDED", entityType: "VenueBooking", entityId: booking.id, after: { referenceNo: charge.referenceNo, kind, label, amount } });
  return { chargeId: charge.id, referenceNo: charge.referenceNo, bookingId: booking.id, amount };
}

/** Removes a charge added by mistake (reason required); an asset incident it settled is open again. */
export async function voidBookingCharge(tx, ctx, input) {
  const { user, department } = ctx;
  const charge = await tx.venueBookingCharge.findFirst({ where: { id: input?.chargeId || "-", departmentId: department.id }, include: { incident: true } });
  if (!charge) throw notFound("Charge not found.");
  if (charge.voidedAt) throw conflict("This charge is already removed.");
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the charge is removed.");
  await tx.venueBookingCharge.update({ where: { id: charge.id }, data: { voidedAt: ctx.now, voidReason: reason } });
  if (charge.incident) await tx.venueAssetIncident.update({ where: { id: charge.incident.id }, data: { status: "OPEN", chargeId: null, settledAt: null } });
  await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_CHARGE_REMOVED", entityType: "VenueBooking", entityId: charge.bookingId, after: { referenceNo: charge.referenceNo, amount: charge.amount, reason } });
  return { chargeId: charge.id, referenceNo: charge.referenceNo };
}
