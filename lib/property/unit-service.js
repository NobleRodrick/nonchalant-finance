/**
 * Buildings and offices of a property rental department (docs/PROPERTY_RENTAL_PLAN.md): an office
 * belongs to a building, has its list rent (with price history from an effective month), the
 * deposit asked, how each utility or charge is billed, a condition and the state managers set.
 * Offices are archived, never deleted (their contracts and money stay).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { toDateKey } from "@/lib/timezone";
import { DEFAULT_BUILDINGS } from "@/lib/domains/property";
import { BILLING_METHOD_LABELS, CONDITION_LABELS, MANUAL_STATES, UTILITY_KINDS } from "./unit-math";
import { dateKeyInput, dbDay, decimal, francs, monthInput, text } from "./input";
import { monthOf } from "./rent-schedule";

/** Locks offices in a fixed order (contracts on an office never overlap). */
export async function lockUnits(tx, ids) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`property-unit:${id}`}))`;
  }
}

export async function unitOf(tx, department, unitId, { lock = false } = {}) {
  if (lock) await lockUnits(tx, [unitId || "-"]);
  const unit = await tx.propertyUnit.findFirst({ where: { id: unitId || "-", departmentId: department.id }, include: { building: true } });
  if (!unit) throw notFound("Office not found in this department.");
  return unit;
}

/** The department's buildings; the owner's two are created the first time (Main Building, Place Étoilée). */
export async function ensureBuildings(tx, { user, department }) {
  const n = await tx.propertyBuilding.count({ where: { departmentId: department.id } });
  if (n) return;
  for (const [i, name] of DEFAULT_BUILDINGS.entries()) {
    await tx.propertyBuilding.create({ data: { organizationId: user.organizationId, departmentId: department.id, name, sortOrder: i } });
  }
}

/** Adds a building or changes one (name, address, notes, order). */
export async function saveBuilding(tx, ctx, input) {
  const name = text(input?.name, 80);
  if (!name || name.length < 2) throw invalid("Enter the building's name.");
  const data = { name, address: text(input.address, 300), notes: text(input.notes, 1000), sortOrder: Number.isInteger(Number(input.sortOrder)) ? Number(input.sortOrder) : 0 };
  const same = await tx.propertyBuilding.findFirst({ where: { departmentId: ctx.department.id, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (same) throw conflict(`A building named "${name}" already exists.`);
  if (input.id) {
    const b = await tx.propertyBuilding.findFirst({ where: { id: input.id, departmentId: ctx.department.id } });
    if (!b) throw notFound("Building not found.");
    await tx.propertyBuilding.update({ where: { id: b.id }, data });
    await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_BUILDING_UPDATED", entityType: "PropertyBuilding", entityId: b.id, before: { name: b.name, address: b.address }, after: data });
    return { buildingId: b.id };
  }
  const b = await tx.propertyBuilding.create({ data: { ...data, organizationId: ctx.user.organizationId, departmentId: ctx.department.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_BUILDING_CREATED", entityType: "PropertyBuilding", entityId: b.id, after: data });
  return { buildingId: b.id };
}

/** The charge settings of an office from the form: [{ kind, label, method, rate, meterNumber, lastReading, note }]. */
export function chargeSettings(rows) {
  const out = [];
  for (const r of Array.isArray(rows) ? rows : []) {
    if (!r || !UTILITY_KINDS.includes(r.kind)) continue;
    if (!BILLING_METHOD_LABELS[r.method]) throw invalid("Choose how each charge is billed.");
    const rate = decimal(r.rate, "The rate") ?? 0;
    if (r.method === "SHARE" && rate > 100) throw invalid("A share of the building's bill is at most 100%.");
    if (r.method !== "INCLUDED" && !rate) throw invalid(`Enter the ${r.method === "METER" ? "rate per unit" : r.method === "SHARE" ? "share (%)" : "monthly amount"} of each charge billed.`);
    if (r.kind === "OTHER" && !text(r.label, 60)) throw invalid('Name the "Other" charge (e.g. Parking).');
    out.push({ kind: r.kind, label: text(r.label, 60), method: r.method, rate: r.method === "INCLUDED" ? 0 : rate, meterNumber: text(r.meterNumber, 40), lastReading: decimal(r.lastReading, "The last meter reading"), note: text(r.note, 200) });
  }
  return out;
}

/**
 * Adds an office or changes one: building, name, floor, category, size, list rent (a change takes
 * effect from `rentFromMonth`, this month by default, and the old price stays in the history),
 * deposit, condition, description, notes, charge settings, photos (attachmentIds).
 */
export async function saveUnit(tx, ctx, input) {
  const { user, department } = ctx;
  const name = text(input?.name, 60);
  if (!name) throw invalid("Enter the office's name or number.");
  const building = await tx.propertyBuilding.findFirst({ where: { id: input.buildingId || "-", departmentId: department.id } });
  if (!building) throw invalid("Choose the building.");
  const listRent = francs(input.listRent, "The monthly rent", { required: true, min: 1 });
  const condition = input.condition && CONDITION_LABELS[input.condition] ? input.condition : null;
  const size = decimal(input.size, "The size");
  const data = {
    buildingId: building.id,
    name,
    floor: text(input.floor, 30),
    category: text(input.category, 60),
    size: size || null,
    depositRequired: francs(input.depositRequired, "The deposit"),
    condition,
    description: text(input.description, 2000),
    notes: text(input.notes, 2000),
  };
  const charges = chargeSettings(input.charges);
  const thisMonth = monthOf(toDateKey(ctx.now || new Date(), ctx.timeZone));
  const fromMonth = monthInput(input.rentFromMonth, "The month the new rent starts") || thisMonth;

  const clash = await tx.propertyUnit.findFirst({ where: { buildingId: building.id, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (clash) throw conflict(`${building.name} already has an office named "${name}".`);

  let unit;
  if (input.id) {
    const before = await unitOf(tx, department, input.id, { lock: true });
    const priceChanged = before.listRent !== listRent;
    unit = await tx.propertyUnit.update({ where: { id: before.id }, data: { ...data, ...(priceChanged && fromMonth <= thisMonth ? { listRent } : {}) } });
    if (priceChanged) {
      await tx.propertyRate.create({ data: { departmentId: department.id, unitId: unit.id, amount: listRent, fromMonth, note: text(input.rentNote, 200), createdById: user.id } });
    }
    await tx.propertyUnitCharge.deleteMany({ where: { unitId: unit.id } });
    await recordAudit(tx, { user, departmentId: department.id, action: "PROPERTY_UNIT_UPDATED", entityType: "PropertyUnit", entityId: unit.id, before: { name: before.name, listRent: before.listRent, depositRequired: before.depositRequired }, after: { ...data, listRent, rentFromMonth: priceChanged ? fromMonth : undefined } });
  } else {
    unit = await tx.propertyUnit.create({ data: { ...data, listRent, organizationId: user.organizationId, departmentId: department.id } });
    await tx.propertyRate.create({ data: { departmentId: department.id, unitId: unit.id, amount: listRent, fromMonth: thisMonth, note: "Initial rent", createdById: user.id } });
    await recordAudit(tx, { user, departmentId: department.id, action: "PROPERTY_UNIT_CREATED", entityType: "PropertyUnit", entityId: unit.id, after: { ...data, listRent } });
  }
  if (charges.length) await tx.propertyUnitCharge.createMany({ data: charges.map((c) => ({ ...c, unitId: unit.id })) });
  await linkAttachments(tx, { user, attachmentIds: input.attachmentIds, entityType: "PropertyUnit", entityId: unit.id, departmentId: department.id });
  return { unitId: unit.id, name: unit.name };
}

/**
 * Sets the state of an office that has no tenant: available (optionally from a date), under
 * maintenance, unavailable, or vacant awaiting handover. An occupied or reserved office keeps its
 * contract's status.
 */
export async function setUnitState(tx, ctx, input) {
  const unit = await unitOf(tx, ctx.department, input?.unitId, { lock: true });
  if (!MANUAL_STATES.includes(input.state)) throw invalid("Choose the office's state.");
  const live = await tx.propertyLease.count({ where: { unitId: unit.id, status: { in: ["ACTIVE", "RESERVED"] } } });
  if (live && input.state !== "MAINTENANCE") throw invalid("This office has a tenant or a reservation: end or cancel the contract first.");
  const note = text(input.note, 300);
  if (input.state !== "AVAILABLE" && !note) throw invalid("Say why (e.g. painting until the 20th).");
  const availableFrom = dateKeyInput(input.availableFrom, "The availability date");
  await tx.propertyUnit.update({ where: { id: unit.id }, data: { state: input.state, stateNote: note, availableFrom: dbDay(availableFrom) } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PROPERTY_UNIT_STATE", entityType: "PropertyUnit", entityId: unit.id, before: { state: unit.state }, after: { state: input.state, note, availableFrom } });
  return { unitId: unit.id, state: input.state };
}

/** Archives an office (no longer offered; history kept) or brings it back. */
export async function archiveUnit(tx, ctx, input) {
  const unit = await unitOf(tx, ctx.department, input?.unitId, { lock: true });
  const archive = input.archive !== false;
  if (archive) {
    const live = await tx.propertyLease.count({ where: { unitId: unit.id, status: { in: ["ACTIVE", "RESERVED"] } } });
    if (live) throw invalid("This office has a tenant or a reservation: end or cancel the contract first.");
    if (!text(input.reason, 300)) throw invalid("Give the reason.");
  }
  await tx.propertyUnit.update({ where: { id: unit.id }, data: archive ? { isActive: false, archivedAt: new Date() } : { isActive: true, archivedAt: null } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: archive ? "PROPERTY_UNIT_ARCHIVED" : "PROPERTY_UNIT_RESTORED", entityType: "PropertyUnit", entityId: unit.id, after: { reason: text(input.reason, 300) } });
  return { unitId: unit.id, archived: archive };
}
