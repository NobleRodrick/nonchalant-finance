/**
 * Products of a shop, bar or other activity, and their stock (docs/TRADE_AND_SERVICES_PLAN.md).
 * A product is created with its opening count and cost (an opening balance); afterwards quantities
 * change only through movements, each under a lock on the product, valued at the average cost.
 * Products are archived, never deleted.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, forbidden, invalid, notFound } from "@/lib/errors";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { permits, PERMISSIONS } from "@/lib/permissions";
import { grantsIn } from "@/lib/access";
import { decimal, francs, text, whole } from "@/lib/property/input";
import { averageCost, movementValue, qty } from "./stock-math";

/** Locks products in a fixed order (no two operations wait on each other forever). */
export async function lockProducts(tx, ids) {
  for (const id of [...new Set(ids.filter(Boolean))].sort()) {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trade-product:${id}`}))`;
  }
}

export async function productOf(tx, department, productId, { lock = true } = {}) {
  if (lock) await lockProducts(tx, [productId || "-"]);
  const p = await tx.tradeProduct.findFirst({ where: { id: productId || "-", departmentId: department.id } });
  if (!p) throw notFound("Product not found in this department.");
  return p;
}

/**
 * Records a movement on a locked product and updates its quantity (and average cost for what
 * comes in at a price). `unitCost` defaults to the product's average cost. Refuses a stock below 0.
 */
export async function moveProduct(tx, ctx, product, kind, quantity, extra = {}) {
  const q = qty(quantity);
  if (product.kind === "SERVICE") return null;
  const next = qty(product.quantity + q);
  if (next < 0) throw conflict(`Not enough ${product.name} in stock: ${qty(product.quantity)} ${product.unit}(s) left.`);
  const unitCost = extra.unitCost ?? product.costPrice;
  const cost = q > 0 && ["PURCHASE", "OPENING", "RETURN"].includes(kind) ? averageCost(product.quantity, product.costPrice, q, unitCost) : product.costPrice;
  const m = await tx.tradeMovement.create({
    data: {
      departmentId: ctx.department.id,
      productId: product.id,
      kind,
      quantity: q,
      unitCost,
      value: movementValue(q, unitCost),
      date: extra.date || ctx.date || ctx.now,
      transactionId: extra.transactionId || null,
      tabLineId: extra.tabLineId || null,
      purchaseId: extra.purchaseId || null,
      note: text(extra.note, 300),
      createdById: ctx.user.id,
    },
  });
  await tx.tradeProduct.update({ where: { id: product.id }, data: { quantity: next, costPrice: cost } });
  product.quantity = next;
  product.costPrice = cost;
  return m;
}

function fields(input, { domain }) {
  const name = text(input.name, 120);
  if (!name) throw invalid("Give the product a name.");
  const kind = input.kind === "SERVICE" ? "SERVICE" : "GOODS";
  const barcode = text(input.barcode, 64)?.replace(/\s/g, "") || null;
  if (barcode && !/^[0-9A-Za-z-]{3,64}$/.test(barcode)) throw invalid("A barcode has letters and digits only.");
  return {
    name,
    kind,
    barcode,
    category: text(input.category, 60),
    unit: text(input.unit, 20) || (domain === "BAR" ? "bottle" : "piece"),
    salePrice: francs(input.salePrice, "The sale price", { required: true }),
    lowStock: decimal(input.lowStock, "The low-stock level") ?? 0,
    unitsPerPack: whole(input.unitsPerPack, "Units per pack", { min: 1, max: 10000, fallback: 1 }),
    supplierName: text(input.supplierName, 120),
    packagingId: input.packagingId || null,
  };
}

/** A new product (with its opening count and cost) or a product's details. */
export async function saveProduct(tx, ctx, input) {
  const { user, department } = ctx;
  const data = fields(input, { domain: department.domain });
  if (data.packagingId && !(await tx.tradePackaging.findFirst({ where: { id: data.packagingId, departmentId: department.id } }))) throw invalid("Choose a crate of this bar.");
  if (data.barcode) {
    const clash = await tx.tradeProduct.findFirst({ where: { departmentId: department.id, barcode: data.barcode, ...(input.id ? { NOT: { id: input.id } } : {}) }, select: { name: true } });
    if (clash) throw conflict(`This barcode is already used by ${clash.name}.`);
  }
  const same = await tx.tradeProduct.findFirst({ where: { departmentId: department.id, name: { equals: data.name, mode: "insensitive" }, isActive: true, ...(input.id ? { NOT: { id: input.id } } : {}) }, select: { code: true } });
  if (same) throw conflict(`A product named "${data.name}" already exists (${same.code}).`);

  if (input.id) {
    const before = await productOf(tx, department, input.id);
    if (before.salePrice !== data.salePrice && !permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(user, department.id))) throw forbidden("Your rights do not include changing prices.");
    if (before.kind !== data.kind && before.quantity) throw conflict("Empty the stock before turning this product into a service (or the reverse).");
    const p = await tx.tradeProduct.update({ where: { id: before.id }, data });
    await recordAudit(tx, { user, departmentId: department.id, action: "PRODUCT_UPDATED", entityType: "TradeProduct", entityId: p.id, before: { name: before.name, salePrice: before.salePrice, barcode: before.barcode }, after: { name: p.name, salePrice: p.salePrice, barcode: p.barcode } });
    return { productId: p.id, code: p.code };
  }
  const code = await nextReference(tx, department.id, DOC_TYPES.PRODUCT);
  const opening = data.kind === "SERVICE" ? 0 : decimal(input.openingQuantity, "The quantity in stock") ?? 0;
  const cost = francs(input.costPrice, "The cost price");
  const p = await tx.tradeProduct.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id, code, costPrice: cost, createdById: user.id } });
  if (opening > 0) await moveProduct(tx, ctx, p, "OPENING", opening, { unitCost: cost, note: "Opening count" });
  await recordAudit(tx, { user, departmentId: department.id, action: "PRODUCT_CREATED", entityType: "TradeProduct", entityId: p.id, after: { code, name: p.name, salePrice: p.salePrice, cost, opening } });
  return { productId: p.id, code };
}

/** A physical count (the stock becomes what was counted) or a loss (broken, expired, stolen …). */
export async function adjustStock(tx, ctx, input) {
  const p = await productOf(tx, ctx.department, input.productId);
  if (p.kind === "SERVICE") throw invalid("A service has no stock.");
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the stock changes.");
  if (input.kind === "LOSS") {
    const q = decimal(input.quantity, "The quantity lost");
    if (!q) throw invalid("Enter the quantity lost.");
    const m = await moveProduct(tx, ctx, p, "LOSS", -q, { note: reason });
    await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "STOCK_LOSS", entityType: "TradeProduct", entityId: p.id, after: { quantity: q, value: -m.value, reason } });
    return { productId: p.id, quantity: p.quantity };
  }
  const counted = decimal(input.counted, "The quantity counted");
  if (counted === null) throw invalid("Enter the quantity counted.");
  const diff = qty(counted - p.quantity);
  if (!diff) throw invalid(`The stock already shows ${counted}.`);
  await moveProduct(tx, ctx, p, "COUNT", diff, { note: reason });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "STOCK_COUNTED", entityType: "TradeProduct", entityId: p.id, after: { counted, difference: diff, reason } });
  return { productId: p.id, quantity: p.quantity, difference: diff };
}

/** No longer sold (history kept), or back on sale. */
export async function archiveProduct(tx, ctx, input) {
  const p = await productOf(tx, ctx.department, input.productId);
  const isActive = Boolean(input.restore);
  if (!isActive && qty(p.quantity) > 0) throw conflict(`${p.name} still has ${qty(p.quantity)} in stock: sell, count or write it off first.`);
  await tx.tradeProduct.update({ where: { id: p.id }, data: { isActive } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: isActive ? "PRODUCT_RESTORED" : "PRODUCT_ARCHIVED", entityType: "TradeProduct", entityId: p.id });
  return { productId: p.id, isActive };
}
