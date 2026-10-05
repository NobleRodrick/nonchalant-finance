/**
 * The hall's assets and the checks before and after each event, run by the operations inside
 * their transaction. Saving the check after an event records what changed since the check
 * before (units newly damaged or missing) as incidents, each settled later: charged to the client
 * (a booking charge), recorded as the hall's loss, or resolved (repaired, found).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { CATEGORY_LABELS, compareChecks, estimatedCost, normalizeLine } from "./asset-math";
import { addBookingCharge } from "./payment-service";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;
const CATEGORIES = Object.keys(CATEGORY_LABELS);

/** Adds an asset to the inventory, or changes one. */
export async function saveAsset(tx, { user, department }, input) {
  const name = text(input?.name, 120);
  if (!name) throw invalid("Name the asset (e.g. Chiavari chairs).");
  const category = CATEGORIES.includes(input.category) ? input.category : "OTHER";
  const quantity = Number(input.quantity);
  if (!Number.isInteger(quantity) || quantity < 0 || quantity > 100000) throw invalid("The quantity owned must be a whole number (0 or more).");
  const unitValue = Number(input.unitValue ?? 0);
  if (!Number.isInteger(unitValue) || unitValue < 0) throw invalid("The value of one unit must be a whole number of francs.");
  const data = { name, category, quantity, unitValue, notes: text(input.notes, 500), isActive: input.isActive === undefined ? true : Boolean(input.isActive) };
  try {
    if (input.id) {
      const existing = await tx.venueAsset.findFirst({ where: { id: input.id, departmentId: department.id } });
      if (!existing) throw notFound("Asset not found.");
      await tx.venueAsset.update({ where: { id: existing.id }, data });
      await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_ASSET_UPDATED", entityType: "VenueAsset", entityId: existing.id, before: { name: existing.name, quantity: existing.quantity, unitValue: existing.unitValue }, after: data });
      return { assetId: existing.id };
    }
    const asset = await tx.venueAsset.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id } });
    await recordAudit(tx, { user, departmentId: department.id, action: "VENUE_ASSET_CREATED", entityType: "VenueAsset", entityId: asset.id, after: data });
    return { assetId: asset.id };
  } catch (error) {
    if (error?.code === "P2002") throw conflict(`An asset named "${name}" already exists.`);
    throw error;
  }
}

/**
 * Saves the check before or after an event: one line per asset of the inventory (units good,
 * damaged, missing). The check after also records the differences with the check before.
 */
export async function saveAssetCheck(tx, ctx, input) {
  const { user, department } = ctx;
  const phase = input?.phase === "AFTER" ? "AFTER" : "BEFORE";
  const booking = await tx.venueBooking.findFirst({ where: { id: input?.bookingId || "-", departmentId: department.id } });
  if (!booking) throw notFound("Booking not found.");
  if (booking.status === "CANCELLED") throw invalid(`Booking ${booking.referenceNo} is cancelled.`);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`venue-check:${booking.id}`}))`;
  const assets = await tx.venueAsset.findMany({ where: { departmentId: department.id, isActive: true } });
  if (!assets.length) throw invalid("Add the hall's assets to the inventory first (Assets).");
  const byId = new Map(assets.map((a) => [a.id, a]));
  const lines = (Array.isArray(input.lines) ? input.lines : []).map((l) => {
    const asset = byId.get(l?.assetId);
    if (!asset) throw invalid("An asset of the check is not in the inventory.");
    const n = normalizeLine({ expected: asset.quantity, good: l.good, damaged: l.damaged, missing: l.missing });
    if (!n.valid) throw invalid(`${asset.name}: good (${n.good}) + damaged (${n.damaged}) + missing (${n.missing}) must equal the ${n.expected} owned.`);
    return { assetId: asset.id, expected: n.expected, good: n.good, damaged: n.damaged, missing: n.missing, note: text(l.note, 200) };
  });
  if (!lines.length) throw invalid("Count at least one asset.");

  const existing = await tx.eventAssetCheck.findUnique({ where: { bookingId_phase: { bookingId: booking.id, phase } } });
  if (phase === "BEFORE") {
    const after = await tx.eventAssetCheck.findUnique({ where: { bookingId_phase: { bookingId: booking.id, phase: "AFTER" } } });
    if (after) throw conflict("The check after the event is done: the check before can no longer change.");
  }
  if (phase === "AFTER" && existing) {
    const settled = await tx.venueAssetIncident.count({ where: { bookingId: booking.id, status: { not: "OPEN" } } });
    if (settled) throw conflict("Some differences of this event are already settled: the check after can no longer change.");
  }
  let check;
  if (existing) {
    await tx.eventAssetCheckLine.deleteMany({ where: { checkId: existing.id } });
    check = await tx.eventAssetCheck.update({ where: { id: existing.id }, data: { checkedById: user.id, checkedAt: ctx.now, notes: text(input.notes, 1000), lines: { create: lines } } });
  } else {
    check = await tx.eventAssetCheck.create({ data: { organizationId: user.organizationId, departmentId: department.id, bookingId: booking.id, phase, checkedById: user.id, checkedAt: ctx.now, notes: text(input.notes, 1000), lines: { create: lines } } });
  }
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "EventAssetCheck", entityId: check.id, departmentId: department.id });

  let incidents = [];
  if (phase === "AFTER") {
    const before = await tx.eventAssetCheck.findUnique({ where: { bookingId_phase: { bookingId: booking.id, phase: "BEFORE" } }, include: { lines: true } });
    await tx.venueAssetIncident.deleteMany({ where: { bookingId: booking.id, status: "OPEN" } });
    const diffs = compareChecks(before?.lines || [], lines);
    const rows = diffs.flatMap((d) => {
      const asset = byId.get(d.assetId);
      const out = [];
      if (d.newDamaged) out.push({ kind: "DAMAGED", quantity: d.newDamaged, cost: estimatedCost(d.newDamaged, asset.unitValue) });
      if (d.newMissing) out.push({ kind: "MISSING", quantity: d.newMissing, cost: estimatedCost(d.newMissing, asset.unitValue) });
      return out.map((x) => ({ ...x, organizationId: user.organizationId, departmentId: department.id, bookingId: booking.id, assetId: asset.id }));
    });
    if (rows.length) await tx.venueAssetIncident.createMany({ data: rows });
    incidents = rows.map((r) => ({ asset: byId.get(r.assetId).name, kind: r.kind, quantity: r.quantity, cost: r.cost }));
  }
  await recordAudit(tx, { user, departmentId: department.id, action: phase === "AFTER" ? "VENUE_CHECK_AFTER" : "VENUE_CHECK_BEFORE", entityType: "VenueBooking", entityId: booking.id, after: { lines: lines.length, incidents } });
  return { checkId: check.id, bookingId: booking.id, phase, incidents };
}

const OUTCOMES = { CHARGE: "CHARGED", LOSS: "LOSS", RESOLVED: "RESOLVED" };
const RESPONSIBILITY = ["CLIENT", "STAFF", "UNKNOWN"];

/**
 * Settles a difference found after an event: CHARGE (to the client: a booking charge), LOSS (the
 * hall's loss; missing units leave the inventory) or RESOLVED (repaired, found, no cost).
 */
export async function settleIncident(tx, ctx, input) {
  const { user, department } = ctx;
  const incident = await tx.venueAssetIncident.findFirst({ where: { id: input?.incidentId || "-", departmentId: department.id }, include: { asset: true, booking: true } });
  if (!incident) throw notFound("Difference not found.");
  if (incident.status !== "OPEN") throw conflict("This difference is already settled.");
  const status = OUTCOMES[input.outcome];
  if (!status) throw invalid("Choose: charge the client, record a loss, or resolved.");
  const cost = input.cost === undefined || input.cost === "" ? incident.cost : Number(input.cost);
  if (!Number.isInteger(cost) || cost < 0) throw invalid("The cost must be a whole number of francs.");
  const responsibility = RESPONSIBILITY.includes(input.responsibility) ? input.responsibility : status === "CHARGED" ? "CLIENT" : "UNKNOWN";
  const note = text(input.note, 300);
  const label = `${incident.quantity} × ${incident.asset.name} ${incident.kind === "MISSING" ? "missing" : "damaged"}`;
  await tx.venueAssetIncident.update({ where: { id: incident.id }, data: { cost, responsibility, note } });
  if (status === "CHARGED") {
    if (cost <= 0) throw invalid("Enter the amount charged to the client.");
    await addBookingCharge(tx, ctx, { bookingId: incident.bookingId, kind: "DAMAGE", label, amount: cost }, { incidentId: incident.id });
  } else {
    await tx.venueAssetIncident.update({ where: { id: incident.id }, data: { status, settledAt: ctx.now } });
    if (status === "LOSS" && incident.kind === "MISSING" && input.removeFromInventory !== false) {
      await tx.venueAsset.update({ where: { id: incident.assetId }, data: { quantity: { decrement: Math.min(incident.quantity, incident.asset.quantity) } } });
    }
  }
  await recordAudit(tx, { user, departmentId: department.id, action: `VENUE_INCIDENT_${status}`, entityType: "VenueBooking", entityId: incident.bookingId, after: { label, cost, responsibility, note } });
  return { incidentId: incident.id, status, cost };
}
