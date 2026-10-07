/**
 * Read side of a farm: the batches with their figures (alive, deaths, feed, produce, cost, sales,
 * profit), one batch with its events and money, what needs attention, and the farm report.
 */
import { db } from "@/lib/prisma";
import { formatTimeInZone, toDateKey } from "@/lib/timezone";
import { METHOD_LABELS } from "@/lib/finance/money-math";
import { BATCH_KINDS, EVENT_LABELS, ageInDays, batchFigures } from "./farm-math";
import { farmWarnings } from "./alert-math";

export { farmWarnings };

const int = (v) => Math.round(Number(v || 0));

function shape(b, events, records, todayKey, timeZone) {
  const startKey = toDateKey(b.startDate, timeZone);
  return {
    id: b.id,
    referenceNo: b.referenceNo,
    kind: b.kind,
    kindLabel: BATCH_KINDS[b.kind].label,
    name: b.name,
    location: b.location,
    breed: b.breed,
    unit: b.unit,
    initialCount: b.initialCount,
    startKey,
    expectedEndKey: b.expectedEndDate ? toDateKey(b.expectedEndDate, timeZone) : null,
    status: b.status,
    closedKey: b.closedAt ? toDateKey(b.closedAt, timeZone) : null,
    note: b.note,
    age: ageInDays(startKey, b.closedAt ? toDateKey(b.closedAt, timeZone) : todayKey),
    figures: batchFigures(b, events, records),
    today: { deaths: events.filter((e) => !e.voidedAt && e.kind === "MORTALITY" && toDateKey(e.date, timeZone) === todayKey).reduce((s, e) => s + e.quantity, 0) },
  };
}

/** Every batch of a farm (active first) with its figures. */
export async function farmBoard({ departmentId, todayKey, timeZone, status, client = db }) {
  const batches = await client.farmBatch.findMany({ where: { departmentId, ...(status ? { status } : {}) }, orderBy: [{ status: "asc" }, { startDate: "desc" }], take: 500 });
  const ids = batches.map((b) => b.id);
  const [events, records] = await Promise.all([
    client.farmEvent.findMany({ where: { batchId: { in: ids } }, select: { batchId: true, kind: true, quantity: true, unit: true, value: true, voidedAt: true, date: true } }),
    client.transaction.findMany({ where: { farmBatchId: { in: ids } }, select: { farmBatchId: true, type: true, amount: true, status: true } }),
  ]);
  const shaped = batches.map((b) => shape(b, events.filter((e) => e.batchId === b.id), records.filter((r) => r.farmBatchId === b.id), todayKey, timeZone));
  const active = shaped.filter((b) => b.status === "ACTIVE");
  return {
    batches: shaped,
    totals: {
      active: active.length,
      animals: active.filter((b) => b.figures.live).reduce((s, b) => s + b.figures.alive, 0),
      deathsToday: active.reduce((s, b) => s + b.today.deaths, 0),
      cost: active.reduce((s, b) => s + b.figures.cost, 0),
      sales: active.reduce((s, b) => s + b.figures.sales, 0),
    },
  };
}

/** One batch: figures, events (newest first), sales and expenses named on it. */
export async function batchDetail({ departmentId, batchId, todayKey, timeZone, client = db }) {
  const b = await client.farmBatch.findFirst({ where: { id: batchId, departmentId } });
  if (!b) return null;
  const [events, records, products] = await Promise.all([
    client.farmEvent.findMany({ where: { batchId: b.id }, orderBy: { date: "desc" } }),
    client.transaction.findMany({ where: { farmBatchId: b.id }, orderBy: { date: "desc" }, select: { id: true, referenceNo: true, type: true, amount: true, status: true, date: true, category: true, description: true, counterparty: true, customerName: true, paymentMethod: true, voidReason: true } }),
    client.tradeProduct.findMany({ where: { departmentId }, select: { id: true, name: true } }),
  ]);
  const users = await client.user.findMany({ where: { id: { in: [...new Set(events.map((e) => e.createdById))] } }, select: { id: true, name: true } });
  return {
    batch: shape(b, events, records, todayKey, timeZone),
    events: events.map((e) => ({ id: e.id, kind: e.kind, label: EVENT_LABELS[e.kind], dateKey: toDateKey(e.date, timeZone), time: formatTimeInZone(e.date, timeZone), quantity: e.quantity, unit: e.unit, product: products.find((p) => p.id === e.productId)?.name || null, value: e.value, note: e.note, voided: Boolean(e.voidedAt), voidReason: e.voidReason, by: users.find((u) => u.id === e.createdById)?.name || "" })),
    records: records.map((r) => ({ id: r.id, referenceNo: r.referenceNo, type: r.type, amount: int(r.amount), dateKey: toDateKey(r.date, timeZone), description: r.description, who: r.customerName || r.counterparty, method: METHOD_LABELS[r.paymentMethod] || r.paymentMethod, voided: r.status === "VOIDED", voidReason: r.voidReason })),
  };
}

/** Last event day of each active batch (for farmWarnings). */
export async function lastEventKeys({ departmentId, timeZone, client = db }) {
  const rows = await client.farmEvent.groupBy({ by: ["batchId"], where: { departmentId, voidedAt: null }, _max: { date: true } });
  return Object.fromEntries(rows.map((r) => [r.batchId, toDateKey(r._max.date, timeZone)]));
}
