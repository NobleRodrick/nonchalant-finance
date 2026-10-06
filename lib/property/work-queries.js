/** Reading maintenance requests and inspections (lists, by office). */
import { db } from "@/lib/prisma";
import { attachmentUrl } from "@/lib/attachments-url";
import { toDateKey } from "@/lib/timezone";
import { dateKeyOf } from "@/lib/venue/dates";

const UNIT = { select: { id: true, name: true, building: { select: { id: true, name: true } } } };
const LEASE = { select: { id: true, referenceNo: true, client: { select: { name: true, phone: true } } } };

/** Maintenance requests (filters: unitId, status "open" | a status | "all", buildingId). */
export async function maintenanceList({ departmentId, unitId = "", status = "open", buildingId = "", timeZone, client = db }) {
  const rows = await client.propertyMaintenance.findMany({
    where: {
      departmentId,
      ...(unitId ? { unitId } : {}),
      ...(buildingId ? { unit: { buildingId } } : {}),
      ...(status === "open" ? { status: { in: ["REPORTED", "APPROVED", "IN_PROGRESS"] } } : status && status !== "all" ? { status } : {}),
    },
    include: { unit: UNIT, lease: LEASE },
    orderBy: [{ reportedAt: "desc" }],
    take: 500,
  });
  const files = rows.length ? await client.attachment.findMany({ where: { entityType: "PropertyMaintenance", entityId: { in: rows.map((r) => r.id) } }, select: { id: true, entityId: true, fileName: true } }) : [];
  const expenses = rows.filter((r) => r.transactionId).length ? await client.transaction.findMany({ where: { id: { in: rows.filter((r) => r.transactionId).map((r) => r.transactionId) } }, select: { id: true, referenceNo: true } }) : [];
  return rows.map((r) => ({
    ...r,
    reportedKey: toDateKey(r.reportedAt, timeZone),
    scheduledKey: r.scheduledFor ? toDateKey(r.scheduledFor, timeZone) : null,
    completedKey: r.completedAt ? toDateKey(r.completedAt, timeZone) : null,
    expense: expenses.find((e) => e.id === r.transactionId)?.referenceNo || null,
    files: files.filter((f) => f.entityId === r.id).map((f) => ({ ...f, url: attachmentUrl(f.id) })),
  }));
}

/** Inspections (filters: unitId, "planned" | "done" | "all", kind). */
export async function inspectionList({ departmentId, unitId = "", state = "all", kind = "", timeZone, client = db }) {
  const rows = await client.propertyInspection.findMany({
    where: { departmentId, ...(unitId ? { unitId } : {}), ...(kind ? { kind } : {}), ...(state === "planned" ? { doneAt: null } : state === "done" ? { doneAt: { not: null } } : {}) },
    include: { unit: UNIT, lease: LEASE },
    orderBy: [{ createdAt: "desc" }],
    take: 500,
  });
  const files = rows.length ? await client.attachment.findMany({ where: { entityType: "PropertyInspection", entityId: { in: rows.map((r) => r.id) } }, select: { id: true, entityId: true, fileName: true, mimeType: true } }) : [];
  return rows.map((r) => ({
    ...r,
    scheduledKey: dateKeyOf(r.scheduledFor),
    doneKey: r.doneAt ? toDateKey(r.doneAt, timeZone) : null,
    files: files.filter((f) => f.entityId === r.id).map((f) => ({ ...f, url: attachmentUrl(f.id) })),
  }));
}
