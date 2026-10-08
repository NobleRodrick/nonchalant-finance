/**
 * The asset register of a department (long-term items: lighting, structures, chairs and tables
 * bought in bulk, vehicles, machines…). Values are computed from the purchase (lib/assets/
 * depreciation): nothing but the facts is stored. Assets are disposed of (sold, scrapped, lost),
 * never deleted.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { isDateKey } from "@/lib/timezone";
import { dbDate } from "@/lib/venue/dates";
import { CONDITION_LABELS } from "@/lib/rental/stock-math";
import { METHOD_LABELS, disposalResult } from "./depreciation";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function whole(value, label, { min = 0 } = {}) {
  const n = Number(value);
  if (value === undefined || value === null || value === "" || !Number.isInteger(n) || n < min) throw invalid(`${label} must be a whole number${min ? ` of at least ${min}` : " (0 or more)"}.`);
  return n;
}

/** The next free asset code ("AS-0007"). */
export async function nextAssetCode(tx, departmentId) {
  const rows = await tx.fixedAsset.findMany({ where: { departmentId, code: { startsWith: "AS-" } }, select: { code: true } });
  const max = rows.reduce((m, r) => Math.max(m, Number(r.code.slice(3)) || 0), 0);
  return `AS-${String(max + 1).padStart(4, "0")}`;
}

/** The fields of an asset from a form (shared by the asset page and purchases). */
export function assetFields(input) {
  const name = text(input?.name, 120);
  if (!name) throw invalid("Name the asset (e.g. LED wash lights, Toyota Hiace van).");
  if (!isDateKey(input.purchaseDateKey)) throw invalid("Enter the purchase date.");
  const cost = whole(input.cost, "The purchase price");
  const salvageValue = input.salvageValue === undefined || input.salvageValue === "" ? 0 : whole(input.salvageValue, "The value at the end of its life");
  if (salvageValue > cost) throw invalid("The value at the end of its life cannot be more than its price.");
  const usefulLifeMonths = whole(input.usefulLifeMonths, "The useful life (months)", { min: 1 });
  if (usefulLifeMonths > 600) throw invalid("The useful life is at most 50 years (600 months).");
  return {
    name,
    category: text(input.category, 60) || "Equipment",
    quantity: input.quantity ? whole(input.quantity, "The quantity", { min: 1 }) : 1,
    purchaseDate: dbDate(input.purchaseDateKey),
    cost,
    supplier: text(input.supplier, 120),
    usefulLifeMonths,
    salvageValue,
    method: METHOD_LABELS[input.method] ? input.method : "STRAIGHT_LINE",
    condition: CONDITION_LABELS[input.condition] ? input.condition : "GOOD",
    location: text(input.location, 120),
    responsibleName: text(input.responsibleName, 120),
    notes: text(input.notes, 1000),
  };
}

async function rentalItemOf(tx, department, itemId) {
  if (!itemId) return null;
  const item = await tx.rentalItem.findFirst({ where: { id: itemId, departmentId: department.id }, select: { id: true } });
  if (!item) throw notFound("The linked stock item was not found.");
  return item.id;
}

/** Adds an asset to the register, or changes one (its purchase facts and how it depreciates). */
export async function saveAsset(tx, ctx, input) {
  const fields = assetFields(input);
  const rentalItemId = await rentalItemOf(tx, ctx.department, input.rentalItemId);
  let code = text(input.code, 20)?.toUpperCase() || null;
  if (input.id) {
    const existing = await tx.fixedAsset.findFirst({ where: { id: input.id, departmentId: ctx.department.id } });
    if (!existing) throw notFound("Asset not found.");
    if (existing.disposedOn) throw conflict(`${existing.code} was disposed of: it no longer changes.`);
    code ||= existing.code;
    if (code !== existing.code && (await tx.fixedAsset.findFirst({ where: { departmentId: ctx.department.id, code } }))) throw conflict(`The code ${code} is already used.`);
    const a = await tx.fixedAsset.update({ where: { id: existing.id }, data: { ...fields, code, rentalItemId } });
    await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "ASSET_UPDATED", entityType: "FixedAsset", entityId: a.id, before: { cost: existing.cost, usefulLifeMonths: existing.usefulLifeMonths, method: existing.method, salvageValue: existing.salvageValue }, after: { cost: a.cost, usefulLifeMonths: a.usefulLifeMonths, method: a.method, salvageValue: a.salvageValue } });
    return { assetId: a.id, code: a.code };
  }
  code ||= await nextAssetCode(tx, ctx.department.id);
  if (await tx.fixedAsset.findFirst({ where: { departmentId: ctx.department.id, code } })) throw conflict(`The code ${code} is already used.`);
  let purchaseId = null;
  if (input.purchaseId) {
    const purchase = await tx.purchase.findFirst({ where: { id: input.purchaseId, departmentId: ctx.department.id }, select: { id: true } });
    if (!purchase) throw notFound("Purchase not found in this department.");
    purchaseId = purchase.id;
  }
  const a = await tx.fixedAsset.create({ data: { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, code, rentalItemId, purchaseId, ...fields, createdById: ctx.user.id } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "ASSET_ADDED", entityType: "FixedAsset", entityId: a.id, after: { code, name: a.name, cost: a.cost, usefulLifeMonths: a.usefulLifeMonths, method: a.method } });
  return { assetId: a.id, code: a.code };
}

/** Disposal: sold (money received), scrapped or lost; depreciation stops, the book value left is a loss (or a gain). */
export async function disposeAsset(tx, ctx, input) {
  const a = await tx.fixedAsset.findFirst({ where: { id: input?.assetId || "-", departmentId: ctx.department.id } });
  if (!a) throw notFound("Asset not found.");
  if (a.disposedOn) throw conflict(`${a.code} was already disposed of.`);
  if (!isDateKey(input.dateKey)) throw invalid("Enter the date.");
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why (sold, scrapped, lost …).");
  const disposalValue = input.disposalValue ? whole(input.disposalValue, "The money received") : 0;
  const updated = await tx.fixedAsset.update({ where: { id: a.id }, data: { disposedOn: dbDate(input.dateKey), disposalReason: reason, disposalValue } });
  const result = disposalResult(updated);
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "ASSET_DISPOSED", entityType: "FixedAsset", entityId: a.id, after: { code: a.code, reason, disposalValue, result } });
  return { assetId: a.id, code: a.code, result };
}
