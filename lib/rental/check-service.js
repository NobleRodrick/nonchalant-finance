/**
 * Items leaving for an event and coming back (docs/EVENT_RENTAL_PLAN.md). The manager confirms
 * what leaves (pre-filled from the booking, never more than the store holds); returns may come in
 * several times, each line counted as back in good condition, damaged, broken or missing. Any
 * difference with what was issued is flagged at once and becomes a damage / loss record to
 * settle. Every unit moves through the stock ledger (lib/rental/item-service).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { notifyBosses } from "@/lib/notifications";
import { toDateKey } from "@/lib/timezone";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";
import { lockItems, moveStock } from "./item-service";
import { unitLossValue } from "./stock-math";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function n(value, label) {
  if (value === undefined || value === null || value === "") return 0;
  const v = Number(value);
  if (!Number.isInteger(v) || v < 0) throw invalid(`${label} must be a whole number (0 or more).`);
  return v;
}

async function orderFor(tx, ctx, orderId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`rental-order:${orderId || "-"}`}))`;
  const order = await tx.rentalOrder.findFirst({ where: { id: orderId || "-", departmentId: ctx.department.id }, include: { lines: { where: { kind: "ITEM" }, orderBy: { sortOrder: "asc" } }, client: { select: { name: true } } } });
  if (!order) throw notFound("Booking not found in this department.");
  return order;
}

const outstanding = (l) => l.issued - l.returned - l.damaged - l.broken - l.missing;

/**
 * The items leave: `lines` [{ lineId, quantity }] (missing lines: the quantity booked). Less than
 * booked may leave (the rest stays in the store); never more. Leaving before the planned day moves
 * the dispatch date, so the items are held from the day they really left.
 */
export async function dispatchOrder(tx, ctx, input) {
  const order = await orderFor(tx, ctx, input?.orderId);
  if (!["CONFIRMED", "PREPARING"].includes(order.status)) throw conflict(order.status === "DISPATCHED" ? `${order.referenceNo}'s items already left.` : `Confirm ${order.referenceNo} before its items leave.`);
  if (!order.lines.length) throw invalid(`${order.referenceNo} has no item to dispatch (services only).`);
  const asked = new Map((Array.isArray(input.lines) ? input.lines : []).map((l) => [l.lineId, l]));
  await lockItems(tx, order.lines.map((l) => l.itemId));
  const items = Object.fromEntries((await tx.rentalItem.findMany({ where: { id: { in: order.lines.map((l) => l.itemId) } } })).map((i) => [i.id, i]));
  const checkLines = [];
  for (const l of order.lines) {
    const q = asked.has(l.id) ? n(asked.get(l.id).quantity, l.label) : l.quantity;
    if (q > l.quantity) throw invalid(`${l.label}: ${q} cannot leave, ${l.quantity} were booked. Change the booking first.`);
    if (!q) continue;
    await moveStock(tx, ctx, items[l.itemId], "ISSUED", q, { orderId: order.id, note: `${order.referenceNo} · ${order.client.name}` });
    await tx.rentalOrderLine.update({ where: { id: l.id }, data: { issued: q } });
    checkLines.push({ lineId: l.id, itemId: l.itemId, quantity: q });
  }
  if (!checkLines.length) throw invalid("Nothing leaves: enter the quantities.");
  const now = ctx.date || ctx.now || new Date();
  const todayKey = toDateKey(now, ctx.timeZone);
  const check = await tx.rentalCheck.create({
    data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, orderId: order.id, referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.DISPATCH_NOTE), kind: "DISPATCH", date: now, counterpart: text(input.counterpart, 120), notes: text(input.notes, 500), checkedById: ctx.user.id, lines: { create: checkLines } },
  });
  await tx.rentalOrder.update({ where: { id: order.id }, data: { status: "DISPATCHED", dispatchedAt: now, ...(todayKey < dateKeyOf(order.dispatchDate) ? { dispatchDate: dbDate(todayKey) } : {}) } });
  const short = order.lines.filter((l) => (asked.has(l.id) ? n(asked.get(l.id).quantity, l.label) : l.quantity) < l.quantity);
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_ITEMS_DISPATCHED", entityType: "RentalOrder", entityId: order.id, after: { referenceNo: check.referenceNo, lines: checkLines.map((c) => `${c.quantity} × ${items[c.itemId].name}`), less: short.map((l) => l.label) } });
  return { orderId: order.id, checkId: check.id, referenceNo: check.referenceNo, issued: checkLines.reduce((s, c) => s + c.quantity, 0) };
}

/**
 * Items come back (once or several times): `lines` [{ lineId, good, damaged, broken, missing }];
 * each line never more than what is still out. Damaged, broken and missing units become damage /
 * loss records (one per item and kind) to settle; the Boss is told of any difference. When every
 * unit is accounted for, the booking is "Items returned".
 */
export async function returnItems(tx, ctx, input) {
  const order = await orderFor(tx, ctx, input?.orderId);
  if (order.status !== "DISPATCHED") throw conflict(`${order.referenceNo} has no items out.`);
  const asked = Array.isArray(input.lines) ? input.lines : [];
  const byLine = Object.fromEntries(order.lines.map((l) => [l.id, l]));
  await lockItems(tx, order.lines.map((l) => l.itemId));
  const items = Object.fromEntries((await tx.rentalItem.findMany({ where: { id: { in: order.lines.map((l) => l.itemId) } } })).map((i) => [i.id, i]));
  const now = ctx.date || ctx.now || new Date();
  const checkLines = [];
  const differences = [];
  for (const a of asked) {
    const l = byLine[a?.lineId];
    if (!l) throw notFound("A returned line is not part of this booking.");
    const q = { good: n(a.good, `${l.label}: back`), damaged: n(a.damaged, `${l.label}: damaged`), broken: n(a.broken, `${l.label}: broken`), missing: n(a.missing, `${l.label}: missing`) };
    const total = q.good + q.damaged + q.broken + q.missing;
    if (!total) continue;
    if (total > outstanding(l)) throw invalid(`${l.label}: ${outstanding(l)} still out, ${total} counted.`);
    const item = items[l.itemId];
    const note = `${order.referenceNo} · ${order.client.name}`;
    if (q.good) await moveStock(tx, ctx, item, "RETURNED", q.good, { orderId: order.id, note });
    for (const kind of ["damaged", "broken"]) if (q[kind]) await moveStock(tx, ctx, item, "DAMAGED", q[kind], { from: "out", orderId: order.id, note: `${kind === "broken" ? "Broken" : "Damaged"} · ${note}` });
    if (q.missing) await moveStock(tx, ctx, item, "MISSING", q.missing, { from: "out", orderId: order.id, note });
    await tx.rentalOrderLine.update({ where: { id: l.id }, data: { returned: { increment: q.good }, damaged: { increment: q.damaged }, broken: { increment: q.broken }, missing: { increment: q.missing } } });
    Object.assign(l, { returned: l.returned + q.good, damaged: l.damaged + q.damaged, broken: l.broken + q.broken, missing: l.missing + q.missing });
    checkLines.push({ lineId: l.id, itemId: l.itemId, quantity: q.good, damaged: q.damaged, broken: q.broken, missing: q.missing });
    for (const [kind, key] of [["DAMAGED", "damaged"], ["BROKEN", "broken"], ["MISSING", "missing"]]) {
      if (!q[key]) continue;
      const incident = await tx.rentalIncident.create({
        data: {
          organizationId: ctx.user.organizationId,
          departmentId: ctx.department.id,
          referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.INCIDENT),
          itemId: item.id,
          orderId: order.id,
          kind,
          quantity: q[key],
          reason: text(a.reason, 300),
          responsibleName: order.client.name,
          // What it costs to replace them (a damaged unit can usually be repaired: its cost comes with the repair).
          estimatedLoss: kind === "DAMAGED" ? 0 : q[key] * unitLossValue(item),
          date: now,
          createdById: ctx.user.id,
        },
      });
      differences.push({ incidentId: incident.id, referenceNo: incident.referenceNo, item: item.name, kind, quantity: q[key] });
    }
  }
  if (!checkLines.length) throw invalid("Nothing came back: enter the quantities.");
  const check = await tx.rentalCheck.create({
    data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, orderId: order.id, referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.GOODS_RETURNED), kind: "RETURN", date: now, counterpart: text(input.counterpart, 120), notes: text(input.notes, 500), checkedById: ctx.user.id, lines: { create: checkLines } },
  });
  const allBack = order.lines.every((l) => outstanding(l) === 0);
  if (allBack) await tx.rentalOrder.update({ where: { id: order.id }, data: { status: "RETURNED", returnedAt: now } });
  if (differences.length) {
    const summary = differences.map((d) => `${d.quantity} ${d.item} ${d.kind.toLowerCase()}`).join(", ");
    await notifyBosses(tx, { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, kind: "RENTAL_RETURN_DIFFERENCE", title: `${ctx.department.name}: ${order.referenceNo} came back short (${order.client.name})`, body: summary, href: `/d/${ctx.department.id}/bookings/${order.id}` });
  }
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_ITEMS_RETURNED", entityType: "RentalOrder", entityId: order.id, after: { referenceNo: check.referenceNo, lines: checkLines.map((c) => `${items[c.itemId].name}: ${c.quantity} back, ${c.damaged} damaged, ${c.broken} broken, ${c.missing} missing`), allBack } });
  return { orderId: order.id, checkId: check.id, referenceNo: check.referenceNo, allBack, differences };
}
