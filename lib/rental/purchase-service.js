/**
 * Purchases of items and materials (docs/EVENT_RENTAL_PLAN.md): each line adds its units to a
 * stock line (an existing one, or a new one created with the purchase) and updates the line's
 * purchase price, supplier and date. Paid from the drawer (or by Mobile Money / bank), the purchase
 * is an investment (cash out, not an expense of the income statement). A line may also register
 * the units in the asset register, to depreciate them.
 */
import { recordAudit } from "@/lib/audit";
import { invalid } from "@/lib/errors";
import { linkAttachments } from "@/lib/attachments";
import { DOC_TYPES } from "@/lib/documents/sequence";
import { isDateKey } from "@/lib/timezone";
import { dbDate } from "@/lib/venue/dates";
import { postMoneyEntry, voidTransaction } from "@/lib/finance/posting-service";
import { saveAsset } from "@/lib/assets/asset-service";
import { CONDITION_LABELS } from "./stock-math";
import { itemOf, lockItems, moveStock, saveItem } from "./item-service";

const text = (v, max = 300) => String(v ?? "").trim().slice(0, max) || null;

function whole(value, label, min = 0) {
  const n = Number(value);
  if (!Number.isInteger(n) || n < min) throw invalid(`${label} must be a whole number${min ? ` of at least ${min}` : " (0 or more)"}.`);
  return n;
}

/**
 * A purchase: supplier, date, how it was paid, reference, receipt, who bought it, lines
 * [{ itemId | newItem: { name, category, rentalPrice }, quantity, unitCost, condition, asset:
 * { usefulLifeMonths, method, salvageValue } }].
 */
export async function recordPurchase(tx, ctx, input) {
  const raw = Array.isArray(input?.lines) ? input.lines.filter(Boolean) : [];
  if (!raw.length) throw invalid("Add at least one item bought.");
  if (raw.length > 50) throw invalid("At most 50 lines per purchase.");
  const supplier = text(input.supplier, 120);
  if (!supplier) throw invalid("Enter the supplier.");
  const dateKey = input.dateKey && isDateKey(input.dateKey) ? input.dateKey : null;
  const lines = raw.map((l, i) => ({ ...l, quantity: whole(l.quantity, `Line ${i + 1}: the quantity`, 1), unitCost: whole(l.unitCost, `Line ${i + 1}: the unit cost`) }));
  const total = lines.reduce((s, l) => s + l.quantity * l.unitCost, 0);
  if (!total) throw invalid("The purchase total must be more than 0.");

  // New stock lines first (they get their code), then every line locked in a fixed order.
  for (const l of lines) {
    if (l.itemId) continue;
    if (!l.newItem?.name) throw invalid("Choose the item bought, or name the new one.");
    l.itemId = (await saveItem(tx, ctx, { name: l.newItem.name, category: l.newItem.category, rentalPrice: l.newItem.rentalPrice, purchasePrice: l.unitCost, supplier, location: l.newItem.location })).itemId;
  }
  await lockItems(tx, lines.map((l) => l.itemId));
  const items = [];
  for (const l of lines) items.push(await itemOf(tx, ctx.department, l.itemId, { lock: false }));

  const description = lines.map((l, i) => `${l.quantity} × ${items[i].name}`).join(", ");
  const { transaction } = await postMoneyEntry(tx, {
    ...ctx,
    type: "EXPENSE",
    amount: total,
    category: "rental-stock",
    paymentMethod: input.paymentMethod || "CASH",
    counterparty: supplier,
    reference: input.reference,
    description: `Purchase: ${description}`.slice(0, 300),
    receivedByName: text(input.boughtByName, 80),
    docType: DOC_TYPES.PURCHASE,
    idempotencyKey: ctx.key,
  });
  await linkAttachments(tx, { user: ctx.user, attachmentIds: input.attachmentIds, entityType: "Transaction", entityId: transaction.id, departmentId: ctx.department.id });

  const purchase = await tx.purchase.create({
    data: {
      organizationId: ctx.user.organizationId,
      departmentId: ctx.department.id,
      userId: ctx.user.id,
      supplierName: supplier,
      reference: text(input.reference, 80),
      paymentMethod: input.paymentMethod || "CASH",
      totalAmount: total,
      date: transaction.date,
      notes: text(input.notes, 1000),
      transactionId: transaction.id,
      lines: { create: lines.map((l, i) => ({ description: `${l.quantity} × ${items[i].name}`, rentalItemId: l.itemId, quantity: l.quantity, unitCost: l.unitCost, totalCost: l.quantity * l.unitCost })) },
    },
  });

  const assets = [];
  for (const [i, l] of lines.entries()) {
    const item = items[i];
    await moveStock(tx, ctx, item, "PURCHASED", l.quantity, { purchaseId: purchase.id, value: l.quantity * l.unitCost, note: `${transaction.referenceNo} · ${supplier}` });
    await tx.rentalItem.update({
      where: { id: item.id },
      data: { purchasePrice: l.unitCost, supplier, purchasedOn: dateKey ? dbDate(dateKey) : transaction.date, ...(CONDITION_LABELS[l.condition] ? { condition: l.condition } : {}) },
    });
    if (l.asset?.usefulLifeMonths) {
      const a = await saveAsset(tx, ctx, {
        name: `${item.name} (${l.quantity})`,
        category: item.category,
        rentalItemId: item.id,
        quantity: l.quantity,
        purchaseDateKey: dateKey || transaction.date.toISOString().slice(0, 10),
        cost: l.quantity * l.unitCost,
        supplier,
        usefulLifeMonths: l.asset.usefulLifeMonths,
        method: l.asset.method,
        salvageValue: l.asset.salvageValue || 0,
        condition: l.condition,
        location: item.location,
        responsibleName: text(input.boughtByName, 80),
        purchaseId: purchase.id,
      });
      assets.push(a.code);
    }
  }
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_PURCHASE_RECORDED", entityType: "Purchase", entityId: purchase.id, after: { referenceNo: transaction.referenceNo, supplier, total, lines: description, assets } });
  return { purchaseId: purchase.id, transactionId: transaction.id, referenceNo: transaction.referenceNo, total, assets };
}

/**
 * Voids a purchase recorded by mistake (reason required): its units leave the stock again (they
 * must still be in the store), its money record is voided, assets it registered are closed at
 * their purchase date (never depreciated).
 */
export async function voidPurchase(tx, ctx, input) {
  const purchase = await tx.purchase.findFirst({ where: { id: input?.purchaseId || "-", departmentId: ctx.department.id }, include: { lines: true, transaction: true } });
  if (!purchase) throw invalid("Purchase not found.");
  if (purchase.status === "VOIDED") throw invalid("This purchase is already void.");
  const reason = text(input.reason, 300);
  if (!reason || reason.length < 3) throw invalid("Give the reason (at least 3 characters).");
  const lines = purchase.lines.filter((l) => l.rentalItemId);
  await lockItems(tx, lines.map((l) => l.rentalItemId));
  for (const l of lines) {
    const item = await itemOf(tx, ctx.department, l.rentalItemId, { lock: false });
    await moveStock(tx, ctx, item, "ADJUSTED", -Number(l.quantity), { purchaseId: purchase.id, value: Number(l.totalCost), note: `Purchase ${purchase.transaction?.referenceNo || ""} voided: ${reason}` });
  }
  await tx.purchase.update({ where: { id: purchase.id }, data: { status: "VOIDED" } });
  if (purchase.transaction && purchase.transaction.status !== "VOIDED") {
    await voidTransaction(tx, { user: ctx.user, role: ctx.role, transactionId: purchase.transaction.id, reason, timeZone: ctx.timeZone, fromPurchase: true });
  }
  await tx.fixedAsset.updateMany({ where: { purchaseId: purchase.id, disposedOn: null }, data: { disposedOn: purchase.date, disposalReason: `Purchase voided: ${reason}`, disposalValue: 0 } });
  // A closed asset keeps its cost as "money received" so that no gain or loss appears.
  const closed = await tx.fixedAsset.findMany({ where: { purchaseId: purchase.id }, select: { id: true, cost: true } });
  for (const a of closed) await tx.fixedAsset.update({ where: { id: a.id }, data: { disposalValue: a.cost } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "RENTAL_PURCHASE_VOIDED", entityType: "Purchase", entityId: purchase.id, after: { referenceNo: purchase.transaction?.referenceNo, reason } });
  return { purchaseId: purchase.id, referenceNo: purchase.transaction?.referenceNo };
}
