/**
 * Bar tabs: a table (or a customer) orders drinks as the evening goes; each round leaves the stock
 * when it is served; the tab is paid when it closes (one SALE record with every line). A line
 * served by mistake is taken off with a reason (back in stock); an abandoned tab is cancelled
 * (everything back in stock, with a reason) — never deleted.
 */
import { recordAudit } from "@/lib/audit";
import { conflict, invalid, notFound } from "@/lib/errors";
import { DOC_TYPES, nextReference } from "@/lib/documents/sequence";
import { text } from "@/lib/property/input";
import { lockProducts, moveProduct } from "./product-service";
import { postTradeSale, readCart } from "./sale-service";

async function tabOf(tx, department, tabId) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`trade-tab:${tabId || "-"}`}))`;
  const tab = await tx.tradeTab.findFirst({ where: { id: tabId || "-", departmentId: department.id }, include: { lines: { where: { voidedAt: null } } } });
  if (!tab) throw notFound("Tab not found in this department.");
  return tab;
}

/** Opens a tab for a table or a customer (with its first round when given). */
export async function openTab(tx, ctx, input) {
  const label = text(input.label, 60);
  if (!label) throw invalid("Name the tab: a table number or the customer's name.");
  const open = await tx.tradeTab.findFirst({ where: { departmentId: ctx.department.id, status: "OPEN", label: { equals: label, mode: "insensitive" } }, select: { referenceNo: true } });
  if (open) throw conflict(`"${label}" already has an open tab (${open.referenceNo}).`);
  const tab = await tx.tradeTab.create({ data: { departmentId: ctx.department.id, referenceNo: await nextReference(tx, ctx.department.id, DOC_TYPES.TAB), label, openedById: ctx.user.id, openedAt: ctx.date || ctx.now } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "TAB_OPENED", entityType: "TradeTab", entityId: tab.id, after: { referenceNo: tab.referenceNo, label } });
  const round = Array.isArray(input.lines) && input.lines.length ? await addToTab(tx, ctx, { tabId: tab.id, lines: input.lines }) : null;
  return { tabId: tab.id, referenceNo: tab.referenceNo, total: round?.total || 0 };
}

/** A round served: the drinks leave the stock now. */
export async function addToTab(tx, ctx, input) {
  const tab = await tabOf(tx, ctx.department, input.tabId);
  if (tab.status !== "OPEN") throw conflict(`${tab.referenceNo} is ${tab.status.toLowerCase()}.`);
  const lines = await readCart(tx, ctx, input.lines);
  for (const l of lines) {
    const line = await tx.tradeTabLine.create({ data: { tabId: tab.id, productId: l.productId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, total: Math.round(l.quantity * l.unitPrice), addedById: ctx.user.id, addedAt: ctx.date || ctx.now } });
    await moveProduct(tx, ctx, l.product, "SALE", -l.quantity, { tabLineId: line.id, note: `Tab ${tab.referenceNo} (${tab.label})` });
  }
  const total = (await tx.tradeTabLine.aggregate({ where: { tabId: tab.id, voidedAt: null }, _sum: { total: true } }))._sum.total || 0;
  await tx.tradeTab.update({ where: { id: tab.id }, data: { updatedAt: new Date() } });
  return { tabId: tab.id, total };
}

/** A line served by mistake: back in stock, with a reason. */
export async function removeTabLine(tx, ctx, input) {
  const line = await tx.tradeTabLine.findFirst({ where: { id: input.lineId || "-", tab: { departmentId: ctx.department.id } }, include: { tab: true } });
  if (!line) throw notFound("Line not found.");
  await tabOf(tx, ctx.department, line.tabId);
  if (line.tab.status !== "OPEN") throw conflict("This tab is closed.");
  if (line.voidedAt) throw conflict("This line was already taken off.");
  const reason = text(input.reason, 200);
  if (!reason) throw invalid("Say why the line is taken off.");
  await lockProducts(tx, [line.productId]);
  const product = await tx.tradeProduct.findUnique({ where: { id: line.productId } });
  const served = await tx.tradeMovement.findFirst({ where: { tabLineId: line.id, kind: "SALE" } });
  if (product.kind !== "SERVICE") await moveProduct(tx, ctx, product, "RETURN", line.quantity, { unitCost: served?.unitCost ?? product.costPrice, tabLineId: line.id, note: `Taken off tab ${line.tab.referenceNo}: ${reason}` });
  await tx.tradeTabLine.update({ where: { id: line.id }, data: { voidedAt: new Date(), voidReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "TAB_LINE_REMOVED", entityType: "TradeTab", entityId: line.tabId, after: { product: line.name, quantity: line.quantity, reason } });
  return { tabId: line.tabId };
}

/** The tab is paid (or put on the customer's credit): one sale with every line served. */
export async function closeTab(tx, ctx, input) {
  const tab = await tabOf(tx, ctx.department, input.tabId);
  if (tab.status !== "OPEN") throw conflict(`${tab.referenceNo} is already ${tab.status.toLowerCase()}.`);
  if (!tab.lines.length) throw invalid("Nothing was served on this tab: cancel it instead.");
  const products = await tx.tradeProduct.findMany({ where: { id: { in: [...new Set(tab.lines.map((l) => l.productId))] } } });
  const served = await tx.tradeMovement.findMany({ where: { tabLineId: { in: tab.lines.map((l) => l.id) }, kind: "SALE" }, select: { tabLineId: true, unitCost: true } });
  const lines = tab.lines.map((l) => ({ product: products.find((p) => p.id === l.productId), productId: l.productId, name: l.name, quantity: l.quantity, unitPrice: l.unitPrice, unitCost: served.find((m) => m.tabLineId === l.id)?.unitCost ?? 0 }));
  const r = await postTradeSale(tx, ctx, {
    lines,
    moveStock: false,
    discount: Number(input.discount) || 0,
    discountReason: input.discountReason,
    paymentMethod: input.paymentMethod || "CASH",
    reference: input.reference,
    debtor: input.debtor,
    debtorId: input.debtorId,
    customerName: input.customerName,
    description: `Tab ${tab.referenceNo} (${tab.label}): ${lines.map((l) => `${l.quantity} × ${l.name}`).join(", ")}`,
  });
  await tx.tradeMovement.updateMany({ where: { tabLineId: { in: tab.lines.map((l) => l.id) }, transactionId: null }, data: { transactionId: r.transaction.id } });
  await tx.tradeTab.update({ where: { id: tab.id }, data: { status: "CLOSED", closedAt: ctx.date || ctx.now, transactionId: r.transaction.id } });
  const tendered = Math.round(Number(input.tendered) || 0);
  return { tabId: tab.id, transactionId: r.transaction.id, referenceNo: r.transaction.referenceNo, total: r.totals.net, change: tendered > r.totals.net ? tendered - r.totals.net : 0 };
}

/** An abandoned tab: everything served goes back in stock (a reason is required). */
export async function cancelTab(tx, ctx, input) {
  const tab = await tabOf(tx, ctx.department, input.tabId);
  if (tab.status !== "OPEN") throw conflict(`${tab.referenceNo} is already ${tab.status.toLowerCase()}.`);
  const reason = text(input.reason, 300);
  if (!reason) throw invalid("Say why the tab is cancelled.");
  for (const l of tab.lines) await removeTabLine(tx, ctx, { lineId: l.id, reason: `Tab cancelled: ${reason}` });
  await tx.tradeTab.update({ where: { id: tab.id }, data: { status: "CANCELLED", closedAt: ctx.date || ctx.now, cancelReason: reason } });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "TAB_CANCELLED", entityType: "TradeTab", entityId: tab.id, after: { reason } });
  return { tabId: tab.id };
}
