/** Reading the stock of an event rental department for pages and reports (scoped to the department). */
import { db } from "@/lib/prisma";
import { attachmentUrl } from "@/lib/attachments";
import { inStock, stockAlert, stockValue, unitLossValue } from "./stock-math";

const shape = (i) => ({
  ...i,
  inStock: inStock(i),
  value: stockValue(i),
  lossValue: unitLossValue(i),
  alert: i.archivedAt ? null : stockAlert(i),
  photoUrl: i.photoId ? attachmentUrl(i.photoId) : null,
});

/**
 * The stock sheet: every line with its counters and value. `status`: "active" (default),
 * "archived", "low" (at or under its low-stock level), "all"; `q` searches name, code, category,
 * supplier and place; `category` filters.
 */
export async function stockSheet({ departmentId, q = "", category = "", status = "active", client = db }) {
  const term = String(q || "").trim();
  const rows = await client.rentalItem.findMany({
    where: {
      departmentId,
      ...(status === "archived" ? { archivedAt: { not: null } } : status === "all" ? {} : { archivedAt: null }),
      ...(category ? { category } : {}),
      ...(term
        ? { OR: ["name", "code", "category", "supplier", "location", "description"].map((f) => ({ [f]: { contains: term, mode: "insensitive" } })) }
        : {}),
    },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  const items = rows.map(shape);
  return status === "low" ? items.filter((i) => i.alert) : items;
}

/** Totals of a stock sheet (units by state, value). */
export function stockTotals(items) {
  const t = { lines: items.length, owned: 0, inStock: 0, out: 0, damaged: 0, inRepair: 0, missing: 0, value: 0, low: 0 };
  for (const i of items) {
    for (const k of ["owned", "inStock", "out", "damaged", "inRepair", "missing", "value"]) t[k] += i[k];
    if (i.alert) t.low += 1;
  }
  return t;
}

/** Categories used by the department's lines (for filters and suggestions). */
export async function itemCategories(departmentId, client = db) {
  const rows = await client.rentalItem.groupBy({ by: ["category"], where: { departmentId }, orderBy: { category: "asc" } });
  return rows.map((r) => r.category);
}

/** One line with its movement history (newest first). */
export async function itemDetail({ departmentId, itemId, take = 200, client = db }) {
  const item = await client.rentalItem.findFirst({ where: { id: itemId, departmentId } });
  if (!item) return null;
  const movements = await client.rentalMovement.findMany({
    where: { itemId: item.id },
    include: { createdBy: { select: { name: true } }, order: { select: { id: true, referenceNo: true } } },
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    take,
  });
  return { item: shape(item), movements };
}

/** Lines that can be booked (active), for pickers: id, code, name, category, price, units. */
export async function bookableItems(departmentId, client = db) {
  const rows = await client.rentalItem.findMany({ where: { departmentId, archivedAt: null }, orderBy: [{ category: "asc" }, { name: "asc" }] });
  return rows.map((i) => ({ id: i.id, code: i.code, name: i.name, category: i.category, unit: i.unit, rentalPrice: i.rentalPrice, owned: i.owned, inStock: inStock(i), photoUrl: i.photoId ? attachmentUrl(i.photoId) : null }));
}

// ─── Damaged, broken and missing items ───────────────────────────────────────

/**
 * Damage / loss records (newest first). `status`: "open" (to settle or in repair), a status, or
 * "all"; `itemId`, `orderId` narrow them.
 */
export async function incidentList({ departmentId, status = "open", itemId, orderId, take = 300, client = db }) {
  return client.rentalIncident.findMany({
    where: {
      departmentId,
      ...(status === "open" ? { OR: [{ status: "OPEN" }, { stockAction: "REPAIR", repairedAt: null }] } : status && status !== "all" ? { status } : {}),
      ...(itemId ? { itemId } : {}),
      ...(orderId ? { orderId } : {}),
    },
    include: { item: { select: { id: true, name: true, code: true, purchasePrice: true, replacementValue: true } }, order: { select: { id: true, referenceNo: true, client: { select: { name: true } } } }, createdBy: { select: { name: true } }, charge: { select: { referenceNo: true, amount: true, voidedAt: true } } },
    orderBy: { date: "desc" },
    take,
  });
}

/** Totals of damage / loss records: to settle, in repair, estimated loss, repair costs, charged. */
export function incidentTotals(rows) {
  const t = { open: 0, inRepair: 0, units: 0, estimatedLoss: 0, repairCost: 0, charged: 0 };
  for (const r of rows) {
    if (r.status === "OPEN") t.open += 1;
    if (r.stockAction === "REPAIR" && !r.repairedAt) t.inRepair += 1;
    t.units += r.quantity;
    t.estimatedLoss += r.estimatedLoss;
    t.repairCost += r.repairCost;
    if (r.charge && !r.charge.voidedAt) t.charged += r.chargedAmount;
  }
  return t;
}
