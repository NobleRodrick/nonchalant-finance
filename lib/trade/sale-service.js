/**
 * Sales of a shop, bar or other activity: a cart of products (found by name or barcode), a discount
 * (with the right), paid by cash, Mobile Money, bank or other, or on credit (a debt of the customer,
 * repaid from "Customers on credit"). The sale is a SALE money record; its lines keep the price and
 * the cost of each product; goods leave the stock at once (never below zero). Bar tabs close into
 * one sale (lib/trade/tab-service.js).
 */
import { recordAudit } from "@/lib/audit";
import { forbidden, invalid } from "@/lib/errors";
import { permits, PERMISSIONS, roleHasPermission } from "@/lib/permissions";
import { grantsIn } from "@/lib/access";
import { assertCanPost } from "@/lib/posting-guard";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { SALE_METHODS, createTransaction, departmentDrawer, resolveDebtor } from "@/lib/finance/posting-service";
import { debtStatus } from "@/lib/finance/money-math";
import { getDomain } from "@/lib/domains/registry";
import { formatMoney } from "@/lib/format";
import { text } from "@/lib/property/input";
import { lockProducts, moveProduct } from "./product-service";
import { cartTotals, qty } from "./stock-math";

const SALE_METHODS_ALL = [...SALE_METHODS, "OTHER"];

/** A discount needs the right to change prices, or stays within the department's cashier limit. */
export function checkDiscount(ctx, discount, reason) {
  if (!discount) return;
  if (!text(reason)) throw invalid("Give a reason for the discount.");
  const full = permits(ctx.role, PERMISSIONS.SALES_DISCOUNT, grantsIn(ctx.user, ctx.department.id)) && permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(ctx.user, ctx.department.id));
  const limit = Number(ctx.department.cashierDiscountLimit || 0);
  if (!full && !(roleHasPermission(ctx.role, PERMISSIONS.SALES_DISCOUNT_LIMITED) && discount <= limit)) {
    throw forbidden(limit > 0 ? `You can give at most ${formatMoney(limit)} of discount per sale.` : "Your rights do not include giving discounts.");
  }
}

/**
 * Reads the cart: [{ productId | barcode, quantity, unitPrice? }]. A price other than the list
 * price needs the right to change prices. Returns lines with their (locked) product.
 */
export async function readCart(tx, ctx, rawLines) {
  const lines = (Array.isArray(rawLines) ? rawLines : []).filter((l) => l && (l.productId || l.barcode) && Number(l.quantity));
  if (!lines.length) throw invalid("Add at least one product.");
  if (lines.length > 200) throw invalid("At most 200 lines in one sale.");
  const byBarcode = lines.filter((l) => !l.productId).map((l) => String(l.barcode));
  const found = byBarcode.length ? await tx.tradeProduct.findMany({ where: { departmentId: ctx.department.id, barcode: { in: byBarcode } }, select: { id: true, barcode: true } }) : [];
  const ids = lines.map((l) => l.productId || found.find((f) => f.barcode === String(l.barcode))?.id);
  if (ids.some((id) => !id)) throw invalid("A barcode of the cart is not a product of this department.");
  await lockProducts(tx, ids);
  const products = await tx.tradeProduct.findMany({ where: { id: { in: ids }, departmentId: ctx.department.id } });
  const canPrice = permits(ctx.role, PERMISSIONS.PRICES_CHANGE, grantsIn(ctx.user, ctx.department.id));
  // The same product twice is one line.
  const merged = new Map();
  lines.forEach((l, i) => {
    const p = products.find((x) => x.id === ids[i]);
    if (!p) throw invalid("A product of the cart is not in this department.");
    if (!p.isActive) throw invalid(`${p.name} is no longer sold.`);
    const q = qty(l.quantity);
    if (q <= 0) throw invalid(`The quantity of ${p.name} must be more than 0.`);
    const price = l.unitPrice === undefined || l.unitPrice === null || l.unitPrice === "" ? p.salePrice : Math.round(Number(l.unitPrice));
    if (!Number.isInteger(price) || price < 0) throw invalid(`The price of ${p.name} is not valid.`);
    if (price !== p.salePrice && !canPrice) throw forbidden(`Your rights do not include changing the price of ${p.name} (${formatMoney(p.salePrice)}).`);
    const key = `${p.id}:${price}`;
    const prev = merged.get(key);
    merged.set(key, { product: p, productId: p.id, name: p.name, quantity: qty((prev?.quantity || 0) + q), unitPrice: price });
  });
  return [...merged.values()];
}

/**
 * Posts the sale record of priced lines (stock already moved, or moved here when `moveStock`).
 * Returns { transaction, debt, totals }.
 */
export async function postTradeSale(tx, ctx, { lines, discount = 0, discountReason, paymentMethod = "CASH", reference, debtor, debtorId, customerName, description, moveStock = true, extraTransaction = {} }) {
  const { user, department, timeZone } = ctx;
  if (!SALE_METHODS_ALL.includes(paymentMethod)) throw invalid("Choose how the customer paid.");
  const date = ctx.date || ctx.now;
  await assertCanPost(tx, { organizationId: user.organizationId, departmentId: department.id, date, timeZone });
  const totals = cartTotals(lines, discount);
  if (discount && totals.discount !== Math.round(Number(discount))) throw invalid("The discount cannot be more than the sale.");
  checkDiscount(ctx, totals.discount, discountReason);
  const reference2 = text(reference, 80);
  if (["MOMO", "BANK_TRANSFER", "OTHER"].includes(paymentMethod) && !reference2) throw invalid("Enter the transaction reference (Mobile Money id, bank slip, card slip …).");
  const debtorRow = paymentMethod === "CREDIT" ? await resolveDebtor(tx, { user, department, debtorId, debtor }) : null;
  const account = paymentMethod === "CREDIT" ? null : await departmentDrawer(tx, { user, departmentId: department.id });
  const domain = getDomain(department.domain);
  const what = description || totals.lines.map((l) => `${l.quantity} × ${l.name}`).join(", ");
  const transaction = await createTransaction(tx, {
    user,
    department,
    docType: DOC_TYPES.SALE,
    data: {
      type: "SALE",
      amount: totals.net,
      grossAmount: totals.gross,
      discountAmount: totals.discount,
      netAmount: totals.net,
      paymentMethod,
      customerName: debtorRow?.name || text(customerName, 120),
      reference: reference2,
      operationCategory: department.domain === "BAR" ? "SALE_DRINK" : "SALE_SERVICES",
      category: domain.saleCategory || "sale-other",
      description: (totals.discount ? `${what} (discount: ${text(discountReason)})` : what).slice(0, 300),
      date,
      accountId: account?.id || null,
      idempotencyKey: ctx.key,
      ...extraTransaction,
    },
  });
  for (const l of totals.lines) {
    if (moveStock) await moveProduct(tx, ctx, l.product, "SALE", -l.quantity, { transactionId: transaction.id, note: `Sale ${transaction.referenceNo}` });
    await tx.tradeSaleLine.create({ data: { transactionId: transaction.id, departmentId: department.id, productId: l.productId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, total: l.total, discount: l.discount, unitCost: l.product.kind === "SERVICE" ? 0 : l.unitCost ?? l.product.costPrice } });
  }
  let debt = null;
  if (debtorRow) {
    debt = await tx.debt.create({
      data: {
        source: "CREDIT_SALE",
        referenceNo: await nextReference(tx, department.id, DOC_TYPES.DEBT),
        debtorId: debtorRow.id,
        debtorName: debtorRow.name,
        debtorContact: debtorRow.phone,
        foodDescription: what.slice(0, 300),
        amountOwed: totals.net,
        amountPaid: 0,
        status: debtStatus(totals.net, 0).status,
        date,
        transactionId: transaction.id,
        organizationId: user.organizationId,
        departmentId: department.id,
        userId: user.id,
      },
    });
  }
  await recordAudit(tx, { user, departmentId: department.id, action: "SALE_RECORDED", entityType: "Transaction", entityId: transaction.id, after: { referenceNo: transaction.referenceNo, gross: totals.gross, discount: totals.discount, net: totals.net, paymentMethod, lines: totals.lines.map((l) => ({ product: l.name, quantity: l.quantity, unitPrice: l.unitPrice })), debt: debt?.referenceNo } });
  return { transaction, debt, totals };
}

/** A sale at the counter. `tendered` (cash given) returns the change. */
export async function recordTradeSale(tx, ctx, input) {
  const lines = await readCart(tx, ctx, input.lines);
  const r = await postTradeSale(tx, ctx, {
    lines,
    discount: Number(input.discount) || 0,
    discountReason: input.discountReason,
    paymentMethod: input.paymentMethod || "CASH",
    reference: input.reference,
    debtor: input.debtor,
    debtorId: input.debtorId,
    customerName: input.customerName,
  });
  const tendered = Math.round(Number(input.tendered) || 0);
  return { transactionId: r.transaction.id, referenceNo: r.transaction.referenceNo, total: r.totals.net, debtId: r.debt?.id || null, change: tendered > r.totals.net ? tendered - r.totals.net : 0 };
}
