/**
 * Builders of the operations the shop, bar, pressing, car wash and jobs forms record (kind, input
 * sent to the server, a summary shown on this device until it is sent: lib/offline). Pure.
 */
import { formatMoney } from "@/lib/format";

const spec = (kind, label, departmentId, input, summary, files) => ({ kind, label, departmentId, input: { departmentId, ...input }, meta: { summary }, ...(files?.length ? { files } : {}) });
const items = (lines) => lines.map((l) => `${l.quantity} × ${l.name}`).join(", ");

// Products, stock, sales, tabs
export const productSpec = (d, input) => spec("trade.product.save", "Product", d, input, input.id ? `${input.name} changed` : `${input.name} added`);
export const productArchiveSpec = (d, p, restore = false) => spec("trade.product.archive", restore ? "Product back on sale" : "Product archived", d, { productId: p.id, restore }, `${p.name} ${restore ? "back on sale" : "archived"}`);
export const stockAdjustSpec = (d, p, input) => spec("trade.stock.adjust", input.kind === "LOSS" ? "Goods lost" : "Stock counted", d, { productId: p.id, ...input }, input.kind === "LOSS" ? `${input.quantity} ${p.unit} of ${p.name} lost` : `${p.name} counted: ${input.counted}`);
export const saleSpec = (d, input, lines, total) => spec("trade.sale.record", "Sale", d, input, `${items(lines)} · ${formatMoney(total)}${input.paymentMethod === "CREDIT" ? " on credit" : ""}`);
export const tabOpenSpec = (d, input) => spec("trade.tab.open", "Tab opened", d, input, `Tab ${input.label}`);
export const tabAddSpec = (d, tab, lines) => spec("trade.tab.add", "Round served", d, { tabId: tab.id, lines: lines.map((l) => ({ productId: l.productId, quantity: l.quantity, unitPrice: l.unitPrice })) }, `${tab.label}: ${items(lines)}`);
export const tabRemoveSpec = (d, line, reason) => spec("trade.tab.remove", "Line taken off", d, { lineId: line.id, reason }, `${line.quantity} × ${line.name} taken off`);
export const tabCloseSpec = (d, tab, input) => spec("trade.tab.close", "Tab paid", d, { tabId: tab.id, ...input }, `${tab.label} · ${formatMoney(tab.total - (Number(input.discount) || 0))}`);
export const tabCancelSpec = (d, tab, reason) => spec("trade.tab.cancel", "Tab cancelled", d, { tabId: tab.id, reason }, `${tab.label} cancelled`);

// Purchases, bills, crates
export const purchaseSpec = (d, input, total) => spec("trade.purchase.record", "Purchase", d, input, `${input.supplierName} · ${formatMoney(total)}${input.paymentMethod === "CREDIT" ? " on credit" : ""}`);
export const purchaseVoidSpec = (d, p, reason) => spec("trade.purchase.void", "Purchase voided", d, { purchaseId: p.id, reason }, `${p.referenceNo} voided`);
export const billPaySpec = (d, bill, input) => spec("trade.bill.pay", "Supplier paid", d, { billId: bill.id, ...input }, `${bill.supplier} · ${formatMoney(input.amount)}`);
export const packagingSpec = (d, input) => spec("trade.packaging.save", "Crate", d, input, input.name);
export const packagingMoveSpec = (d, crate, input, label) => spec("trade.packaging.move", "Crates", d, { packagingId: crate.id, ...input }, `${label}: ${input.quantity ?? input.counted} × ${crate.name}`);

// Job tickets
export const ticketSpec = (d, input, total) => spec("services.ticket.create", "Ticket", d, input, `${input.vehiclePlate || input.client?.name || input.customerName || "Walk-in"} · ${formatMoney(total)}`);
export const ticketUpdateSpec = (d, t, input) => spec("services.ticket.update", "Ticket changed", d, { ticketId: t.id, ...input }, `${t.referenceNo} changed`);
export const ticketStepSpec = (d, t, step, input = {}) => spec("services.ticket.step", "Ticket updated", d, { ticketId: t.id, step, ...input }, `${t.referenceNo}: ${step}`);
export const ticketCancelSpec = (d, t, input) => spec("services.ticket.cancel", "Ticket cancelled", d, { ticketId: t.id, ...input }, `${t.referenceNo} cancelled`);
export const ticketPaymentSpec = (d, t, input) => spec("services.payment.record", "Payment", d, { ticketId: t.id, ...input }, `${t.referenceNo} · ${formatMoney(input.amount)}`);
export const ticketRefundSpec = (d, t, input) => spec("services.refund.record", "Refund", d, { ticketId: t.id, ...input }, `${t.referenceNo} · refund ${formatMoney(input.amount)}`);
export const ticketCompensateSpec = (d, t, input) => spec("services.ticket.compensate", "Compensation", d, { ticketId: t.id, ...input }, `${t.referenceNo} · compensation ${formatMoney(input.amount)}`);
export const ticketNotifiedSpec = (d, t) => spec("services.ticket.notified", "Customer told", d, { ticketId: t.id }, `${t.referenceNo}: customer told`);
export const serviceItemSpec = (d, input) => spec("services.item.save", "Price list", d, input, input.name);
export const serviceArchiveSpec = (d, item, restore = false) => spec("services.item.archive", restore ? "Service restored" : "Service archived", d, { itemId: item.id, restore }, `${item.name} ${restore ? "restored" : "archived"}`);
export const serviceSettingsSpec = (d, input) => spec("services.settings.save", "Price list options", d, input, "Price list options");
export const workerSpec = (d, input) => spec("services.worker.save", "Washer", d, input, input.name);
export const workerPaySpec = (d, w, input) => spec("services.worker.pay", "Washer paid", d, { workerId: w.id, ...input }, `${w.name} · ${formatMoney(input.amount)}`);

// Shared
export const tradeProfileSpec = (d, input, files) => spec("trade.profile.save", "Business details", d, input, "Business details", files);
