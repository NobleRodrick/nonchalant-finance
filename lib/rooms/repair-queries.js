/** Reading repairs of a guest house for pages and reports (scoped to the department). */
import { db } from "@/lib/prisma";
import { dbDate, dateKeyOf } from "@/lib/venue/dates";

const ORDER = { URGENT: 0, HIGH: 1, NORMAL: 2, LOW: 3 };

function shape(r, files = []) {
  return { ...r, reportedOnKey: dateKeyOf(r.reportedOn), repairedOnKey: dateKeyOf(r.repairedOn), reportedOn: undefined, repairedOn: undefined, proofs: files.filter((f) => f.entityId === r.id || f.entityId === r.transactionId).map((f) => ({ id: f.id, fileName: f.fileName })) };
}

/**
 * Repairs: `open` (reported or in progress; most urgent, then oldest first), or those done in
 * [fromKey, toKey], or cancelled; optionally of one apartment.
 */
export async function listRepairs({ departmentId, view = "open", fromKey, toKey, roomId, client = db }) {
  const where = { departmentId, ...(roomId ? { roomId } : {}) };
  if (view === "open") where.status = { in: ["REPORTED", "IN_PROGRESS"] };
  else if (view === "done") Object.assign(where, { status: "DONE", ...(fromKey ? { repairedOn: { gte: dbDate(fromKey), lte: dbDate(toKey) } } : {}) });
  else Object.assign(where, { status: "CANCELLED", ...(fromKey ? { updatedAt: { gte: new Date(`${fromKey}T00:00:00Z`) } } : {}) });
  const rows = await client.roomRepair.findMany({
    where,
    include: { room: { select: { id: true, name: true } }, asset: { select: { id: true, name: true } }, createdBy: { select: { name: true } } },
    orderBy: view === "open" ? [{ reportedOn: "asc" }] : [{ repairedOn: "desc" }, { updatedAt: "desc" }],
    take: 500,
  });
  const ids = [...rows.map((r) => r.id), ...rows.map((r) => r.transactionId).filter(Boolean)];
  const files = ids.length ? await client.attachment.findMany({ where: { entityType: { in: ["RoomRepair", "Transaction"] }, entityId: { in: ids } }, select: { id: true, entityId: true, fileName: true } }) : [];
  const out = rows.map((r) => shape(r, files));
  if (view === "open") out.sort((a, b) => ORDER[a.priority] - ORDER[b.priority] || a.reportedOnKey.localeCompare(b.reportedOnKey));
  return out;
}

/** Repairs summed: pending (count, urgent, estimated), and done in the list given (actual cost), per apartment. */
export function repairTotals(open = [], done = []) {
  const byRoom = {};
  const room = (id) => (byRoom[id] ||= { pending: 0, estimated: 0, spent: 0, done: 0 });
  for (const r of open) {
    room(r.roomId).pending += 1;
    room(r.roomId).estimated += r.estimatedCost || 0;
  }
  for (const r of done) {
    room(r.roomId).done += 1;
    room(r.roomId).spent += r.actualCost || 0;
  }
  return {
    pending: open.length,
    urgent: open.filter((r) => r.priority === "URGENT" || r.priority === "HIGH").length,
    estimated: open.reduce((s, r) => s + (r.estimatedCost || 0), 0),
    blocking: open.filter((r) => r.blocksRoom).length,
    done: done.length,
    spent: done.reduce((s, r) => s + (r.actualCost || 0), 0),
    estimatedOfDone: done.reduce((s, r) => s + (r.estimatedCost || 0), 0),
    byRoom,
  };
}
