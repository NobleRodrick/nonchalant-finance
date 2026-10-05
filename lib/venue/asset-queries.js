/** Reading the hall's assets, the checks of a booking and the differences found (by department). */
import { db } from "@/lib/prisma";

export async function venueAssets(departmentId, { includeInactive = false, client = db } = {}) {
  return client.venueAsset.findMany({ where: { departmentId, ...(includeInactive ? {} : { isActive: true }) }, orderBy: [{ category: "asc" }, { name: "asc" }] });
}

/** The two checks of a booking (with lines and proof files) and its differences. */
export async function bookingChecks(departmentId, bookingId, client = db) {
  const [checks, incidents] = await Promise.all([
    client.eventAssetCheck.findMany({ where: { departmentId, bookingId }, include: { lines: true, checkedBy: { select: { name: true } } } }),
    client.venueAssetIncident.findMany({ where: { departmentId, bookingId }, include: { asset: { select: { name: true, unitValue: true } }, charge: { select: { referenceNo: true } } }, orderBy: { createdAt: "asc" } }),
  ]);
  const files = checks.length ? await client.attachment.findMany({ where: { entityType: "EventAssetCheck", entityId: { in: checks.map((c) => c.id) } }, select: { id: true, entityId: true, fileName: true } }) : [];
  const shape = (phase) => {
    const c = checks.find((x) => x.phase === phase);
    return c ? { ...c, proofs: files.filter((f) => f.entityId === c.id) } : null;
  };
  return { before: shape("BEFORE"), after: shape("AFTER"), incidents };
}

/** Differences of the department: the open ones, and totals by status over a period. */
export async function departmentIncidents({ departmentId, status, take = 100, client = db }) {
  return client.venueAssetIncident.findMany({
    where: { departmentId, ...(status ? { status } : {}) },
    include: { asset: { select: { name: true } }, booking: { select: { id: true, referenceNo: true, eventType: true, client: { select: { name: true } } } }, charge: { select: { referenceNo: true } } },
    orderBy: { createdAt: "desc" },
    take,
  });
}
