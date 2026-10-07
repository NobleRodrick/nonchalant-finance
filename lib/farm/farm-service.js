/**
 * A farm's batches: a band of chickens or pigs, a field and its season, a fish pond's cycle. Each
 * day's facts are events: deaths, feed and treatments (taken from the stock of inputs at their
 * average cost, or only noted), weighings, produce (eggs, harvest, fish) into the stock of a
 * product to sell, animals added. Animals or a harvest sold from the batch are a sale of the batch
 * (paid or on credit). Expenses and income can name their batch; the batch's profit follows.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { assertCanPost } from "@/lib/posting-guard";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { SALE_METHODS, createTransaction, departmentDrawer, resolveDebtor } from "@/lib/finance/posting-service";
import { debtStatus } from "@/lib/finance/money-math";
import { instantForDateKey, isDateKey } from "@/lib/timezone";
import { decimal, francs, text } from "@/lib/property/input";
import { lockProducts, moveProduct } from "@/lib/trade/product-service";
import { BATCH_KINDS, EVENT_LABELS, batchFigures, eventKindsFor } from "./farm-math";

const dayOf = (key, ctx, fallback) => (isDateKey(key || "") ? instantForDateKey(key, ctx.timeZone, ctx.now) : fallback);

export async function batchOf(tx, department, batchId, { lock = true } = {}) {
  if (lock) await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`farm-batch:${batchId || "-"}`}))`;
  const b = await tx.farmBatch.findFirst({ where: { id: batchId || "-", departmentId: department.id } });
  if (!b) throw notFound("Batch not found on this farm.");
  return b;
}

async function figuresOf(tx, batch) {
  const [events, records] = await Promise.all([tx.farmEvent.findMany({ where: { batchId: batch.id } }), tx.transaction.findMany({ where: { farmBatchId: batch.id }, select: { type: true, amount: true, status: true } })]);
  return batchFigures(batch, events, records);
}

/** A new batch, or its details. */
export async function saveBatch(tx, ctx, input) {
  const { user, department } = ctx;
  const kind = BATCH_KINDS[input.kind] ? input.kind : null;
  if (!kind) throw invalid("Choose what the batch is: poultry, livestock, crops or fish.");
  const name = text(input.name, 120);
  if (!name) throw invalid("Name the batch, e.g. “Broilers house 2 – October”.");
  const initialCount = decimal(input.initialCount, BATCH_KINDS[kind].live ? "The number put in" : "The area");
  if (initialCount === null || initialCount < 0) throw invalid(BATCH_KINDS[kind].live ? "Enter how many animals or fish were put in." : "Enter the area (or 0).");
  const data = {
    name,
    location: text(input.location, 120),
    breed: text(input.breed, 120),
    unit: text(input.unit, 20) || BATCH_KINDS[kind].unit,
    note: text(input.note, 1000),
    expectedEndDate: isDateKey(input.expectedEndKey || "") ? instantForDateKey(input.expectedEndKey, ctx.timeZone, ctx.now) : null,
  };
  if (input.id) {
    const b = await batchOf(tx, department, input.id);
    const f = await figuresOf(tx, b);
    if (f.live && initialCount + f.added - f.dead - f.soldAlive < 0) throw conflict("More animals already died or were sold than that.");
    await tx.farmBatch.update({ where: { id: b.id }, data: { ...data, initialCount } });
    await recordAudit(tx, { user, departmentId: department.id, action: "FARM_BATCH_UPDATED", entityType: "FarmBatch", entityId: b.id, after: { ...data, initialCount } });
    return { batchId: b.id };
  }
  const startDate = dayOf(input.startKey, ctx, ctx.date || ctx.now);
  const b = await tx.farmBatch.create({ data: { ...data, kind, initialCount, startDate, organizationId: user.organizationId, departmentId: department.id, referenceNo: await nextReference(tx, department.id, DOC_TYPES.FARM_BATCH), createdById: user.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: "FARM_BATCH_CREATED", entityType: "FarmBatch", entityId: b.id, after: { referenceNo: b.referenceNo, kind, name, initialCount } });
  return { batchId: b.id, referenceNo: b.referenceNo };
}

/**
 * One fact of a batch: MORTALITY | FEED | TREATMENT | WEIGHT | PRODUCE | ADDITION | NOTE. Feed and
 * treatments with a `productId` are taken from the stock (their cost goes to the batch); produce
 * with a `productId` goes into the stock of that product (to sell at the till).
 */
export async function recordEvent(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const b = await batchOf(tx, department, input.batchId);
  if (b.status !== "ACTIVE") throw conflict(`${b.referenceNo} is closed: reopen it to record more.`);
  const kind = input.kind;
  if (!eventKindsFor(b.kind).includes(kind)) throw invalid("Choose what happened.");
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const note = text(input.note, 300);
  let quantity = 0;
  if (kind !== "NOTE") {
    quantity = decimal(input.quantity, "The quantity");
    if (!quantity || quantity <= 0) throw invalid("Enter the quantity.");
  } else if (!note) throw invalid("Write the note.");
  const f = await figuresOf(tx, b);
  if (kind === "MORTALITY" && f.live && quantity > f.alive) throw conflict(`Only ${f.alive} ${b.unit} are alive in ${b.referenceNo}.`);
  let product = null;
  if (input.productId && ["FEED", "TREATMENT", "PRODUCE"].includes(kind)) {
    await lockProducts(tx, [input.productId]);
    product = await tx.tradeProduct.findFirst({ where: { id: input.productId, departmentId: department.id } });
    if (!product) throw invalid("Choose a product of this farm.");
    if (product.kind === "SERVICE") throw invalid(`${product.name} is a service: it has no stock.`);
  }
  const unit = text(input.unit, 20) || product?.unit || (kind === "MORTALITY" || kind === "ADDITION" ? b.unit : kind === "WEIGHT" ? "kg" : null);
  const e = await tx.farmEvent.create({ data: { batchId: b.id, departmentId: department.id, kind, date, quantity, unit, productId: product?.id || null, note, createdById: user.id } });
  if (product && ["FEED", "TREATMENT"].includes(kind)) {
    const m = await moveProduct(tx, ctx, product, "PRODUCTION_OUT", -quantity, { farmEventId: e.id, note: `${b.referenceNo}: ${EVENT_LABELS[kind].toLowerCase()}` });
    await tx.farmEvent.update({ where: { id: e.id }, data: { value: -m.value } });
  } else if (product && kind === "PRODUCE") {
    // Produce enters the stock at no cost: what it cost is already in the batch (feed, care …).
    await moveProduct(tx, ctx, product, "PRODUCTION_IN", quantity, { unitCost: 0, farmEventId: e.id, note: `${b.referenceNo}: produce` });
  }
  await recordAudit(tx, { user, departmentId: department.id, action: `FARM_${kind}`, entityType: "FarmBatch", entityId: b.id, after: { quantity, unit, product: product?.name, note } });
  return { eventId: e.id };
}

/** An event recorded by mistake: what it took from the stock comes back, what it put in goes out. */
export async function voidEvent(tx, ctx, input) {
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Give a reason.");
  const e = await tx.farmEvent.findFirst({ where: { id: input.eventId || "-", departmentId: ctx.department.id } });
  if (!e) throw notFound("Record not found.");
  if (e.voidedAt) throw conflict("Already voided.");
  if (e.kind === "SALE") throw conflict("Undo the sale itself (Money in / out): its record follows.");
  const b = await batchOf(tx, ctx.department, e.batchId);
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: ctx.user.organizationId, departmentId: ctx.department.id, date, timeZone: ctx.timeZone });
  if (e.kind === "ADDITION") {
    const f = await figuresOf(tx, b);
    if (f.alive - e.quantity < 0) throw conflict("Those animals already died or were sold.");
  }
  const moves = await tx.tradeMovement.findMany({ where: { farmEventId: e.id } });
  await lockProducts(tx, moves.map((m) => m.productId));
  for (const m of moves) {
    const p = await tx.tradeProduct.findUnique({ where: { id: m.productId } });
    await moveProduct(tx, ctx, p, m.quantity < 0 ? "PRODUCTION_IN" : "PRODUCTION_OUT", -m.quantity, { unitCost: m.unitCost, farmEventId: e.id, note: `Void: ${reason}` });
  }
  await tx.farmEvent.update({ where: { id: e.id }, data: { voidedAt: new Date(), voidReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "FARM_EVENT_VOIDED", entityType: "FarmBatch", entityId: b.id, after: { kind: e.kind, reason } });
  return { eventId: e.id };
}

/**
 * Animals (or a harvest) sold from a batch: `quantity` (heads, kg …) for `amount` francs, paid by
 * cash, Mobile Money, bank, other, or on credit (the buyer's debt).
 */
export async function sellFromBatch(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const b = await batchOf(tx, department, input.batchId);
  const quantity = decimal(input.quantity, "The quantity sold");
  if (!quantity || quantity <= 0) throw invalid("Enter how many were sold.");
  const amount = francs(input.amount, "The amount of the sale", { required: true, min: 1 });
  const method = input.paymentMethod || "CASH";
  if (![...SALE_METHODS, "OTHER"].includes(method)) throw invalid("Choose how the buyer paid.");
  const reference = text(input.reference, 80);
  if (["MOMO", "BANK_TRANSFER", "OTHER"].includes(method) && !reference) throw invalid("Enter the transaction reference.");
  const f = await figuresOf(tx, b);
  if (f.live && quantity > f.alive) throw conflict(`Only ${f.alive} ${b.unit} are alive in ${b.referenceNo}.`);
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const debtorRow = method === "CREDIT" ? await resolveDebtor(tx, { user, department, debtorId: input.debtorId, debtor: input.debtor }) : null;
  const account = method === "CREDIT" ? null : await departmentDrawer(tx, { user, departmentId: department.id });
  const unit = text(input.unit, 20) || (f.live ? b.unit : "kg");
  const what = `${quantity} ${unit} from ${b.name} (${b.referenceNo})`;
  const t = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.SALE,
    data: { type: "SALE", amount, grossAmount: amount, discountAmount: 0, netAmount: amount, paymentMethod: method, customerName: debtorRow?.name || text(input.buyer, 120), counterparty: debtorRow?.name || text(input.buyer, 120), reference, operationCategory: "SALE_SERVICES", category: "sale-farm", description: what.slice(0, 300), date, accountId: account?.id || null, farmBatchId: b.id, idempotencyKey: ctx.key },
  });
  if (debtorRow) {
    await tx.debt.create({
      data: { source: "CREDIT_SALE", referenceNo: await nextReference(tx, department.id, DOC_TYPES.DEBT), debtorId: debtorRow.id, debtorName: debtorRow.name, debtorContact: debtorRow.phone, foodDescription: what.slice(0, 300), amountOwed: amount, amountPaid: 0, status: debtStatus(amount, 0).status, date, transactionId: t.id, organizationId: user.organizationId, departmentId: department.id, userId: user.id },
    });
  }
  await tx.farmEvent.create({ data: { batchId: b.id, departmentId: department.id, kind: "SALE", date, quantity, unit, transactionId: t.id, note: text(input.note, 300), createdById: user.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: "FARM_SALE", entityType: "FarmBatch", entityId: b.id, after: { referenceNo: t.referenceNo, quantity, amount, method } });
  return { transactionId: t.id, referenceNo: t.referenceNo, amount, unitPrice: Math.round(amount / quantity) };
}

/** The batch is over (sold, harvested), or reopened. */
export async function closeBatch(tx, ctx, input) {
  const b = await batchOf(tx, ctx.department, input.batchId);
  if (input.reopen) {
    await tx.farmBatch.update({ where: { id: b.id }, data: { status: "ACTIVE", closedAt: null } });
  } else {
    if (b.status === "CLOSED") throw conflict(`${b.referenceNo} is already closed.`);
    const f = await figuresOf(tx, b);
    if (f.live && f.alive > 0 && !input.force) throw conflict(`${f.alive} ${b.unit} are still alive: sell them, record the deaths, or close anyway.`);
    await tx.farmBatch.update({ where: { id: b.id }, data: { status: "CLOSED", closedAt: ctx.date || ctx.now, closeNote: text(input.note, 300) } });
  }
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: input.reopen ? "FARM_BATCH_REOPENED" : "FARM_BATCH_CLOSED", entityType: "FarmBatch", entityId: b.id });
  return { batchId: b.id };
}

