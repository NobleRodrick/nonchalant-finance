/**
 * Salon, spa, gym: appointments with a staff member (refused when that person is already booked at
 * that time); when the customer arrives, the appointment opens a visit ticket from the price list
 * (lib/services: paid on collection like any ticket). Membership plans — for a number of days
 * (monthly gym) or a number of sessions (10-session pack) — are sold (a sale, paid or on credit)
 * and used by check-ins until they expire or are used up. A membership cancelled is refunded: its
 * sale is voided.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { permits, PERMISSIONS } from "@/lib/permissions";
import { grantsIn } from "@/lib/access";
import { assertCanPost } from "@/lib/posting-guard";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { SALE_METHODS, createTransaction, departmentDrawer, resolveDebtor, voidTransaction } from "@/lib/finance/posting-service";
import { debtStatus } from "@/lib/finance/money-math";
import { resolveClient } from "@/lib/clients/client-service";
import { isDateKey, toDateKey } from "@/lib/timezone";
import { formatMoney } from "@/lib/format";
import { text, whole } from "@/lib/property/input";
import { createTicket } from "@/lib/services/ticket-service";
import { workerOf } from "@/lib/services/catalog-service";
import { appointmentEnd, membershipEndKey, membershipState, overlaps } from "./salon-math";

const keyDate = (key) => new Date(`${key}T00:00:00Z`);
const dateKeyOf = (d) => (d ? d.toISOString().slice(0, 10) : null);

async function appointmentOf(tx, department, id) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`appointment:${id || "-"}`}))`;
  const a = await tx.appointment.findFirst({ where: { id: id || "-", departmentId: department.id } });
  if (!a) throw notFound("Appointment not found.");
  return a;
}

/** A new appointment or its changes (while booked). */
export async function saveAppointment(tx, ctx, input) {
  const { user, department } = ctx;
  const startAt = new Date(input.startAt);
  if (Number.isNaN(startAt.getTime())) throw invalid("Choose the day and time.");
  const item = input.itemId ? await tx.serviceItem.findFirst({ where: { id: input.itemId, departmentId: department.id } }) : null;
  if (input.itemId && !item) throw invalid("Choose a service of the price list.");
  const minutes = whole(input.minutes, "The duration (minutes)", { min: 5, max: 12 * 60, fallback: item?.minutes || 60 });
  const worker = input.workerId ? await workerOf(tx, department, input.workerId) : null;
  const client = input.clientId || input.client?.name ? await resolveClient(tx, ctx, { clientId: input.clientId, client: input.client }) : null;
  const customerName = client?.name || text(input.customerName, 120);
  if (!customerName) throw invalid("Enter the customer's name.");
  const before = input.id ? await appointmentOf(tx, department, input.id) : null;
  if (before && before.status !== "BOOKED") throw conflict(`${before.referenceNo} is ${before.status.toLowerCase().replace("_", " ")}: it cannot change.`);
  if (worker) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`worker-diary:${worker.id}`}))`;
    const sameDay = await tx.appointment.findMany({ where: { departmentId: department.id, workerId: worker.id, status: { in: ["BOOKED", "ARRIVED"] }, startAt: { gte: new Date(startAt.getTime() - 12 * 3600000), lte: new Date(startAt.getTime() + 12 * 3600000) }, ...(before ? { NOT: { id: before.id } } : {}) } });
    const clash = sameDay.find((a) => overlaps(a, { startAt, minutes }));
    if (clash) throw conflict(`${worker.name} is already booked then (${clash.customerName}, until ${new Date(appointmentEnd(clash)).toISOString().slice(11, 16)} UTC).`);
  }
  const data = { clientId: client?.id || null, customerName, customerPhone: client?.phone || text(input.customerPhone, 30), itemId: item?.id || null, serviceLabel: item?.name || text(input.serviceLabel, 120), workerId: worker?.id || null, startAt, minutes, note: text(input.note, 500) };
  const a = before
    ? await tx.appointment.update({ where: { id: before.id }, data })
    : await tx.appointment.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id, referenceNo: await nextReference(tx, department.id, DOC_TYPES.APPOINTMENT), createdById: user.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: before ? "APPOINTMENT_CHANGED" : "APPOINTMENT_BOOKED", entityType: "Appointment", entityId: a.id, after: { customerName, startAt, minutes, worker: worker?.name, service: data.serviceLabel } });
  return { appointmentId: a.id, referenceNo: a.referenceNo };
}

/** ARRIVED (opens the visit ticket) | NO_SHOW | CANCELLED (with a reason) | BOOKED (undo a no-show). */
export async function setAppointmentStatus(tx, ctx, input) {
  const a = await appointmentOf(tx, ctx.department, input.appointmentId);
  const status = input.status;
  if (!["ARRIVED", "NO_SHOW", "CANCELLED", "BOOKED"].includes(status)) throw invalid("Unknown status.");
  if (a.status === "ARRIVED") throw conflict(`${a.referenceNo}: the customer already arrived (visit opened).`);
  if (status === a.status) throw conflict(`${a.referenceNo} is already ${status.toLowerCase().replace("_", " ")}.`);
  let ticketId = null;
  if (status === "ARRIVED") {
    if (!a.itemId) throw invalid("Choose the service first (change the appointment), then mark the arrival.");
    const t = await createTicket(tx, ctx, { ...(a.clientId ? { clientId: a.clientId } : { customerName: a.customerName, customerPhone: a.customerPhone }), lines: [{ itemId: a.itemId, quantity: 1, workerId: a.workerId }], start: true, notes: a.note ? `Appointment ${a.referenceNo}: ${a.note}` : `Appointment ${a.referenceNo}` });
    ticketId = t.ticketId;
  }
  const reason = text(input.reason, 300);
  if (status === "CANCELLED" && !reason) throw invalid("Say why the appointment is cancelled.");
  await tx.appointment.update({ where: { id: a.id }, data: { status, ticketId, cancelReason: status === "CANCELLED" ? reason : null } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: `APPOINTMENT_${status}`, entityType: "Appointment", entityId: a.id, after: { reason, ticketId } });
  return { appointmentId: a.id, ticketId };
}

/** A membership plan: PERIOD (days) or SESSIONS (sessions, optional validity in days). */
export async function savePlan(tx, ctx, input) {
  const name = text(input.name, 80);
  if (!name) throw invalid("Name the plan, e.g. “Gym – 1 month” or “10 sessions”.");
  const kind = input.kind === "SESSIONS" ? "SESSIONS" : "PERIOD";
  const days = whole(input.days, "The number of days", { min: 1, max: 3660, fallback: null });
  const sessions = whole(input.sessions, "The number of sessions", { min: 1, max: 1000, fallback: null });
  if (kind === "PERIOD" && !days) throw invalid("Enter how many days the membership lasts.");
  if (kind === "SESSIONS" && !sessions) throw invalid("Enter how many sessions the pack includes.");
  const price = whole(input.price, "The price", { min: 0, max: 100_000_000, fallback: null });
  if (price === null) throw invalid("Enter the price.");
  const clash = await tx.membershipPlan.findFirst({ where: { departmentId: ctx.department.id, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (clash) throw conflict(`"${name}" already exists.`);
  const data = { name, kind, days, sessions: kind === "SESSIONS" ? sessions : null, price, isActive: input.isActive === undefined ? true : Boolean(input.isActive) };
  if (input.id) {
    const before = await tx.membershipPlan.findFirst({ where: { id: input.id, departmentId: ctx.department.id } });
    if (!before) throw notFound("Plan not found.");
    if (before.price !== price && !permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(ctx.user, ctx.department.id))) throw forbidden("Your rights do not include changing prices.");
    await tx.membershipPlan.update({ where: { id: before.id }, data });
    await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "MEMBERSHIP_PLAN_SAVED", entityType: "MembershipPlan", entityId: before.id, before: { price: before.price }, after: data });
    return { planId: before.id };
  }
  const p = await tx.membershipPlan.create({ data: { ...data, departmentId: ctx.department.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "MEMBERSHIP_PLAN_CREATED", entityType: "MembershipPlan", entityId: p.id, after: data });
  return { planId: p.id };
}

/** A membership sold: from `startKey` (default today), paid now or on credit (the member's debt). */
export async function sellMembership(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const plan = await tx.membershipPlan.findFirst({ where: { id: input.planId || "-", departmentId: department.id } });
  if (!plan) throw invalid("Choose a membership plan.");
  if (!plan.isActive) throw invalid(`${plan.name} is no longer sold.`);
  const client = await resolveClient(tx, ctx, { clientId: input.clientId, client: input.client });
  const date = ctx.date || ctx.now;
  const todayKey = toDateKey(date, timeZone);
  const startKey = isDateKey(input.startKey || "") ? input.startKey : todayKey;
  const price = input.price === undefined || input.price === null || input.price === "" ? plan.price : Math.round(Number(input.price));
  if (!Number.isInteger(price) || price < 0) throw invalid("The price is not valid.");
  if (price !== plan.price && !permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(user, department.id))) throw forbidden(`Your rights do not include changing the price of ${plan.name} (${formatMoney(plan.price)}).`);
  const method = input.paymentMethod || "CASH";
  if (![...SALE_METHODS, "OTHER"].includes(method)) throw invalid("Choose how the member paid.");
  const reference = text(input.reference, 80);
  if (["MOMO", "BANK_TRANSFER", "OTHER"].includes(method) && !reference) throw invalid("Enter the transaction reference.");
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const endKey = membershipEndKey(startKey, plan.days);
  const m = await tx.membership.create({
    data: { organizationId: user.organizationId, departmentId: department.id, referenceNo: await nextReference(tx, department.id, DOC_TYPES.MEMBERSHIP), planId: plan.id, clientId: client.id, customerName: client.name, customerPhone: client.phone, startDate: keyDate(startKey), endDate: endKey ? keyDate(endKey) : null, sessionsTotal: plan.kind === "SESSIONS" ? plan.sessions : null, price, createdById: user.id },
  });
  let t = null;
  if (price > 0) {
    const debtorRow = method === "CREDIT" ? await resolveDebtor(tx, { user, department, debtor: { name: client.name, phone: client.phone } }) : null;
    const account = method === "CREDIT" ? null : await departmentDrawer(tx, { user, departmentId: department.id });
    const what = `${plan.name} · ${m.referenceNo} · ${client.name}`;
    t = await createTransaction(tx, {
      user,
      department,
      docType: DOC_TYPES.SALE,
      data: { type: "SALE", amount: price, grossAmount: price, discountAmount: 0, netAmount: price, paymentMethod: method, customerName: client.name, counterparty: client.name, reference, operationCategory: "SALE_SERVICES", category: "membership-sale", description: what, date, accountId: account?.id || null, membershipId: m.id, idempotencyKey: ctx.key },
    });
    if (debtorRow) {
      await tx.debt.create({ data: { source: "CREDIT_SALE", referenceNo: await nextReference(tx, department.id, DOC_TYPES.DEBT), debtorId: debtorRow.id, debtorName: debtorRow.name, debtorContact: debtorRow.phone, foodDescription: what, amountOwed: price, amountPaid: 0, status: debtStatus(price, 0).status, date, transactionId: t.id, organizationId: user.organizationId, departmentId: department.id, userId: user.id } });
    }
  }
  await recordAudit(tx, { user, departmentId: department.id, action: "MEMBERSHIP_SOLD", entityType: "Membership", entityId: m.id, after: { referenceNo: m.referenceNo, plan: plan.name, customer: client.name, startKey, endKey, price, method } });
  return { membershipId: m.id, referenceNo: m.referenceNo, transactionId: t?.id || null, saleReference: t?.referenceNo || null, endKey };
}

async function membershipOf(tx, department, id) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`membership:${id || "-"}`}))`;
  const m = await tx.membership.findFirst({ where: { id: id || "-", departmentId: department.id }, include: { plan: true } });
  if (!m) throw notFound("Membership not found.");
  return m;
}

/** A check-in: counted on a session pack; refused when expired, not started, used up or cancelled. */
export async function recordVisit(tx, ctx, input) {
  const m = await membershipOf(tx, ctx.department, input.membershipId);
  const date = ctx.date || ctx.now;
  const todayKey = toDateKey(date, ctx.timeZone);
  const used = await tx.membershipVisit.count({ where: { membershipId: m.id, voidedAt: null } });
  const st = membershipState({ status: m.status, startKey: dateKeyOf(m.startDate), endKey: dateKeyOf(m.endDate), sessionsTotal: m.sessionsTotal }, used, todayKey);
  const why = { CANCELLED: "is cancelled", NOT_STARTED: `starts on ${dateKeyOf(m.startDate)}`, EXPIRED: `ended on ${dateKeyOf(m.endDate)}: renew it`, USED_UP: "has no session left: renew it" }[st.status];
  if (why) throw conflict(`${m.referenceNo} (${m.customerName}) ${why}.`);
  const v = await tx.membershipVisit.create({ data: { membershipId: m.id, date, note: text(input.note, 200), createdById: ctx.user.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "MEMBERSHIP_VISIT", entityType: "Membership", entityId: m.id, after: { used: used + 1 } });
  return { visitId: v.id, sessionsLeft: st.sessionsLeft === null ? null : st.sessionsLeft - 1 };
}

export async function voidVisit(tx, ctx, input) {
  const reason = text(input.reason, 200);
  if (!reason) throw invalid("Give a reason.");
  const v = await tx.membershipVisit.findFirst({ where: { id: input.visitId || "-", membership: { departmentId: ctx.department.id } } });
  if (!v) throw notFound("Check-in not found.");
  if (v.voidedAt) throw conflict("Already voided.");
  await tx.membershipVisit.update({ where: { id: v.id }, data: { voidedAt: new Date(), note: `${v.note ? `${v.note} · ` : ""}voided: ${reason}` } });
  return { visitId: v.id };
}

/** Cancelled and refunded: its sale is voided (money given back, or the debt cancelled). */
export async function cancelMembership(tx, ctx, input) {
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Say why the membership is cancelled.");
  const m = await membershipOf(tx, ctx.department, input.membershipId);
  if (m.status === "CANCELLED") throw conflict(`${m.referenceNo} is already cancelled.`);
  await tx.membership.update({ where: { id: m.id }, data: { status: "CANCELLED", cancelReason: reason } });
  const sales = await tx.transaction.findMany({ where: { membershipId: m.id, status: { not: "VOIDED" } } });
  for (const t of sales) await voidTransaction(tx, { user: ctx.user, role: ctx.role, transactionId: t.id, reason: `Membership ${m.referenceNo} cancelled: ${reason}`, timeZone: ctx.timeZone });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "MEMBERSHIP_CANCELLED", entityType: "Membership", entityId: m.id, after: { reason } });
  return { membershipId: m.id };
}
