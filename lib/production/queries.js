/**
 * Read side of production: recipes with their cost and margin, production batches of a period, and
 * the production report (made, cost, waste, by product).
 */
import { db } from "@/lib/prisma";
import { formatTimeInZone, rangeBounds, toDateKey } from "@/lib/timezone";
import { qty } from "@/lib/trade/stock-math";
import { recipeCost } from "./production-math";

/** Every recipe of a department with its materials, cost per unit (at today's average costs) and margin. */
export async function recipeBoard({ departmentId, client = db }) {
  const [recipes, products] = await Promise.all([
    client.productionRecipe.findMany({ where: { departmentId }, include: { lines: { orderBy: { position: "asc" } } } }),
    client.tradeProduct.findMany({ where: { departmentId }, select: { id: true, name: true, unit: true, costPrice: true, salePrice: true, quantity: true, kind: true } }),
  ]);
  const byId = Object.fromEntries(products.map((p) => [p.id, p]));
  return recipes
    .map((r) => {
      const product = byId[r.productId];
      const c = recipeCost(r, (id) => byId[id]?.costPrice || 0, product?.salePrice || 0);
      // How many rounds the stock of materials allows now.
      const rounds = r.lines.length ? Math.floor(Math.min(...r.lines.map((l) => qty(byId[l.materialId]?.quantity || 0) / l.quantity))) : 0;
      return {
        id: r.id,
        productId: r.productId,
        product: product?.name || "—",
        unit: product?.unit,
        salePrice: product?.salePrice || 0,
        yieldQuantity: r.yieldQuantity,
        note: r.note,
        lines: r.lines.map((l) => ({ materialId: l.materialId, name: byId[l.materialId]?.name || "—", unit: byId[l.materialId]?.unit, quantity: l.quantity, cost: Math.round(l.quantity * (byId[l.materialId]?.costPrice || 0)), inStock: qty(byId[l.materialId]?.quantity || 0) })),
        ...c,
        rounds: Math.max(0, rounds),
      };
    })
    .sort((a, b) => a.product.localeCompare(b.product));
}

/** Batches of [fromKey, toKey] with what they used. */
export async function batchList({ departmentId, fromKey, toKey, timeZone, client = db }) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const batches = await client.productionBatch.findMany({ where: { departmentId, date: { gte: start, lte: end } }, orderBy: { date: "desc" }, take: 1000 });
  const [moves, products, users] = await Promise.all([
    client.tradeMovement.findMany({ where: { productionBatchId: { in: batches.map((b) => b.id) }, kind: "PRODUCTION_OUT" }, select: { productionBatchId: true, productId: true, quantity: true, value: true, note: true } }),
    client.tradeProduct.findMany({ where: { departmentId }, select: { id: true, name: true, unit: true } }),
    client.user.findMany({ where: { id: { in: [...new Set(batches.map((b) => b.createdById))] } }, select: { id: true, name: true } }),
  ]);
  const name = (id) => products.find((p) => p.id === id);
  return batches.map((b) => ({
    id: b.id,
    referenceNo: b.referenceNo,
    dateKey: toDateKey(b.date, timeZone),
    time: formatTimeInZone(b.date, timeZone),
    productId: b.productId,
    product: name(b.productId)?.name || "—",
    unit: name(b.productId)?.unit,
    planned: b.plannedQuantity,
    produced: b.producedQuantity,
    waste: Math.max(0, qty(b.plannedQuantity - b.producedQuantity)),
    totalCost: b.totalCost,
    unitCost: b.unitCost,
    voided: b.status === "VOIDED",
    voidReason: b.voidReason,
    note: b.note,
    by: users.find((u) => u.id === b.createdById)?.name || "",
    materials: moves.filter((m) => m.productionBatchId === b.id && !String(m.note || "").startsWith("Void")).map((m) => ({ name: name(m.productId)?.name, unit: name(m.productId)?.unit, quantity: -m.quantity, value: -m.value })),
  }));
}

/** Production of a period: by product (made, cost, unit cost, waste) and totals. */
export async function productionReport({ departmentId, fromKey, toKey, timeZone, client = db }) {
  const batches = (await batchList({ departmentId, fromKey, toKey, timeZone, client })).filter((b) => !b.voided);
  const by = new Map();
  for (const b of batches) {
    const x = by.get(b.productId) || { productId: b.productId, name: b.product, unit: b.unit, batches: 0, planned: 0, produced: 0, cost: 0 };
    x.batches += 1;
    x.planned = qty(x.planned + b.planned);
    x.produced = qty(x.produced + b.produced);
    x.cost += b.totalCost;
    by.set(b.productId, x);
  }
  const byProduct = [...by.values()].map((x) => ({ ...x, unitCost: x.produced ? Math.round(x.cost / x.produced) : 0, waste: Math.max(0, qty(x.planned - x.produced)), wastePct: x.planned ? Math.round((Math.max(0, x.planned - x.produced) / x.planned) * 1000) / 10 : 0 })).sort((a, b) => b.cost - a.cost);
  return { batches: batches.length, cost: byProduct.reduce((s, x) => s + x.cost, 0), byProduct };
}
