/**
 * Damaged, broken and missing items, and what is decided for each (owner's decision: each time).
 *
 *   charge  the customer pays (a charge added to the booking, at the replacement value unless
 *           another amount is given); the units are written off, or sent to repair (damaged)
 *   loss    the business bears it: the units are written off (their cost is a loss)
 *   repair  the business sends them to repair (the repair cost comes when they are back)
 *   found   missing units came back: they return to the store
 *
 * A repair is completed with its cost (paid from the drawer: a repair expense of the event).
 * Charges can also be added for extra days, transport, labour; they are voided, never deleted.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { postMoneyEntry } from "@/lib/finance/posting-service";
import { itemOf, moveStock } from "./item-service";
import { unitLossValue } from "./stock-math";
import { CHARGE_KINDS } from "./booking-math";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function francs(value, label) {
  if (value === undefined || value === null || value === "") return null;
  const n = Number(value);
  if (!Number.isInteger(n) || n < 0) throw invalid(`${label} must be a whole number of francs (0 or more).`);
  return n;
}

const ORDER_CLOSED = ["CANCELLED", "CLOSED"];

async function incidentOf(tx, ctx, incidentId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rental-incident:${incidentId || "-"}`}))`;
  const inc = await tx.rentalIncident.findFirst({ where: { id: incidentId || "-", departmentId: ctx.department.id }, include: { order: { select: { id: true, referenceNo: true, status: true } } } });
  if (!inc) throw notFound("Damage / loss record not found.");
  return inc;
}

/** Where the units of an incident sit in the stock now. */
const bucketOf = (inc) => (inc.kind === "MISSING" ? "missing" : "damaged");

async function addChargeRecord(tx, ctx, { orderId, kind, label, amount }) {
  return tx.rentalCharge.create({
    data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, orderId, referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.BOOKING_CHARGE), kind, label, amount, date: ctx.date || ctx.now || new Date(), createdById: ctx.user.id },
  });
}

/**
 * Damage or loss found outside an event (in the store, during transport …): the units leave the
 * good stock and a record is opened to settle.
 */
export async function reportIncident(tx, ctx, input) {
  const item = await itemOf(tx, ctx.department, input?.itemId);
  const kind = ["DAMAGED", "BROKEN", "MISSING"].includes(input.kind) ? input.kind : null;
  if (!kind) throw invalid("Choose damaged, broken or missing.");
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 1) throw invalid("The quantity must be a whole number of at least 1.");
  const reason = text(input.reason);
  if (!reason) throw invalid("Say what happened.");
  await moveStock(tx, ctx, item, kind === "MISSING" ? "MISSING" : "DAMAGED", quantity, { from: "stock", note: reason });
  const inc = await tx.rentalIncident.create({
    data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.INCIDENT), itemId: item.id, kind, quantity, reason, responsibleName: text(input.responsibleName, 120), estimatedLoss: kind === "DAMAGED" ? 0 : quantity * unitLossValue(item), date: ctx.date || ctx.now || new Date(), createdById: ctx.user.id, note: text(input.note, 500) },
  });
  await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "RentalIncident", entityId: inc.id, departmentId: ctx.department.id });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_INCIDENT_REPORTED", entityType: "RentalIncident", entityId: inc.id, after: { referenceNo: inc.referenceNo, item: item.name, kind, quantity, reason } });
  return { incidentId: inc.id, referenceNo: inc.referenceNo };
}

/**
 * Settles an open record: decision charge | loss | repair | found (see the top of this file).
 * charge: `amount` (default: the units' replacement value), `stock` "write_off" (default) or
 * "repair" for damaged units.
 */
export async function settleIncident(tx, ctx, input) {
  const inc = await incidentOf(tx, ctx, input?.incidentId);
  if (inc.status !== "OPEN") throw conflict(`${inc.referenceNo} is already settled.`);
  const item = await itemOf(tx, ctx.department, inc.itemId);
  const decision = input.decision;
  const note = text(input.note, 500);
  const loss = inc.quantity * (item.purchasePrice || unitLossValue(item));
  const writeOff = () => moveStock(tx, ctx, item, "WRITTEN_OFF", inc.quantity, { from: bucketOf(inc), incidentId: inc.id, orderId: inc.orderId, value: loss, note: `${inc.referenceNo}${note ? ` · ${note}` : ""}` });
  const toRepair = async () => {
    if (inc.kind === "MISSING") throw invalid("Missing items cannot be repaired.");
    await moveStock(tx, ctx, item, "REPAIR_SENT", inc.quantity, { incidentId: inc.id, orderId: inc.orderId, note: text(input.repairBy, 120) });
  };
  const data = { settledAt: ctx.now || new Date(), note: note || inc.note, repairBy: text(input.repairBy, 120) || inc.repairBy };
  let charge = null;
  switch (decision) {
    case "charge": {
      if (!inc.orderId) throw invalid("Only damage found after an event can be charged to its customer.");
      if (ORDER_CLOSED.includes(inc.order.status)) throw conflict(`${inc.order.referenceNo} is ${inc.order.status.toLowerCase()}: reopen it or record a loss.`);
      const amount = francs(input.amount, "The amount charged") ?? inc.quantity * unitLossValue(item);
      if (!amount) throw invalid("Enter the amount charged to the customer.");
      const stock = input.stock === "repair" && inc.kind !== "MISSING" ? "REPAIR" : "WRITE_OFF";
      if (stock === "REPAIR") await toRepair();
      else await writeOff();
      charge = await addChargeRecord(tx, ctx, { orderId: inc.orderId, kind: "DAMAGE", label: `${inc.quantity} × ${item.name} ${inc.kind.toLowerCase()} (${inc.referenceNo})`, amount });
      Object.assign(data, { status: "CHARGED", chargeId: charge.id, chargedAmount: amount, stockAction: stock });
      break;
    }
    case "loss":
      await writeOff();
      Object.assign(data, { status: "LOSS", stockAction: "WRITE_OFF", estimatedLoss: inc.estimatedLoss || inc.quantity * unitLossValue(item) });
      break;
    case "repair": {
      await toRepair();
      const estimate = francs(input.repairCost, "The repair estimate");
      Object.assign(data, { status: "REPAIR", stockAction: "REPAIR", ...(estimate !== null ? { repairCost: estimate } : {}) });
      break;
    }
    case "found":
      if (inc.kind !== "MISSING") throw invalid("Only missing items can be found.");
      await moveStock(tx, ctx, item, "FOUND", inc.quantity, { incidentId: inc.id, orderId: inc.orderId, note });
      Object.assign(data, { status: "RESOLVED", stockAction: "FOUND" });
      break;
    default:
      throw invalid("Choose: charge the customer, record a loss, send to repair or found.");
  }
  await tx.rentalIncident.update({ where: { id: inc.id }, data });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: `RENTAL_INCIDENT_${data.status}`, entityType: "RentalIncident", entityId: inc.id, after: { referenceNo: inc.referenceNo, decision, chargedAmount: data.chargedAmount, stockAction: data.stockAction, note } });
  return { incidentId: inc.id, referenceNo: inc.referenceNo, status: data.status, chargeId: charge?.id || null, chargeReference: charge?.referenceNo || null };
}

/**
 * Units back from repair: they return to the store. The cost (paid from the drawer: a repair
 * expense of the event) and who repaired them are recorded.
 */
export async function completeRepair(tx, ctx, input) {
  const inc = await incidentOf(tx, ctx, input?.incidentId);
  if (inc.stockAction !== "REPAIR" || inc.repairedAt) throw conflict(`${inc.referenceNo} has no items in repair.`);
  const item = await itemOf(tx, ctx.department, inc.itemId);
  const cost = francs(input.cost, "The repair cost") ?? 0;
  let paid = null;
  if (input.paidFromDrawer && cost > 0) {
    const counterparty = text(input.counterparty, 120) || inc.repairBy;
    if (!counterparty) throw invalid("Enter who repaired the items.");
    paid = (await postMoneyEntry(tx, { ...ctx, type: "EXPENSE", amount: cost, category: "rental-repairs", paymentMethod: input.paymentMethod || "CASH", counterparty, reference: input.reference, description: `Repair of ${inc.quantity} × ${item.name} (${inc.referenceNo})`, rentalOrderId: inc.orderId, idempotencyKey: ctx.key ? `${ctx.key}:pay` : null })).transaction;
    await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: paid.id, departmentId: ctx.department.id });
  }
  await moveStock(tx, ctx, item, "REPAIRED", inc.quantity, { from: "inRepair", incidentId: inc.id, orderId: inc.orderId, value: cost, note: text(input.note, 300) });
  await tx.rentalIncident.update({ where: { id: inc.id }, data: { repairedAt: ctx.now || new Date(), repairCost: cost, ...(inc.status === "REPAIR" ? { status: "RESOLVED" } : {}), repairBy: text(input.counterparty, 120) || inc.repairBy } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_REPAIR_DONE", entityType: "RentalIncident", entityId: inc.id, after: { referenceNo: inc.referenceNo, cost, transaction: paid?.referenceNo } });
  return { incidentId: inc.id, referenceNo: inc.referenceNo, transactionReference: paid?.referenceNo || null };
}

/** A charge added to a booking: extra days, transport, labour, other (damage comes from its record). */
export async function addCharge(tx, ctx, input) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rental-order:${input?.orderId || "-"}`}))`;
  const order = await tx.rentalOrder.findFirst({ where: { id: input?.orderId || "-", departmentId: ctx.department.id }, select: { id: true, referenceNo: true, status: true } });
  if (!order) throw notFound("Booking not found in this department.");
  if (ORDER_CLOSED.includes(order.status)) throw conflict(`${order.referenceNo} is ${order.status.toLowerCase()}.`);
  const kind = CHARGE_KINDS[input.kind] && input.kind !== "DAMAGE" ? input.kind : "OTHER";
  const amount = francs(input.amount, "The amount");
  if (!amount) throw invalid("Enter the amount (more than 0).");
  const label = text(input.label, 160) || CHARGE_KINDS[kind];
  const c = await addChargeRecord(tx, ctx, { orderId: order.id, kind, label, amount });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_CHARGE_ADDED", entityType: "RentalOrder", entityId: order.id, after: { referenceNo: c.referenceNo, kind, label, amount } });
  return { chargeId: c.id, referenceNo: c.referenceNo };
}

/** Voids a charge (reason required); a damage charge reopens its record so it can be settled again. */
export async function voidCharge(tx, ctx, input) {
  const c = await tx.rentalCharge.findFirst({ where: { id: input?.chargeId || "-", departmentId: ctx.department.id }, include: { incident: true, order: { select: { status: true, referenceNo: true } } } });
  if (!c) throw notFound("Charge not found.");
  if (c.voidedAt) throw conflict(`${c.referenceNo} is already void.`);
  if (c.order.status === "CLOSED") throw conflict(`${c.order.referenceNo} is closed: its charges no longer change.`);
  const reason = text(input.reason);
  if (!reason || reason.length < 3) throw invalid("Give the reason (at least 3 characters).");
  await tx.rentalCharge.update({ where: { id: c.id }, data: { voidedAt: ctx.now || new Date(), voidReason: reason } });
  if (c.incident) await tx.rentalIncident.update({ where: { id: c.incident.id }, data: { chargeId: null, chargedAmount: 0, status: c.incident.stockAction === "REPAIR" && !c.incident.repairedAt ? "REPAIR" : "LOSS" } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_CHARGE_VOIDED", entityType: "RentalCharge", entityId: c.id, after: { referenceNo: c.referenceNo, reason } });
  return { chargeId: c.id, referenceNo: c.referenceNo };
}
