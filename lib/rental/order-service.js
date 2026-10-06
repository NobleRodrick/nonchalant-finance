/**
 * Bookings of an event rental department (docs/EVENT_RENTAL_PLAN.md), run by the operations
 * inside their transaction. A booking that holds items (confirmed, in preparation, dispatched)
 * is checked against every other holding booking over its days, under a lock on each of its
 * items: two people booking the last chairs at the same moment cannot both get them.
 */
import { db } from "@/lib/prisma";
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { addDaysToKey, formatDateKey, isDateKey, toDateKey } from "@/lib/timezone";
import { permits, PERMISSIONS } from "@/lib/permissions";
import { resolveClient } from "@/lib/clients/client-service";
import { notifyBosses } from "@/lib/notifications";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { lockItems } from "./item-service";
import { EDITABLE_STATUSES, HOLDING_STATUSES, NEXT_STEPS, ORDER_STATUS_LABELS, availability, defaultRange, orderTotals, shortages } from "./booking-math";

const text = (v, max = 2000) => String(v ?? "").trim().slice(0, max) || null;
const MAX_LINES = 80;

function francs(value, label) {
  if (value === undefined || value === null || value === "") return 0;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw invalid(`${label} must be a whole number of francs (0 or more).`);
  return n;
}

function units(value, label) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < 1 || n > 1_000_000) throw invalid(`${label}: the quantity must be a whole number of at least 1.`);
  return n;
}

function dayKey(value, label) {
  if (!isDateKey(value)) throw invalid(`${label} is missing or not a valid date.`);
  return value;
}

const rightsOf = (ctx) => ctx.user.memberships?.find((m) => m.departmentId === ctx.department.id)?.grants;
const mayChangePrices = (ctx) => permits(ctx.role, PERMISSIONS.PRICES_CHANGE, rightsOf(ctx));

/** The person responsible: a head of the department (or the Boss). */
async function responsible(tx, ctx, id) {
  if (!id) return null;
  const person = await tx.user.findFirst({ where: { id, organizationId: ctx.user.organizationId, isActive: true, OR: [{ role: "ADMIN" }, { memberships: { some: { departmentId: ctx.department.id, isActive: true } } }] }, select: { id: true } });
  if (!person) throw invalid("The person responsible must be a head of this department.");
  return person.id;
}

/**
 * Lines as sent by the form → checked lines. Item lines take the item's list price unless another
 * price is given (which needs the right to change prices and a reason); service lines (decoration
 * work, transport, labour) have a label and a price.
 */
async function cleanLines(tx, ctx, rawLines) {
  const raw = Array.isArray(rawLines) ? rawLines : [];
  if (!raw.length) throw invalid("Add at least one item or service.");
  if (raw.length > MAX_LINES) throw invalid(`At most ${MAX_LINES} lines per booking.`);
  const ids = [...new Set(raw.filter((l) => l?.kind !== "SERVICE").map((l) => l?.itemId).filter(Boolean))];
  const items = ids.length ? await tx.rentalItem.findMany({ where: { id: { in: ids }, departmentId: ctx.department.id } }) : [];
  const byId = Object.fromEntries(items.map((i) => [i.id, i]));
  const lines = [];
  let priceChanged = false;
  for (const [i, l] of raw.entries()) {
    if (l?.kind === "SERVICE") {
      const label = text(l.label, 160);
      if (!label) throw invalid(`Line ${i + 1}: describe the service (e.g. Decoration of the hall, Transport).`);
      const unitPrice = francs(l.unitPrice, `Line ${i + 1}: the price`);
      const quantity = units(l.quantity ?? 1, label);
      lines.push({ kind: "SERVICE", itemId: null, label, quantity, listPrice: unitPrice, unitPrice, total: quantity * unitPrice, sortOrder: i });
      continue;
    }
    const item = byId[l?.itemId];
    if (!item) throw notFound(`Line ${i + 1}: item not found in this department's stock.`);
    if (item.archivedAt) throw invalid(`${item.name} is archived and cannot be booked.`);
    const quantity = units(l.quantity, item.name);
    const unitPrice = l.unitPrice === undefined || l.unitPrice === null || l.unitPrice === "" ? item.rentalPrice : francs(l.unitPrice, `${item.name}: the price`);
    if (unitPrice !== item.rentalPrice) priceChanged = true;
    lines.push({ kind: "ITEM", itemId: item.id, label: item.name, quantity, listPrice: item.rentalPrice, unitPrice, total: quantity * unitPrice, sortOrder: i });
  }
  return { lines, items, priceChanged };
}

function cleanDates(input) {
  const eventDateKey = dayKey(input.eventDateKey, "The event date");
  const d = defaultRange(eventDateKey);
  const dispatchDateKey = input.dispatchDateKey ? dayKey(input.dispatchDateKey, "The dispatch date") : d.dispatchDateKey;
  const returnDateKey = input.returnDateKey ? dayKey(input.returnDateKey, "The return date") : d.returnDateKey;
  if (dispatchDateKey > eventDateKey) throw invalid("The items must leave on or before the event date.");
  if (returnDateKey < eventDateKey) throw invalid("The items come back on or after the event date.");
  if (addDaysToKey(dispatchDateKey, 90) < returnDateKey) throw invalid("A booking holds items for at most 90 days.");
  return { eventDateKey, dispatchDateKey, returnDateKey };
}

/** Holding bookings of the department over [from, to] with their item lines (the booking being changed left out). */
async function holdingOrders(tx, departmentId, fromKey, toKey, excludeId) {
  const rows = await tx.rentalOrder.findMany({
    where: { departmentId, status: { in: HOLDING_STATUSES }, dispatchDate: { lte: dbDate(toKey) }, ...(excludeId ? { id: { not: excludeId } } : {}) },
    select: { id: true, status: true, dispatchDate: true, returnDate: true, lines: { where: { kind: "ITEM" }, select: { itemId: true, quantity: true, issued: true, returned: true, damaged: true, broken: true, missing: true } } },
  });
  return rows.map((o) => ({ ...o, dispatchDateKey: dateKeyOf(o.dispatchDate), returnDateKey: dateKeyOf(o.returnDate) }));
}

/**
 * Checks that every item of `lines` is available over the booking's days, under a lock on each
 * item. A refusal is written to the audit trail (outside the transaction, so it stays) and the
 * Boss is told: a double booking was attempted.
 */
export async function assertAvailable(tx, ctx, { orderId = null, referenceNo = null, lines, dispatchDateKey, returnDateKey, eventDateKey = null }) {
  const ids = [...new Set(lines.filter((l) => l.kind !== "SERVICE" && l.itemId).map((l) => l.itemId))];
  if (!ids.length) return;
  await lockItems(tx, ids);
  const items = await tx.rentalItem.findMany({ where: { id: { in: ids } } });
  const todayKey = toDateKey(ctx.now || new Date(), ctx.timeZone);
  const orders = await holdingOrders(tx, ctx.department.id, dispatchDateKey, returnDateKey, orderId);
  const avail = availability(items, orders, dispatchDateKey, returnDateKey, todayKey, eventDateKey);
  const short = shortages(lines, avail, items, (d) => formatDateKey(d, { weekday: false }));
  if (!short.length) return;
  const message = short.map((s) => s.message).join(" ");
  try {
    await db.auditEvent.create({
      data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, userId: ctx.user.id, action: "RENTAL_DOUBLE_BOOKING_REFUSED", entityType: "RentalOrder", entityId: orderId || `attempt:${referenceNo || "new"}`, afterJson: { referenceNo, dispatchDateKey, returnDateKey, shortages: short.map(({ message: _m, ...s }) => s) } },
    });
  } catch {
    // The refusal itself matters more than its trace.
  }
  throw conflict(message);
}

async function orderOf(tx, ctx, orderId, { lock = true } = {}) {
  if (lock) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rental-order:${orderId || "-"}`}))`;
  const order = await tx.rentalOrder.findFirst({ where: { id: orderId || "-", departmentId: ctx.department.id }, include: { lines: { orderBy: { sortOrder: "asc" } }, client: { select: { name: true } } } });
  if (!order) throw notFound("Booking not found in this department.");
  return order;
}

const view = (o) => ({ referenceNo: o.referenceNo, status: o.status, eventType: o.eventType, eventDateKey: dateKeyOf(o.eventDate), dispatchDateKey: dateKeyOf(o.dispatchDate), returnDateKey: dateKeyOf(o.returnDate), agreedPrice: o.agreedPrice, discount: o.discount });

/** The fields of a booking from the form (shared by create and update). */
async function bookingFields(tx, ctx, input, { existing = null } = {}) {
  const eventType = text(input.eventType, 80);
  if (!eventType) throw invalid("Choose the type of event.");
  const dates = cleanDates(input);
  const { lines, priceChanged } = await cleanLines(tx, ctx, input.lines);
  const totals = orderTotals(lines, francs(input.discount, "The discount"));
  if (totals.discount > totals.itemsTotal + totals.servicesTotal) throw invalid("The discount cannot be more than the total.");
  const priceNote = text(input.priceNote, 300);
  if ((priceChanged || totals.discount > 0) && !mayChangePrices(ctx)) throw forbidden("You may not change prices or give discounts. Ask the Boss for this right.");
  if ((priceChanged || totals.discount > 0) && !priceNote) throw invalid("Say why the price differs from the list price (e.g. a loyal customer).");
  const guests = input.guests === undefined || input.guests === null || input.guests === "" ? null : units(input.guests, "Guests");
  return {
    lines,
    data: {
      eventType,
      eventDate: dbDate(dates.eventDateKey),
      eventLocation: text(input.eventLocation, 300),
      dispatchDate: dbDate(dates.dispatchDateKey),
      returnDate: dbDate(dates.returnDateKey),
      guests,
      itemsTotal: totals.itemsTotal,
      servicesTotal: totals.servicesTotal,
      discount: totals.discount,
      agreedPrice: totals.agreedPrice,
      priceNote,
      depositDue: Math.min(francs(input.depositDue, "The deposit"), totals.agreedPrice),
      paymentDueDate: input.paymentDueDateKey ? dbDate(dayKey(input.paymentDueDateKey, "The payment deadline")) : null,
      specialInstructions: text(input.specialInstructions, 2000),
      notes: text(input.notes, 2000),
      staffNames: (Array.isArray(input.staffNames) ? input.staffNames : String(input.staffNames || "").split(","))
        .map((s) => text(s, 80))
        .filter(Boolean)
        .slice(0, 30),
      handledById: input.handledById === undefined ? existing?.handledById ?? ctx.user.id : await responsible(tx, ctx, input.handledById),
    },
    dates,
  };
}

/**
 * A new booking: customer (existing or new), event, dates, lines. `status`: INQUIRY (default),
 * QUOTED (quotation sent) or CONFIRMED (holds the items: availability checked).
 */
export async function createOrder(tx, ctx, input) {
  const status = ["INQUIRY", "QUOTED", "CONFIRMED"].includes(input?.status) ? input.status : "INQUIRY";
  const client = await resolveClient(tx, ctx, { clientId: input.clientId, client: input.client });
  const { lines, data, dates } = await bookingFields(tx, ctx, input);
  if (data.handledById) data.handledById = await responsible(tx, ctx, data.handledById);
  const referenceNo = await nextReference(tx, ctx.department.id, DOC_TYPES.BOOKING);
  if (HOLDING_STATUSES.includes(status)) await assertAvailable(tx, ctx, { referenceNo, lines, ...dates });
  const now = ctx.now || new Date();
  const order = await tx.rentalOrder.create({
    data: {
      organizationId: ctx.user.organizationId,
      departmentId: ctx.department.id,
      referenceNo,
      clientId: client.id,
      status,
      ...data,
      createdById: ctx.user.id,
      quotedAt: status === "QUOTED" ? now : null,
      confirmedAt: status === "CONFIRMED" ? now : null,
      lines: { create: lines },
    },
  });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_BOOKING_CREATED", entityType: "RentalOrder", entityId: order.id, after: { ...view(order), client: client.name, lines: lines.map((l) => `${l.quantity} × ${l.label} @ ${l.unitPrice}`) } });
  return { orderId: order.id, referenceNo, clientId: client.id, status, agreedPrice: order.agreedPrice };
}

/**
 * Changes a booking that has not left yet: event, dates, lines, prices, people. A booking that
 * holds items is checked again against the others.
 */
export async function updateOrder(tx, ctx, input) {
  const order = await orderOf(tx, ctx, input?.orderId);
  if (!EDITABLE_STATUSES.includes(order.status)) throw conflict(`${order.referenceNo} is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}: it can no longer change.`);
  const client = input.clientId || input.client ? await resolveClient(tx, ctx, { clientId: input.clientId, client: input.client }) : null;
  const { lines, data, dates } = await bookingFields(tx, ctx, input, { existing: order });
  if (HOLDING_STATUSES.includes(order.status)) await assertAvailable(tx, ctx, { orderId: order.id, referenceNo: order.referenceNo, lines, ...dates });
  await tx.rentalOrderLine.deleteMany({ where: { orderId: order.id } });
  const updated = await tx.rentalOrder.update({ where: { id: order.id }, data: { ...data, ...(client ? { clientId: client.id } : {}), lines: { create: lines } } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_BOOKING_UPDATED", entityType: "RentalOrder", entityId: order.id, before: { ...view(order), lines: order.lines.map((l) => `${l.quantity} × ${l.label} @ ${l.unitPrice}`) }, after: { ...view(updated), lines: lines.map((l) => `${l.quantity} × ${l.label} @ ${l.unitPrice}`) } });
  return { orderId: order.id, referenceNo: order.referenceNo, agreedPrice: updated.agreedPrice };
}

/**
 * A step of a booking: quote (quotation sent), confirm (holds the items: availability checked),
 * prepare (items being prepared), close (returned and settled).
 */
export async function stepOrder(tx, ctx, input) {
  const order = await orderOf(tx, ctx, input?.orderId);
  const step = input.step;
  if (!NEXT_STEPS[order.status]?.includes(step) || step === "cancel") throw conflict(`${order.referenceNo} is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}: it cannot be ${({ quote: "quoted", confirm: "confirmed", prepare: "prepared", close: "closed" })[step] || "changed"} now.`);
  const now = ctx.now || new Date();
  let data;
  if (step === "quote") data = { status: "QUOTED", quotedAt: now };
  else if (step === "confirm") {
    await assertAvailable(tx, ctx, { orderId: order.id, referenceNo: order.referenceNo, lines: order.lines, dispatchDateKey: dateKeyOf(order.dispatchDate), returnDateKey: dateKeyOf(order.returnDate), eventDateKey: dateKeyOf(order.eventDate) });
    data = { status: "CONFIRMED", confirmedAt: now };
  } else if (step === "prepare") data = { status: "PREPARING", preparingAt: now };
  else if (step === "close") {
    const open = await tx.rentalIncident.count({ where: { orderId: order.id, status: "OPEN" } });
    if (open) throw conflict(`${order.referenceNo} has ${open} damaged or missing item record(s) to settle first.`);
    data = { status: "CLOSED", closedAt: now };
  }
  await tx.rentalOrder.update({ where: { id: order.id }, data });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: `RENTAL_BOOKING_${data.status}`, entityType: "RentalOrder", entityId: order.id, before: { status: order.status }, after: { status: data.status, note: text(input.note, 300) } });
  return { orderId: order.id, referenceNo: order.referenceNo, status: data.status };
}

/**
 * Cancels a booking that has not left (its items are free again). Money received stays until it
 * is refunded; what is kept is income of the cancellation date.
 */
export async function cancelOrder(tx, ctx, input) {
  const order = await orderOf(tx, ctx, input?.orderId);
  if (!NEXT_STEPS[order.status]?.includes("cancel")) throw conflict(order.status === "DISPATCHED" ? `${order.referenceNo}'s items are out: record their return first.` : `${order.referenceNo} is ${ORDER_STATUS_LABELS[order.status].toLowerCase()}.`);
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Say why the booking is cancelled.");
  await tx.rentalOrder.update({ where: { id: order.id }, data: { status: "CANCELLED", cancelledAt: ctx.now || new Date(), cancelReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_BOOKING_CANCELLED", entityType: "RentalOrder", entityId: order.id, before: { status: order.status }, after: { reason } });
  if (HOLDING_STATUSES.includes(order.status)) {
    await notifyBosses(tx, { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, kind: "RENTAL_BOOKING_CANCELLED", title: `${ctx.department.name}: ${order.referenceNo} cancelled (${order.client.name})`, body: reason, href: `/d/${ctx.department.id}/bookings/${order.id}` });
  }
  return { orderId: order.id, referenceNo: order.referenceNo, status: "CANCELLED" };
}
