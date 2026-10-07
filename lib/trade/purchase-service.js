/**
 * Purchases of goods (shop, bar, other): the goods enter the stock at their cost (the average cost
 * is updated); the money leaves the drawer, MoMo or bank — or the purchase is on credit: a supplier
 * bill of the company's books, paid later from Purchases & suppliers. Bar: full crates come in with
 * their deposit (paid with the goods; on credit the crates are owed back in kind), empties may go
 * back in the same delivery. A purchase recorded by mistake is voided: its goods leave the stock.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { assertCanPost } from "@/lib/posting-guard";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { PAID_METHODS, createTransaction, departmentDrawer, voidTransaction } from "@/lib/finance/posting-service";
import { getDomain } from "@/lib/domains/registry";
import { createBillCore } from "@/lib/accounting/bills";
import { toDateKey } from "@/lib/timezone";
import { decimal, francs, text } from "@/lib/property/input";
import { lockProducts, moveProduct } from "./product-service";
import { qty } from "./stock-math";

const METHODS = [...PAID_METHODS, "CREDIT"];

export async function recordTradePurchase(tx, ctx, input) {
  const { user, department, timeZone } = ctx;
  const supplierName = text(input.supplierName, 120);
  if (!supplierName) throw invalid("Name the supplier.");
  const method = input.paymentMethod || "CASH";
  if (!METHODS.includes(method)) throw invalid("Choose how the purchase was paid (or on credit).");
  const reference = text(input.reference, 80);
  if (["MOMO", "BANK_TRANSFER", "OTHER"].includes(method) && !reference) throw invalid("Enter the transaction reference.");
  const raw = (Array.isArray(input.lines) ? input.lines : []).filter((l) => l?.productId && Number(l.quantity));
  if (!raw.length) throw invalid("Add at least one product bought.");
  await lockProducts(tx, raw.map((l) => l.productId));
  const products = await tx.tradeProduct.findMany({ where: { id: { in: raw.map((l) => l.productId) }, departmentId: department.id } });
  const lines = raw.map((l, i) => {
    const p = products.find((x) => x.id === l.productId);
    if (!p) throw invalid(`Line ${i + 1}: the product is not in this department.`);
    if (p.kind === "SERVICE") throw invalid(`${p.name} is a service: it is not bought into stock.`);
    const quantity = decimal(l.quantity, `The quantity of ${p.name}`);
    if (!quantity) throw invalid(`Enter the quantity of ${p.name}.`);
    const total = l.total !== undefined && l.total !== "" ? francs(l.total, `The total for ${p.name}`) : Math.round(quantity * francs(l.unitCost, `The unit cost of ${p.name}`));
    return { product: p, quantity, total, unitCost: Math.round(total / quantity) };
  });
  const goodsTotal = lines.reduce((s, l) => s + l.total, 0);
  const taxAmount = francs(input.taxAmount, "The VAT on the invoice");
  if (taxAmount && taxAmount >= goodsTotal) throw invalid("The VAT is part of the goods total.");

  // Crates (bar): full in, empties back, deposits.
  const crates = (Array.isArray(input.crates) ? input.crates : []).filter((c) => c?.packagingId && Number(c.quantity));
  const empties = (Array.isArray(input.emptiesReturned) ? input.emptiesReturned : []).filter((c) => c?.packagingId && Number(c.quantity));
  const packIds = [...new Set([...crates, ...empties].map((c) => c.packagingId))];
  const packagings = packIds.length ? await tx.tradePackaging.findMany({ where: { id: { in: packIds }, departmentId: department.id } }) : [];
  if (packagings.length !== packIds.length) throw invalid("A crate is not one of this bar's.");
  const pk = (id) => packagings.find((x) => x.id === id);
  const onCredit = method === "CREDIT";
  const depositIn = onCredit ? 0 : crates.reduce((s, c) => s + Math.round(Number(c.quantity)) * pk(c.packagingId).deposit, 0);
  const depositBack = onCredit ? 0 : empties.reduce((s, c) => s + Math.round(Number(c.quantity)) * pk(c.packagingId).deposit, 0);

  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const domain = getDomain(department.domain);
  const purchase = await tx.tradePurchase.create({
    data: { departmentId: department.id, referenceNo: await nextReference(tx, department.id, DOC_TYPES.TRADE_PURCHASE), supplierName, supplierRef: text(input.supplierRef, 60), date, goodsTotal, depositTotal: depositIn - depositBack, paymentMethod: method, createdById: user.id },
  });
  const what = lines.map((l) => `${l.quantity} × ${l.product.name}`).join(", ").slice(0, 280);
  if (onCredit) {
    const company = await tx.company.findUnique({ where: { id: department.companyId } });
    const bill = await createBillCore(tx, { user, company, department, timeZone }, { supplierName, supplierRef: input.supplierRef, dateKey: toDateKey(date, timeZone), dueKey: input.dueKey || null, lines: [{ category: domain.purchaseCategory, amount: goodsTotal, taxAmount, description: `${purchase.referenceNo}: ${what}` }] }, { extraTransaction: { tradePurchaseId: purchase.id } });
    await tx.tradePurchase.update({ where: { id: purchase.id }, data: { supplierBillId: bill.id } });
  } else {
    const account = await departmentDrawer(tx, { user, departmentId: department.id });
    await createTransaction(tx, { user, department, docType: DOC_TYPES.PURCHASE, data: { type: "PURCHASE", amount: goodsTotal, paymentMethod: method, counterparty: supplierName, reference, description: `${purchase.referenceNo}: ${what}`, category: domain.purchaseCategory, operationCategory: "PURCHASE_STOCK", date, accountId: account.id, taxAmount: taxAmount || null, tradePurchaseId: purchase.id, idempotencyKey: ctx.key } });
    const net = depositIn - depositBack;
    if (net) {
      await createTransaction(tx, { user, department, docType: net > 0 ? DOC_TYPES.BOOKING_REFUND : DOC_TYPES.BOOKING_PAYMENT, data: { type: net > 0 ? "BOOKING_REFUND" : "BOOKING_PAYMENT", amount: Math.abs(net), paymentMethod: method, counterparty: supplierName, reference, description: `${purchase.referenceNo}: crates deposit ${net > 0 ? "paid" : "refunded"}`, category: net > 0 ? "packaging-deposit-paid" : "packaging-deposit-back", date, accountId: account.id, tradePurchaseId: purchase.id } });
    }
  }
  for (const l of lines) {
    await tx.tradePurchaseLine.create({ data: { purchaseId: purchase.id, productId: l.product.id, quantity: l.quantity, unitCost: l.unitCost, total: l.total } });
    await moveProduct(tx, ctx, l.product, "PURCHASE", l.quantity, { unitCost: l.unitCost, purchaseId: purchase.id, note: `${purchase.referenceNo} from ${supplierName}` });
  }
  for (const c of crates) await tx.packagingMovement.create({ data: { departmentId: department.id, packagingId: c.packagingId, kind: "RECEIVED", quantity: Math.round(Number(c.quantity)), amount: onCredit ? 0 : Math.round(Number(c.quantity)) * pk(c.packagingId).deposit, partyName: supplierName, purchaseId: purchase.id, date, note: purchase.referenceNo, createdById: user.id } });
  for (const c of empties) await tx.packagingMovement.create({ data: { departmentId: department.id, packagingId: c.packagingId, kind: "RETURNED", quantity: Math.round(Number(c.quantity)), amount: onCredit ? 0 : Math.round(Number(c.quantity)) * pk(c.packagingId).deposit, partyName: supplierName, purchaseId: purchase.id, date, note: purchase.referenceNo, createdById: user.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: "GOODS_PURCHASED", entityType: "TradePurchase", entityId: purchase.id, after: { referenceNo: purchase.referenceNo, supplierName, goodsTotal, deposits: depositIn - depositBack, method } });
  return { purchaseId: purchase.id, referenceNo: purchase.referenceNo, goodsTotal, depositTotal: depositIn - depositBack };
}

/** A purchase recorded by mistake: its goods leave the stock again, its money records are voided. */
export async function voidTradePurchase(tx, ctx, input) {
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Give a reason for voiding.");
  const p = await tx.tradePurchase.findFirst({ where: { id: input.purchaseId || "-", departmentId: ctx.department.id }, include: { lines: true, records: true } });
  if (!p) throw notFound("Purchase not found.");
  if (p.status === "VOIDED") throw conflict("This purchase is already voided.");
  if (p.supplierBillId) {
    const bill = await tx.supplierBill.findUnique({ where: { id: p.supplierBillId } });
    if (bill.paid > 0) throw conflict(`Part of the bill ${bill.referenceNo} was paid: void the payments first.`);
    await tx.supplierBill.update({ where: { id: bill.id }, data: { status: "VOIDED", voidReason: `Purchase ${p.referenceNo} voided: ${reason}` } });
  }
  await lockProducts(tx, p.lines.map((l) => l.productId));
  for (const l of p.lines) {
    const product = await tx.tradeProduct.findUnique({ where: { id: l.productId } });
    if (qty(product.quantity) < qty(l.quantity)) throw conflict(`${product.name}: ${qty(l.quantity)} were bought but only ${qty(product.quantity)} are left (some were sold). Count the stock instead.`);
    await moveProduct(tx, ctx, product, "PURCHASE_VOID", -l.quantity, { unitCost: l.unitCost, purchaseId: p.id, note: `Void of ${p.referenceNo}: ${reason}` });
  }
  for (const t of p.records.filter((r) => r.status !== "VOIDED")) await voidTransaction(tx, { user: ctx.user, role: ctx.role, transactionId: t.id, reason: `Purchase ${p.referenceNo} voided: ${reason}`, timeZone: ctx.timeZone, fromPurchase: true });
  await tx.packagingMovement.updateMany({ where: { purchaseId: p.id, voidedAt: null }, data: { voidedAt: new Date() } });
  await tx.tradePurchase.update({ where: { id: p.id }, data: { status: "VOIDED", voidReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "GOODS_PURCHASE_VOIDED", entityType: "TradePurchase", entityId: p.id, after: { reason } });
  return { purchaseId: p.id };
}
