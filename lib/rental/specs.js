/**
 * Builders of the event rental operations the forms record (kind, input sent to the server, a
 * summary shown on this device until it is sent: lib/offline). Pure functions.
 */
const spec = (kind, label, departmentId, input, summary, files) => ({ kind, label, departmentId, input: { departmentId, ...input }, meta: { summary }, ...(files?.length ? { files } : {}) });

export const itemSaveSpec = (departmentId, input, files) => spec("rental.item.save", "Stock item", departmentId, input, input.id ? `${input.name} changed` : `${input.name}${input.openingQuantity ? ` × ${input.openingQuantity}` : ""}`, files);
export const itemAdjustSpec = (departmentId, item, input) => spec("rental.item.adjust", "Stock corrected", departmentId, { itemId: item.id, ...input }, input.kind === "transfer" ? `${item.name} → ${input.toLocation}` : `${item.name}: counted ${input.counted}`);
export const itemArchiveSpec = (departmentId, item, input) => spec("rental.item.archive", input.restore ? "Stock item restored" : "Stock item archived", departmentId, { itemId: item.id, ...input }, `${item.name} ${input.restore ? "restored" : "archived"}`);

export const clientSaveSpec = (departmentId, input) => spec("rental.client.save", "Customer", departmentId, input, input.id ? `${input.name} changed` : input.name);
export const orderCreateSpec = (departmentId, input, summary) => spec("rental.order.create", "Booking", departmentId, input, summary);
export const orderUpdateSpec = (departmentId, order, input) => spec("rental.order.update", "Booking changed", departmentId, { orderId: order.id, ...input }, `${order.referenceNo} changed`);
export const orderStepSpec = (departmentId, order, step, extra = {}) => spec("rental.order.step", "Booking updated", departmentId, { orderId: order.id, step, ...extra }, `${order.referenceNo}: ${step}`);
export const orderCancelSpec = (departmentId, order, reason) => spec("rental.order.cancel", "Booking cancelled", departmentId, { orderId: order.id, reason }, `${order.referenceNo} cancelled`);

export const dispatchSpec = (departmentId, order, input) => spec("rental.order.dispatch", "Items dispatched", departmentId, { orderId: order.id, ...input }, `${order.referenceNo}: items out`);
export const returnSpec = (departmentId, order, input) => spec("rental.order.return", "Items returned", departmentId, { orderId: order.id, ...input }, `${order.referenceNo}: items back`);
export const incidentReportSpec = (departmentId, item, input, files) => spec("rental.incident.report", "Damage reported", departmentId, { itemId: item.id, ...input }, `${input.quantity} × ${item.name} ${String(input.kind).toLowerCase()}`, files);
export const incidentSettleSpec = (departmentId, incident, input) => spec("rental.incident.settle", "Damage settled", departmentId, { incidentId: incident.id, ...input }, `${incident.referenceNo}: ${input.decision}`);
export const repairCompleteSpec = (departmentId, incident, input, files) => spec("rental.repair.complete", "Repair done", departmentId, { incidentId: incident.id, ...input }, `${incident.referenceNo} repaired`, files);
export const chargeAddSpec = (departmentId, order, input) => spec("rental.charge.add", "Charge added", departmentId, { orderId: order.id, ...input }, `${order.referenceNo}: ${input.label || input.kind}`);
export const chargeVoidSpec = (departmentId, charge, reason) => spec("rental.charge.void", "Charge voided", departmentId, { chargeId: charge.id, reason }, `${charge.referenceNo} voided`);

export const paymentSpec = (departmentId, order, input, files) => spec("rental.payment.record", "Payment", departmentId, { orderId: order.id, ...input }, `${input.amount} FCFA for ${order.referenceNo}`, files);
export const refundSpec = (departmentId, order, input) => spec("rental.refund.record", "Refund", departmentId, { orderId: order.id, ...input }, `Refund ${input.amount} FCFA for ${order.referenceNo}`);
export const profileSpec = (departmentId, input, files) => spec("rental.profile.save", "Business details", departmentId, input, "Business details", files);

export const purchaseSpec = (departmentId, input, files, summary) => spec("rental.purchase.record", "Purchase", departmentId, input, summary, files);
export const purchaseVoidSpec = (departmentId, purchase, reason) => spec("rental.purchase.void", "Purchase voided", departmentId, { purchaseId: purchase.id, reason }, `${purchase.referenceNo} voided`);
export const assetSaveSpec = (departmentId, input) => spec("rental.asset.save", "Asset", departmentId, input, input.id ? `${input.name} changed` : input.name);
export const assetDisposeSpec = (departmentId, asset, input) => spec("rental.asset.dispose", "Asset disposed of", departmentId, { assetId: asset.id, ...input }, `${asset.code} disposed of`);

/** An expense (or other income) of the department: category, description, payee, who spent it, its event. */
export function rentalMoneySpec(departmentId, { type, amount, category, categoryLabel, paymentMethod = "CASH", counterparty, reference, description, rentalOrderId, orderLabel, spentByName, authorizedByName }, files) {
  return spec(
    "money.record",
    type === "OTHER_INCOME" ? "Other income" : "Expense",
    departmentId,
    { type, amount: Number(amount), category, paymentMethod, counterparty, reference, description, rentalOrderId: rentalOrderId || null, spentByName, authorizedByName },
    `${categoryLabel || category} · ${amount} FCFA${orderLabel ? ` · ${orderLabel}` : ""}`,
    files
  );
}

export const expenseApproveSpec = (departmentId, row, note) => spec("expense.validate", "Expense approved", departmentId, { transactionId: row.id, note }, `${row.referenceNo} approved`);
