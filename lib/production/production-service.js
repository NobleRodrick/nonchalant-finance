/**
 * Production (bakery, juice, soap, tailoring …): a recipe says what one round of a product uses
 * (120 loaves: 50 kg of flour, 1 kg of yeast …); a production batch takes the raw materials out of
 * the stock at their average cost and puts the good units made into the stock at the real cost of
 * the batch (fewer good units — waste — raise the unit cost). A batch recorded by mistake is
 * voided: the products go out again and the materials come back.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { assertCanPost } from "@/lib/posting-guard";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { decimal, text } from "@/lib/property/input";
import { lockProducts, moveProduct } from "@/lib/trade/product-service";
import { qty } from "@/lib/trade/stock-math";
import { batchFigures, scaleRecipe } from "./production-math";

async function finishedProduct(tx, department, productId) {
  const p = await tx.tradeProduct.findFirst({ where: { id: productId || "-", departmentId: department.id } });
  if (!p) throw notFound("Product not found in this department.");
  if (p.kind !== "GOODS") throw invalid(`${p.name} is ${p.kind === "RAW" ? "a raw material" : "a service"}: choose a product you make and sell.`);
  return p;
}

/** A product's recipe: what one round uses and how many units it makes. */
export async function saveRecipe(tx, ctx, input) {
  const { department, user } = ctx;
  const product = await finishedProduct(tx, department, input.productId);
  const yieldQuantity = decimal(input.yieldQuantity, "The quantity one recipe makes");
  if (!yieldQuantity || yieldQuantity <= 0) throw invalid("Enter how many units one recipe makes.");
  const raw = (Array.isArray(input.lines) ? input.lines : []).filter((l) => l?.materialId && Number(l.quantity));
  if (!raw.length) throw invalid("Add at least one material.");
  if (raw.length > 60) throw invalid("At most 60 materials in a recipe.");
  const ids = raw.map((l) => l.materialId);
  if (new Set(ids).size !== ids.length) throw invalid("A material appears twice: put its total on one line.");
  if (ids.includes(product.id)) throw invalid("A product cannot be a material of its own recipe.");
  const materials = await tx.tradeProduct.findMany({ where: { id: { in: ids }, departmentId: department.id } });
  const lines = raw.map((l, i) => {
    const m = materials.find((x) => x.id === l.materialId);
    if (!m) throw invalid(`Line ${i + 1}: the material is not in this department.`);
    if (m.kind === "SERVICE") throw invalid(`${m.name} is a service: it has no stock to use.`);
    const quantity = decimal(l.quantity, `The quantity of ${m.name}`);
    if (!quantity || quantity <= 0) throw invalid(`Enter the quantity of ${m.name}.`);
    return { materialId: m.id, quantity, position: i };
  });
  const existing = await tx.productionRecipe.findUnique({ where: { productId: product.id } });
  const recipe = existing
    ? await tx.productionRecipe.update({ where: { id: existing.id }, data: { yieldQuantity, note: text(input.note, 500) } })
    : await tx.productionRecipe.create({ data: { departmentId: department.id, productId: product.id, yieldQuantity, note: text(input.note, 500) } });
  await tx.productionRecipeLine.deleteMany({ where: { recipeId: recipe.id } });
  await tx.productionRecipeLine.createMany({ data: lines.map((l) => ({ ...l, recipeId: recipe.id })) });
  await recordAudit(tx, { user, departmentId: department.id, action: existing ? "RECIPE_UPDATED" : "RECIPE_CREATED", entityType: "ProductionRecipe", entityId: recipe.id, after: { product: product.name, yieldQuantity, lines: lines.length } });
  return { recipeId: recipe.id };
}

/**
 * A production batch: `producedQuantity` good units of `productId`, from the recipe scaled to
 * `plannedQuantity` (or `runs` rounds of the recipe), or from `materials` [{ productId, quantity }]
 * given by hand (what was really used).
 */
export async function recordBatch(tx, ctx, input) {
  const { department, user, timeZone } = ctx;
  const product = await finishedProduct(tx, department, input.productId);
  const recipe = await tx.productionRecipe.findUnique({ where: { productId: product.id }, include: { lines: true } });
  const produced = decimal(input.producedQuantity, "The quantity made");
  if (!produced || produced <= 0) throw invalid("Enter how many good units were made.");
  let planned = decimal(input.plannedQuantity, "The quantity planned");
  if (!planned && Number(input.runs) > 0 && recipe) planned = qty(Number(input.runs) * recipe.yieldQuantity);
  if (!planned) planned = produced;
  const byHand = (Array.isArray(input.materials) ? input.materials : []).filter((m) => m?.productId && Number(m.quantity) > 0);
  let wanted = byHand.length ? byHand.map((m) => ({ productId: m.productId, quantity: decimal(m.quantity, "A quantity used") })) : recipe ? scaleRecipe(recipe, planned).map((l) => ({ productId: l.materialId, quantity: l.quantity })) : [];
  if (!wanted.length) throw invalid(`${product.name} has no recipe: add one, or enter the materials used.`);
  const merged = new Map();
  for (const w of wanted) merged.set(w.productId, qty((merged.get(w.productId) || 0) + w.quantity));
  wanted = [...merged.entries()].map(([productId, quantity]) => ({ productId, quantity }));
  if (wanted.some((w) => w.productId === product.id)) throw invalid("A product cannot be used to make itself.");
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  await lockProducts(tx, [product.id, ...wanted.map((w) => w.productId)]);
  const materials = await tx.tradeProduct.findMany({ where: { id: { in: wanted.map((w) => w.productId) }, departmentId: department.id } });
  if (materials.length !== wanted.length) throw invalid("A material is not in this department.");
  const short = wanted.map((w) => ({ w, m: materials.find((x) => x.id === w.productId) })).filter(({ w, m }) => m.kind !== "SERVICE" && qty(m.quantity) < w.quantity);
  if (short.length) throw conflict(`Not enough in stock: ${short.map(({ w, m }) => `${m.name} (need ${w.quantity} ${m.unit}, have ${qty(m.quantity)})`).join(", ")}.`);
  const figures = batchFigures({ materials: wanted.map((w) => ({ quantity: w.quantity, unitCost: materials.find((m) => m.id === w.productId).costPrice })), planned, produced });
  const batch = await tx.productionBatch.create({
    data: { departmentId: department.id, referenceNo: await nextReference(tx, department.id, DOC_TYPES.PRODUCTION_BATCH), productId: product.id, recipeId: recipe?.id || null, plannedQuantity: planned, producedQuantity: produced, totalCost: figures.totalCost, unitCost: figures.unitCost, date, note: text(input.note, 300), createdById: user.id },
  });
  for (const w of wanted) {
    const m = materials.find((x) => x.id === w.productId);
    await moveProduct(tx, ctx, m, "PRODUCTION_OUT", -w.quantity, { productionBatchId: batch.id, note: `${batch.referenceNo}: ${product.name}` });
  }
  const fresh = await tx.tradeProduct.findUnique({ where: { id: product.id } });
  await moveProduct(tx, ctx, fresh, "PRODUCTION_IN", produced, { unitCost: figures.unitCost, value: figures.totalCost, productionBatchId: batch.id, note: `${batch.referenceNo}: made` });
  await recordAudit(tx, { user, departmentId: department.id, action: "PRODUCTION_BATCH", entityType: "ProductionBatch", entityId: batch.id, after: { referenceNo: batch.referenceNo, product: product.name, planned, produced, totalCost: figures.totalCost, unitCost: figures.unitCost } });
  return { batchId: batch.id, referenceNo: batch.referenceNo, totalCost: figures.totalCost, unitCost: figures.unitCost, waste: figures.waste };
}

/** A batch recorded by mistake: its products leave the stock, its materials come back at the cost they left. */
export async function voidBatch(tx, ctx, input) {
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Give a reason for voiding.");
  const batch = await tx.productionBatch.findFirst({ where: { id: input.batchId || "-", departmentId: ctx.department.id } });
  if (!batch) throw notFound("Batch not found.");
  if (batch.status === "VOIDED") throw conflict(`${batch.referenceNo} is already voided.`);
  const moves = await tx.tradeMovement.findMany({ where: { productionBatchId: batch.id } });
  await lockProducts(tx, moves.map((m) => m.productId));
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, date, timeZone: ctx.timeZone });
  for (const m of moves.filter((x) => x.kind === "PRODUCTION_IN")) {
    const p = await tx.tradeProduct.findUnique({ where: { id: m.productId } });
    if (qty(p.quantity) < qty(m.quantity)) throw conflict(`${p.name}: ${qty(m.quantity)} were made but only ${qty(p.quantity)} are left (some were sold). Count the stock instead.`);
    await moveProduct(tx, ctx, p, "PRODUCTION_OUT", -m.quantity, { unitCost: m.unitCost, value: -m.value, productionBatchId: batch.id, note: `Void of ${batch.referenceNo}: ${reason}` });
  }
  for (const m of moves.filter((x) => x.kind === "PRODUCTION_OUT")) {
    const p = await tx.tradeProduct.findUnique({ where: { id: m.productId } });
    await moveProduct(tx, ctx, p, "PRODUCTION_IN", -m.quantity, { unitCost: m.unitCost, value: -m.value, productionBatchId: batch.id, note: `Void of ${batch.referenceNo}: back in stock` });
  }
  await tx.productionBatch.update({ where: { id: batch.id }, data: { status: "VOIDED", voidReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "PRODUCTION_BATCH_VOIDED", entityType: "ProductionBatch", entityId: batch.id, after: { reason } });
  return { batchId: batch.id };
}
