/**
 * The price list of a pressing, car wash or jobs department: services with a price for each variant
 * (garment, vehicle type) and the washer's commission; and the workers (washers) who earn it.
 * Changing a price needs the right to change prices; services and workers are archived, never
 * deleted (tickets keep their prices).
 */
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { permits, PERMISSIONS } from "@/lib/permissions";
import { grantsIn } from "@/lib/access";
import { francs, text, whole } from "@/lib/property/input";
import { serviceSettings } from "./settings";

function prices(input, variants) {
  const out = {};
  const raw = input && typeof input === "object" ? input : {};
  for (const [k, v] of Object.entries(raw)) {
    if (v === "" || v === null || v === undefined) continue;
    if (!variants.includes(k)) throw invalid(`"${k}" is not one of the price list's variants (settings).`);
    out[k] = francs(v, `The price for ${k}`);
  }
  return out;
}

export async function saveServiceItem(tx, ctx, input) {
  const { user, department } = ctx;
  const name = text(input.name, 80);
  if (!name) throw invalid("Name the service, e.g. “Wash & iron” or “Full wash”.");
  const settings = serviceSettings(department);
  const commissionType = ["NONE", "PERCENT", "FIXED"].includes(input.commissionType) ? input.commissionType : "NONE";
  const data = {
    name,
    category: text(input.category, 60),
    basePrice: francs(input.basePrice, "The price"),
    prices: prices(input.prices, settings.variants),
    unit: text(input.unit, 20) || (department.domain === "CAR_WASH" ? "vehicle" : "item"),
    commissionType,
    commissionValue: commissionType === "NONE" ? 0 : whole(input.commissionValue, commissionType === "PERCENT" ? "The commission (%)" : "The commission (FCFA)", { min: 0, max: commissionType === "PERCENT" ? 100 : 1_000_000, fallback: 0 }),
    minutes: whole(input.minutes, "The usual duration (minutes)", { min: 1, max: 24 * 60, fallback: null }),
    sortOrder: whole(input.sortOrder, "The order", { min: 0, max: 1000, fallback: 0 }),
  };
  if (!data.basePrice && !Object.keys(data.prices).length) throw invalid("Give at least one price.");
  const clash = await tx.serviceItem.findFirst({ where: { departmentId: department.id, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (clash) throw conflict(`"${name}" is already in the price list.`);
  if (input.id) {
    const before = await tx.serviceItem.findFirst({ where: { id: input.id, departmentId: department.id } });
    if (!before) throw notFound("Service not found.");
    const same = (a, b) => JSON.stringify(Object.entries(a || {}).sort()) === JSON.stringify(Object.entries(b || {}).sort());
    const changed = before.basePrice !== data.basePrice || !same(before.prices, data.prices);
    if (changed && !permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(user, department.id))) throw forbidden("Your rights do not include changing prices.");
    const it = await tx.serviceItem.update({ where: { id: before.id }, data });
    await recordAudit(tx, { user, departmentId: department.id, action: "SERVICE_PRICE_SAVED", entityType: "ServiceItem", entityId: it.id, before: { basePrice: before.basePrice, prices: before.prices }, after: { basePrice: it.basePrice, prices: it.prices } });
    return { itemId: it.id };
  }
  const it = await tx.serviceItem.create({ data: { ...data, departmentId: department.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: "SERVICE_CREATED", entityType: "ServiceItem", entityId: it.id, after: data });
  return { itemId: it.id };
}

export async function archiveServiceItem(tx, ctx, input) {
  const it = await tx.serviceItem.findFirst({ where: { id: input.itemId || "-", departmentId: ctx.department.id } });
  if (!it) throw notFound("Service not found.");
  await tx.serviceItem.update({ where: { id: it.id }, data: { isActive: Boolean(input.restore) } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: input.restore ? "SERVICE_RESTORED" : "SERVICE_ARCHIVED", entityType: "ServiceItem", entityId: it.id });
  return { itemId: it.id };
}

export async function saveWorker(tx, ctx, input) {
  const name = text(input.name, 80);
  if (!name) throw invalid("Give the washer's name.");
  const clash = await tx.serviceWorker.findFirst({ where: { departmentId: ctx.department.id, name: { equals: name, mode: "insensitive" }, ...(input.id ? { NOT: { id: input.id } } : {}) } });
  if (clash) throw conflict(`"${name}" is already listed.`);
  const data = { name, phone: text(input.phone, 30), ...(input.isActive !== undefined ? { isActive: Boolean(input.isActive) } : {}) };
  const w = input.id
    ? await tx.serviceWorker.update({ where: { id: (await workerOf(tx, ctx.department, input.id)).id }, data })
    : await tx.serviceWorker.create({ data: { ...data, departmentId: ctx.department.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: input.id ? "WORKER_UPDATED" : "WORKER_ADDED", entityType: "ServiceWorker", entityId: w.id, after: data });
  return { workerId: w.id };
}

export async function workerOf(tx, department, id) {
  const w = await tx.serviceWorker.findFirst({ where: { id: id || "-", departmentId: department.id } });
  if (!w) throw notFound("Washer not found in this department.");
  return w;
}
