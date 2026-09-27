/**
 * Cash requests: the Boss asks a department to hand over the cash of a period (one day by
 * default). Only the department head hands cash over; the request tells him how much is due.
 *
 * Amount due for a period = cash taken in − cash paid out during the period
 *                           − cash already handed over for it (handovers dated in the period,
 *                             or recorded against this request), never below 0.
 * The head can never hand over more than the drawer holds (checked by postHandover).
 */
import { db } from "@/lib/prisma";
import { DEFAULT_TIMEZONE, formatDateKey, isDateKey, rangeBounds } from "@/lib/timezone";
import { summarizeMoney, sumHandovers } from "@/lib/finance/money-math";
import { roundMoney } from "@/lib/money";
import { forbidden, invalid, notFound } from "@/lib/errors";
import { recordAudit } from "@/lib/audit";
import { departmentHeadIds, notifyUsers } from "@/lib/notifications";

export const REQUEST_STATUS_LABELS = { OPEN: "Waiting for the head", ANSWERED: "Cash handed over", CANCELLED: "Cancelled" };

export function periodLabel(fromKey, toKey) {
  return fromKey === toKey ? formatDateKey(fromKey) : `${formatDateKey(fromKey)} – ${formatDateKey(toKey)}`;
}

/** Pure: what is due for a period, from its transactions and handovers. */
export function cashDue({ transactions = [], handovers = [] }) {
  const m = summarizeMoney(transactions);
  const cashIn = roundMoney(m.cash.in);
  const cashOut = roundMoney(m.cash.out);
  const net = roundMoney(cashIn - cashOut);
  const handedOver = sumHandovers(handovers);
  return { cashIn, cashOut, net, handedOver, outstanding: Math.max(0, roundMoney(net - handedOver)) };
}

/** Live figures of one request. */
export async function requestFigures(client, request, timeZone = DEFAULT_TIMEZONE) {
  const { start, end } = rangeBounds(request.fromKey, request.toKey, timeZone);
  const [transactions, handovers] = await Promise.all([
    client.transaction.findMany({
      where: { departmentId: request.departmentId, date: { gte: start, lte: end } },
      select: { type: true, amount: true, grossAmount: true, discountAmount: true, paymentMethod: true, status: true, category: true, operationCategory: true },
    }),
    client.cashHandover.findMany({
      where: { departmentId: request.departmentId, OR: [{ date: { gte: start, lte: end } }, { cashRequestId: request.id }] },
      select: { amount: true, status: true, cashRequestId: true },
    }),
  ]);
  const due = cashDue({ transactions, handovers });
  const againstRequest = sumHandovers(handovers.filter((h) => h.cashRequestId === request.id));
  return { ...due, againstRequest };
}

function checkPeriod(fromKey, toKey, todayKey) {
  if (!isDateKey(fromKey) || !isDateKey(toKey)) throw invalid("Choose the period of the cash you want.");
  if (fromKey > toKey) throw invalid("The period starts after it ends.");
  if (toKey > todayKey) throw invalid("You cannot request the cash of a day that has not come yet.");
}

/** The Boss requests the cash of [fromKey, toKey] from one or more departments. */
export async function createCashRequests(tx, { user, departmentIds, fromKey, toKey, note, todayKey }) {
  if (user.role !== "ADMIN") throw forbidden("Only the Boss can request cash.");
  checkPeriod(fromKey, toKey, todayKey);
  const ids = [...new Set(departmentIds || [])];
  const departments = await tx.department.findMany({
    where: { organizationId: user.organizationId, isActive: true, domain: "RESTAURANT", ...(ids.length ? { id: { in: ids } } : {}) },
    select: { id: true, name: true },
  });
  if (!departments.length || (ids.length && departments.length !== ids.length)) throw invalid("Choose the departments to ask.");
  const text = String(note || "").trim().slice(0, 300) || null;
  const created = [];
  const skipped = [];
  for (const d of departments) {
    const existing = await tx.cashRequest.findFirst({ where: { departmentId: d.id, status: "OPEN", fromKey, toKey } });
    if (existing) {
      skipped.push(d.name);
      continue;
    }
    const req = await tx.cashRequest.create({
      data: { organizationId: user.organizationId, departmentId: d.id, requestedById: user.id, fromKey, toKey, note: text },
    });
    await recordAudit(tx, { user, departmentId: d.id, action: "CASH_REQUESTED", entityType: "CashRequest", entityId: req.id, after: { fromKey, toKey, note: text } });
    await notifyUsers(tx, {
      organizationId: user.organizationId,
      userIds: await departmentHeadIds(tx, d.id),
      departmentId: d.id,
      kind: "CASH_REQUESTED",
      title: `The Boss asks for the cash of ${periodLabel(fromKey, toKey)} (${d.name})`,
      body: text,
      href: `/d/${d.id}/cash-handover`,
    });
    created.push({ id: req.id, department: d.name });
  }
  return { created, skipped };
}

/** The Boss withdraws a request that has not been answered. */
export async function cancelCashRequest(tx, { user, requestId }) {
  if (user.role !== "ADMIN") throw forbidden("Only the Boss can cancel a cash request.");
  const req = await tx.cashRequest.findFirst({ where: { id: requestId, organizationId: user.organizationId } });
  if (!req) throw notFound("Request not found.");
  if (req.status !== "OPEN") throw invalid("Only a request that is still waiting can be cancelled.");
  const updated = await tx.cashRequest.update({ where: { id: req.id }, data: { status: "CANCELLED", cancelledAt: new Date() } });
  await recordAudit(tx, { user, departmentId: req.departmentId, action: "CASH_REQUEST_CANCELLED", entityType: "CashRequest", entityId: req.id, before: { status: req.status }, after: { status: "CANCELLED" } });
  await notifyUsers(tx, {
    organizationId: user.organizationId,
    userIds: await departmentHeadIds(tx, req.departmentId),
    departmentId: req.departmentId,
    kind: "CASH_REQUEST_CANCELLED",
    title: `The Boss cancelled the cash request of ${periodLabel(req.fromKey, req.toKey)}`,
    href: `/d/${req.departmentId}/cash-handover`,
  });
  return updated;
}

/** Validates the request a handover answers (same department, not cancelled). */
export async function requestForHandover(tx, { organizationId, departmentId, requestId }) {
  if (!requestId) return null;
  const req = await tx.cashRequest.findFirst({ where: { id: requestId, organizationId, departmentId } });
  if (!req) throw notFound("This cash request does not exist in this department.");
  if (req.status === "CANCELLED") throw invalid("The Boss cancelled this cash request.");
  return req;
}

/** Requests with their live figures (newest first). */
export async function listCashRequests({ organizationId, departmentIds = null, statuses = null, take = 50, timeZone = DEFAULT_TIMEZONE, client = db }) {
  if (!client.cashRequest) {
    throw new Error("The database client is out of date. Stop the app, run `npx prisma migrate deploy` and `npx prisma generate`, then `npm run dev`.");
  }
  const rows = await client.cashRequest.findMany({
    where: { organizationId, ...(departmentIds ? { departmentId: { in: departmentIds } } : {}), ...(statuses ? { status: { in: statuses } } : {}) },
    include: { department: { select: { name: true } }, requestedBy: { select: { name: true } }, handovers: { select: { referenceNo: true, amount: true, status: true } } },
    orderBy: [{ createdAt: "desc" }],
    take,
  });
  return Promise.all(
    rows.map(async (r) => ({
      id: r.id,
      departmentId: r.departmentId,
      department: r.department.name,
      fromKey: r.fromKey,
      toKey: r.toKey,
      period: periodLabel(r.fromKey, r.toKey),
      note: r.note,
      status: r.status,
      requestedBy: r.requestedBy?.name,
      createdAt: r.createdAt,
      answeredAt: r.answeredAt,
      handovers: r.handovers.map((h) => ({ referenceNo: h.referenceNo, amount: roundMoney(h.amount), status: h.status })),
      figures: await requestFigures(client, r, timeZone),
    }))
  );
}
