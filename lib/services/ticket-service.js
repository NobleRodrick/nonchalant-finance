/**
 * Job tickets (pressing, car wash, jobs): from drop-off to collection. A ticket lists the items or
 * services with their price (the price list, or another price with the right), express surcharge,
 * discount (with the right; loyalty washes are free automatically), the customer (or a vehicle
 * plate), tag numbers, the promised time. Payments are customer payments (receipts RC-…) until the
 * ticket is collected: then it is revenue, and the washers' commissions are earned. A ticket is
 * cancelled with a reason, never deleted; money paid on it is refunded or kept.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { permits, PERMISSIONS } from "@/lib/permissions";
import { grantsIn } from "@/lib/access";
import { assertCanPost } from "@/lib/posting-guard";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { PAID_METHODS, createTransaction, departmentDrawer, requireAmount } from "@/lib/finance/posting-service";
import { resolveClient } from "@/lib/clients/client-service";
import { linkAttachments } from "@/lib/attachments";
import { formatMoney } from "@/lib/format";
import { instantForDateKey, isDateKey } from "@/lib/timezone";
import { decimal, text } from "@/lib/property/input";
import { checkDiscount } from "@/lib/trade/sale-service";
import { commissions, loyaltyFree, priceOf, ticketMoney, ticketTotals } from "./ticket-math";
import { serviceSettings } from "./settings";
import { workerOf } from "./catalog-service";

const plateOf = (v) => text(v, 20)?.toUpperCase().replace(/[^A-Z0-9]/g, "") || null;

export async function ticketOf(tx, department, ticketId, { lock = true } = {}) {
  if (lock) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`service-ticket:${ticketId || "-"}`}))`;
  const t = await tx.serviceTicket.findFirst({ where: { id: ticketId || "-", departmentId: department.id }, include: { lines: { orderBy: { position: "asc" } } } });
  if (!t) throw notFound("Ticket not found in this department.");
  const money = await tx.transaction.findMany({ where: { serviceTicketId: t.id, type: { in: ["BOOKING_PAYMENT", "BOOKING_REFUND"] } }, select: { type: true, status: true, amount: true } });
  return { ticket: t, figures: ticketMoney(t, money) };
}

/** Lines read from the input against the price list; another price needs the right to change prices. */
async function readLines(tx, ctx, raw) {
  const lines = (Array.isArray(raw) ? raw : []).filter((l) => l && (l.itemId || text(l.label)) && Number(l.quantity));
  if (!lines.length) throw invalid("Add at least one item or service.");
  if (lines.length > 100) throw invalid("At most 100 lines on a ticket.");
  const items = await tx.serviceItem.findMany({ where: { id: { in: lines.map((l) => l.itemId).filter(Boolean) }, departmentId: ctx.department.id } });
  const canPrice = permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(ctx.user, ctx.department.id));
  const workerIds = [...new Set(lines.map((l) => l.workerId).filter(Boolean))];
  for (const id of workerIds) await workerOf(tx, ctx.department, id);
  const out = lines.map((l, i) => {
    const it = l.itemId ? items.find((x) => x.id === l.itemId) : null;
    if (l.itemId && !it) throw invalid(`Line ${i + 1}: the service is not in this price list.`);
    if (it && !it.isActive) throw invalid(`${it.name} is no longer offered.`);
    const quantity = decimal(l.quantity, `The quantity on line ${i + 1}`);
    if (!quantity) throw invalid(`Line ${i + 1}: enter the quantity.`);
    const listPrice = it ? priceOf(it, l.variant) : null;
    const price = l.unitPrice === undefined || l.unitPrice === null || l.unitPrice === "" ? listPrice : Math.round(Number(l.unitPrice));
    if (price === null || !Number.isInteger(price) || price < 0) throw invalid(`Line ${i + 1}: enter the price.`);
    if (price !== listPrice && !canPrice) throw forbidden(`Your rights do not include changing prices (${it ? `${it.name}: ${formatMoney(listPrice)}` : "a line without a price list"}).`);
    const label = text(l.label, 120) || [it?.name, l.variant].filter(Boolean).join(" · ");
    return { itemId: it?.id || null, variant: text(l.variant, 40), label, quantity, unitPrice: price, workerId: l.workerId || null, notes: text(l.notes, 200), position: i };
  });
  return { lines: out, items: Object.fromEntries(items.map((x) => [x.id, x])) };
}

function promised(input, ctx, settings) {
  if (input.promisedAt) {
    const d = new Date(input.promisedAt);
    if (Number.isNaN(d.getTime())) throw invalid("The promised time is not valid.");
    return d;
  }
  if (isDateKey(input.promisedKey || "")) return instantForDateKey(input.promisedKey, ctx.timeZone, ctx.now);
  return new Date((ctx.date || ctx.now).getTime() + settings.defaultHours * 3600000);
}

/** A new ticket (drop-off / arrival), with an optional payment at once. */
export async function createTicket(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const settings = serviceSettings(department);
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const { lines } = await readLines(tx, ctx, input.lines);
  const plate = plateOf(input.vehiclePlate);
  if (department.domain === "CAR_WASH" && !plate) throw invalid("Enter the vehicle's plate number.");
  const client = input.client?.name || input.clientId ? await resolveClient(tx, ctx, { clientId: input.clientId, client: input.client }) : null;
  const surchargePct = input.express ? settings.expressPct : 0;
  let discount = Math.round(Number(input.discount) || 0);
  let discountReason = text(input.discountReason, 200);
  // Loyalty: the Nth wash of a vehicle (or a customer) is free.
  let loyalty = false;
  if (settings.loyaltyEvery > 1 && (plate || client)) {
    const before = await tx.serviceTicket.count({ where: { departmentId: department.id, status: "COLLECTED", total: { gt: 0 }, ...(plate ? { vehiclePlate: plate } : { clientId: client.id }) } });
    if (loyaltyFree(before, settings.loyaltyEvery)) {
      loyalty = true;
      const t0 = ticketTotals(lines, { surchargePct });
      discount = t0.subtotal + t0.surcharge;
      discountReason = `Loyalty: ${settings.loyaltyEvery}th ${department.domain === "CAR_WASH" ? "wash" : "ticket"} free`;
    }
  }
  const totals = ticketTotals(lines, { surchargePct, discount });
  if (!loyalty) checkDiscount(ctx, totals.discount, discountReason);
  const ticket = await tx.serviceTicket.create({
    data: {
      organizationId: user.organizationId,
      departmentId: department.id,
      referenceNo: await nextReference(tx, department.id, DOC_TYPES.TICKET),
      clientId: client?.id || null,
      customerName: client?.name || text(input.customerName, 120),
      customerPhone: client?.phone || text(input.customerPhone, 30),
      vehiclePlate: plate,
      vehicleType: text(input.vehicleType, 40),
      status: input.start ? "IN_PROGRESS" : "RECEIVED",
      startedAt: input.start ? date : null,
      express: Boolean(input.express),
      surchargePct,
      discount: totals.discount,
      discountReason: totals.discount ? discountReason : null,
      subtotal: totals.subtotal,
      total: totals.total,
      tagNo: text(input.tagNo, 60),
      notes: text(input.notes, 1000),
      receivedAt: date,
      promisedAt: promised(input, ctx, settings),
      createdById: user.id,
      lines: { create: totals.lines.map((l) => ({ itemId: l.itemId, variant: l.variant, label: l.label, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total, workerId: l.workerId, notes: l.notes, position: l.position })) },
    },
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "TICKET_CREATED", entityType: "ServiceTicket", entityId: ticket.id, after: { referenceNo: ticket.referenceNo, total: ticket.total, loyalty, express: ticket.express, plate } });
  let payment = null;
  if (Number(input.payment?.amount) > 0) payment = await recordTicketPayment(tx, ctx, { ...input.payment, ticketId: ticket.id });
  return { ticketId: ticket.id, referenceNo: ticket.referenceNo, total: ticket.total, loyalty, payment };
}

/** Lines, prices, express, discount, promised time, notes — while the ticket is not collected. */
export async function updateTicket(tx, ctx, input) {
  const { ticket, figures } = await ticketOf(tx, ctx.department, input.ticketId);
  if (["COLLECTED", "CANCELLED"].includes(ticket.status)) throw conflict(`${ticket.referenceNo} is ${ticket.status.toLowerCase()}: it cannot change.`);
  const settings = serviceSettings(ctx.department);
  const { lines } = input.lines ? await readLines(tx, ctx, input.lines) : { lines: ticket.lines };
  const surchargePct = input.express === undefined ? ticket.surchargePct : input.express ? settings.expressPct : 0;
  const discount = input.discount === undefined ? ticket.discount : Math.round(Number(input.discount) || 0);
  const discountReason = input.discountReason === undefined ? ticket.discountReason : text(input.discountReason, 200);
  const totals = ticketTotals(lines, { surchargePct, discount });
  if (input.discount !== undefined) checkDiscount(ctx, totals.discount, discountReason);
  if (totals.total < figures.paid) throw conflict(`${formatMoney(figures.paid)} was already paid: the total cannot be less (refund the difference first).`);
  if (input.lines) {
    await tx.serviceTicketLine.deleteMany({ where: { ticketId: ticket.id } });
    await tx.serviceTicketLine.createMany({ data: totals.lines.map((l, i) => ({ ticketId: ticket.id, itemId: l.itemId, variant: l.variant, label: l.label, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total, workerId: l.workerId, notes: l.notes, position: i })) });
  }
  const t = await tx.serviceTicket.update({
    where: { id: ticket.id },
    data: {
      express: input.express === undefined ? ticket.express : Boolean(input.express),
      surchargePct,
      discount: totals.discount,
      discountReason: totals.discount ? discountReason : null,
      subtotal: totals.subtotal,
      total: totals.total,
      ...(input.tagNo !== undefined ? { tagNo: text(input.tagNo, 60) } : {}),
      ...(input.notes !== undefined ? { notes: text(input.notes, 1000) } : {}),
      ...(input.promisedAt || input.promisedKey ? { promisedAt: promised(input, ctx, settings) } : {}),
    },
  });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "TICKET_UPDATED", entityType: "ServiceTicket", entityId: t.id, before: { total: ticket.total }, after: { total: t.total } });
  return { ticketId: t.id, total: t.total };
}

/**
 * start | ready | collect. Collecting needs the balance paid (a payment may come with it) unless
 * `onCredit` (the right to manage debts): the customer then owes the balance. The washers'
 * commissions are fixed when the ticket is collected.
 */
export async function stepTicket(tx, ctx, input) {
  const { ticket, figures } = await ticketOf(tx, ctx.department, input.ticketId);
  const date = ctx.date || ctx.now;
  const step = input.step;
  const allowed = { start: ["RECEIVED"], ready: ["RECEIVED", "IN_PROGRESS"], collect: ["READY", "RECEIVED", "IN_PROGRESS"] };
  if (!allowed[step]) throw invalid("Unknown step.");
  if (!allowed[step].includes(ticket.status)) throw conflict(`${ticket.referenceNo} is ${ticket.status.toLowerCase().replace("_", " ")}.`);
  if (step === "start") {
    const workerId = input.workerId || null;
    if (workerId) {
      await workerOf(tx, ctx.department, workerId);
      await tx.serviceTicketLine.updateMany({ where: { ticketId: ticket.id, workerId: null }, data: { workerId } });
    }
    await tx.serviceTicket.update({ where: { id: ticket.id }, data: { status: "IN_PROGRESS", startedAt: date } });
  } else if (step === "ready") {
    await tx.serviceTicket.update({ where: { id: ticket.id }, data: { status: "READY", readyAt: date } });
  } else {
    await assertCanPost(tx, { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, date, timeZone: ctx.timeZone });
    let balance = figures.balance;
    if (Number(input.payment?.amount) > 0) {
      const p = await recordTicketPayment(tx, ctx, { ...input.payment, ticketId: ticket.id, lock: false });
      balance = p.balance;
    }
    if (balance > 0 && !input.onCredit) throw conflict(`${formatMoney(balance)} is still to pay on ${ticket.referenceNo}: record the payment, or let the customer owe it.`);
    if (balance > 0 && !permits(ctx.role, PERMISSIONS.DEBTS_MANAGE, grantsIn(ctx.user, ctx.department.id))) throw forbidden("Your rights do not include letting a customer leave without paying.");
    const items = await tx.serviceItem.findMany({ where: { id: { in: ticket.lines.map((l) => l.itemId).filter(Boolean) } } });
    const due = commissions(ticket.lines, Object.fromEntries(items.map((x) => [x.id, x])), { subtotal: ticket.subtotal, total: ticket.total });
    for (const [i, l] of ticket.lines.entries()) if (due[i] !== l.commission) await tx.serviceTicketLine.update({ where: { id: l.id }, data: { commission: due[i] } });
    await tx.serviceTicket.update({ where: { id: ticket.id }, data: { status: "COLLECTED", collectedAt: date, readyAt: ticket.readyAt || date } });
  }
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: `TICKET_${step.toUpperCase()}`, entityType: "ServiceTicket", entityId: ticket.id, after: { onCredit: Boolean(input.onCredit) } });
  return { ticketId: ticket.id, status: { start: "IN_PROGRESS", ready: "READY", collect: "COLLECTED" }[step] };
}

/** Cancelled with a reason; money paid is refunded (`refund`) or kept (income on the day). */
export async function cancelTicket(tx, ctx, input) {
  const { ticket, figures } = await ticketOf(tx, ctx.department, input.ticketId);
  if (["COLLECTED", "CANCELLED"].includes(ticket.status)) throw conflict(`${ticket.referenceNo} is already ${ticket.status.toLowerCase()}.`);
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the ticket is cancelled.");
  if (input.refund && figures.paid > 0) await recordTicketRefund(tx, { ...ctx }, { ticketId: ticket.id, amount: figures.paid, paymentMethod: input.paymentMethod, reference: input.reference, reason, lock: false, cancelling: true });
  await tx.serviceTicket.update({ where: { id: ticket.id }, data: { status: "CANCELLED", cancelledAt: ctx.date || ctx.now, cancelReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "TICKET_CANCELLED", entityType: "ServiceTicket", entityId: ticket.id, after: { reason, refunded: Boolean(input.refund), paid: figures.paid } });
  return { ticketId: ticket.id };
}

function method(input) {
  const m = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(m)) throw invalid("Choose how the money was paid: cash, Mobile Money, bank transfer or other.");
  if (m !== "CASH" && !text(input.reference)) throw invalid("Enter the transaction reference (Mobile Money id, bank slip …).");
  return m;
}

/** A payment on a ticket (at drop-off, on collection): never more than the balance. */
export async function recordTicketPayment(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const { ticket, figures } = input.lock === false ? await ticketOf(tx, department, input.ticketId, { lock: false }) : await ticketOf(tx, department, input.ticketId);
  if (ticket.status === "CANCELLED") throw conflict(`${ticket.referenceNo} is cancelled.`);
  const amount = requireAmount(input.amount);
  if (amount > figures.balance) throw invalid(figures.balance <= 0 ? `${ticket.referenceNo} is already paid.` : `Only ${formatMoney(figures.balance)} is left to pay on ${ticket.referenceNo}.`);
  const m = method(input);
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const t = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.BOOKING_PAYMENT,
    data: { type: "BOOKING_PAYMENT", amount, paymentMethod: m, customerName: ticket.customerName, counterparty: ticket.customerName || ticket.vehiclePlate, reference: text(input.reference, 80), receivedByName: text(input.receivedByName, 80) || user.name, description: `Payment for ${ticket.referenceNo}`, category: "ticket-payment", operationCategory: "SALE_SERVICES", date, accountId: account.id, serviceTicketId: ticket.id, idempotencyKey: input.lock === false ? null : ctx.key },
  });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: t.id, departmentId: department.id });
  await recordAudit(tx, { user, departmentId: department.id, action: "TICKET_PAYMENT", entityType: "ServiceTicket", entityId: ticket.id, after: { referenceNo: t.referenceNo, amount, method: m } });
  return { transactionId: t.id, referenceNo: t.referenceNo, amount, balance: figures.balance - amount };
}

/** Money given back (cancelled ticket, overpayment): never more than was paid. */
export async function recordTicketRefund(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const { ticket, figures } = input.lock === false ? await ticketOf(tx, department, input.ticketId, { lock: false }) : await ticketOf(tx, department, input.ticketId);
  const amount = requireAmount(input.amount);
  const limit = input.cancelling || ticket.status === "CANCELLED" ? figures.paid : Math.max(0, -figures.balance);
  if (amount > limit) throw invalid(limit <= 0 ? "Nothing was paid too much on this ticket." : `At most ${formatMoney(limit)} can be given back.`);
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the money is given back.");
  const m = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(m)) throw invalid("Choose how the money was given back.");
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const t = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.BOOKING_REFUND,
    data: { type: "BOOKING_REFUND", amount, paymentMethod: m, customerName: ticket.customerName, counterparty: ticket.customerName || ticket.vehiclePlate, reference: text(input.reference, 80), receivedByName: user.name, description: `Refund for ${ticket.referenceNo}: ${reason}`, category: "ticket-refund", operationCategory: "DISCOUNT_CUSTOMER", date, accountId: account.id, serviceTicketId: ticket.id },
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "TICKET_REFUND", entityType: "ServiceTicket", entityId: ticket.id, after: { referenceNo: t.referenceNo, amount, reason } });
  return { transactionId: t.id, referenceNo: t.referenceNo, amount };
}

/** A garment damaged or lost (pressing): the compensation paid to the customer, an expense of the ticket. */
export async function compensateTicket(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const { ticket } = await ticketOf(tx, department, input.ticketId);
  const amount = requireAmount(input.amount);
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Describe the damage or the loss.");
  const m = method(input);
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const t = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.EXPENSE,
    data: { type: "EXPENSE", amount, paymentMethod: m, counterparty: ticket.customerName, reference: text(input.reference, 80), description: `Compensation on ${ticket.referenceNo}: ${reason}`, category: "pressing-compensation", operationCategory: "OPEX_OTHER", date, accountId: account.id, serviceTicketId: ticket.id, idempotencyKey: ctx.key },
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "TICKET_COMPENSATION", entityType: "ServiceTicket", entityId: ticket.id, after: { referenceNo: t.referenceNo, amount, reason } });
  return { transactionId: t.id, referenceNo: t.referenceNo };
}

/** Marks the customer as told the ticket is ready (the page opened the WhatsApp message). */
export async function markNotified(tx, ctx, input) {
  const { ticket } = await ticketOf(tx, ctx.department, input.ticketId, { lock: false });
  await tx.serviceTicket.update({ where: { id: ticket.id }, data: { notifiedAt: new Date() } });
  return { ticketId: ticket.id };
}

/** A washer's commissions paid out (an expense); never more than earned and not yet paid. */
export async function payWorker(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`service-worker:${input.workerId || "-"}`}))`;
  const w = await workerOf(tx, department, input.workerId);
  const [earned, paid] = await Promise.all([
    tx.serviceTicketLine.aggregate({ where: { workerId: w.id, ticket: { status: "COLLECTED", departmentId: department.id } }, _sum: { commission: true } }),
    tx.transaction.aggregate({ where: { serviceWorkerId: w.id, status: { not: "VOIDED" } }, _sum: { amount: true } }),
  ]);
  const owed = (earned._sum.commission || 0) - Math.round(Number(paid._sum.amount || 0));
  const amount = requireAmount(input.amount);
  if (amount > owed) throw invalid(owed <= 0 ? `${w.name} has no commission left to be paid.` : `${w.name} has earned ${formatMoney(owed)} not yet paid.`);
  const m = input.paymentMethod || "CASH";
  if (!PAID_METHODS.includes(m)) throw invalid("Choose how the washer was paid.");
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const account = await departmentDrawer(tx, { user, departmentId: department.id });
  const t = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.EXPENSE,
    data: { type: "EXPENSE", amount, paymentMethod: m, counterparty: w.name, reference: text(input.reference, 80), description: `Commissions of ${w.name}`, category: "carwash-commission", operationCategory: "OPEX_SALARIES", date, accountId: account.id, serviceWorkerId: w.id, validatedById: user.id, validatedAt: new Date(), validationNote: "From the washers' earnings", idempotencyKey: ctx.key },
  });
  await recordAudit(tx, { user, departmentId: department.id, action: "WORKER_PAID", entityType: "ServiceWorker", entityId: w.id, after: { referenceNo: t.referenceNo, amount } });
  return { transactionId: t.id, referenceNo: t.referenceNo, owed: owed - amount };
}

export { ticketMoney, isDateKey };
