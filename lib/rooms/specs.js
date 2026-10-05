/**
 * Builders of the rooms operations the forms record (kind, input sent to the server, a summary
 * shown on this device until it is sent: lib/offline). Pure functions.
 */
import { formatMoney } from "@/lib/format";

const spec = (kind, label, departmentId, input, summary) => ({ kind, label, departmentId, input: { departmentId, ...input }, meta: { summary } });

export const roomSpec = (departmentId, input) => spec("rooms.room.save", "Apartment", departmentId, input, input.name);
export const roomStateSpec = (departmentId, room, state, note) => spec("rooms.room.state", "Apartment state", departmentId, { roomId: room.id, state, note }, `${room.name}: ${state.toLowerCase()}`);
export const stayCreateSpec = (departmentId, input, roomName) => spec("rooms.stay.create", "Booking", departmentId, input, `${roomName} · ${input.guestName} · ${input.checkInKey} → ${input.checkOutKey}`);
export const stayUpdateSpec = (departmentId, stay, input) => spec("rooms.stay.update", "Booking changed", departmentId, { stayId: stay.id, ...input }, `${stay.referenceNo} changed`);
export const stayStepSpec = (departmentId, stay, step, extra = {}) => spec("rooms.stay.step", "Booking updated", departmentId, { stayId: stay.id, step, ...extra }, `${stay.referenceNo}: ${step}`);
export const stayCancelSpec = (departmentId, stay, reason) => spec("rooms.stay.cancel", "Booking cancelled", departmentId, { stayId: stay.id, reason }, `${stay.referenceNo} cancelled`);
export const stayPaymentSpec = (departmentId, stay, input) => spec("rooms.payment.record", "Payment", departmentId, { stayId: stay.id, ...input }, `${formatMoney(input.amount)} for ${stay.referenceNo}`);
export const stayRefundSpec = (departmentId, stay, input) => spec("rooms.refund.record", "Refund", departmentId, { stayId: stay.id, ...input }, `Refund ${formatMoney(input.amount)} for ${stay.referenceNo}`);

/** An expense (or other income) of the guest house: its apartment or shared, vendor, who authorized it. */
export function stayMoneySpec(departmentId, { type, amount, category, categoryLabel, paymentMethod = "CASH", counterparty, reference, description, roomId, roomName, authorizedByName }) {
  return spec(
    "money.record",
    type === "OTHER_INCOME" ? "Other income" : "Expense",
    departmentId,
    { type, amount: Number(amount), category, paymentMethod, counterparty, reference, description, roomId: roomId || null, authorizedByName },
    `${roomName || "Shared"} · ${categoryLabel || category} · ${formatMoney(amount)}`
  );
}

export const expenseValidateSpec = (departmentId, row, note) => spec("rooms.expense.validate", "Expense validated", departmentId, { transactionId: row.id, note }, `${row.referenceNo} validated`);
export const stayCashCountSpec = (departmentId, countedCash, notes) => spec("rooms.cash.count", "Cash count", departmentId, { countedCash, notes }, `Counted ${formatMoney(countedCash)}`);

export const assetAddSpec = (departmentId, input, roomName) => spec("rooms.asset.add", "Assets added", departmentId, input, `${input.quantity} × ${input.name} · ${roomName || "storage"}`);
export const assetMoveSpec = (departmentId, asset, input) => spec("rooms.asset.move", "Asset movement", departmentId, { assetId: asset.id, ...input }, `${input.quantity} × ${asset.name}: ${input.kind}`);
export const assetEditSpec = (departmentId, asset, input) => spec("rooms.asset.edit", "Asset changed", departmentId, { assetId: asset.id, ...input }, `${asset.name} changed`);

export const repairReportSpec = (departmentId, input, roomName) => spec("rooms.repair.report", "Repair reported", departmentId, input, `${roomName}: ${input.title}`);
export const repairUpdateSpec = (departmentId, repair, input) => spec("rooms.repair.update", "Repair changed", departmentId, { repairId: repair.id, ...input }, `${repair.referenceNo} changed`);
export const repairCompleteSpec = (departmentId, repair, input) => spec("rooms.repair.complete", "Repair done", departmentId, { repairId: repair.id, ...input }, `${repair.referenceNo} done${input.actualCost ? ` · ${formatMoney(input.actualCost)}` : ""}`);
export const repairCancelSpec = (departmentId, repair, reason) => spec("rooms.repair.cancel", "Repair cancelled", departmentId, { repairId: repair.id, reason }, `${repair.referenceNo} cancelled`);
