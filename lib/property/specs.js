/**
 * Builders of the property rental operations the forms record (kind, input sent to the server, a
 * summary shown on this device until it is sent: lib/offline). Pure functions.
 */
import { formatMoney } from "@/lib/format";

const spec = (kind, label, departmentId, input, summary, files) => ({ kind, label, departmentId, input: { departmentId, ...input }, meta: { summary }, ...(files?.length ? { files } : {}) });

export const buildingSpec = (departmentId, input) => spec("property.building.save", "Building", departmentId, input, input.id ? `${input.name} changed` : input.name);
export const unitSaveSpec = (departmentId, input, files) => spec("property.unit.save", "Office", departmentId, input, input.id ? `${input.name} changed` : `Office ${input.name}`, files);
export const unitStateSpec = (departmentId, unit, input) => spec("property.unit.state", "Office state", departmentId, { unitId: unit.id, ...input }, `${unit.name}: ${String(input.state).toLowerCase().replace("_", " ")}`);
export const unitArchiveSpec = (departmentId, unit, input) => spec("property.unit.archive", input.archive === false ? "Office restored" : "Office archived", departmentId, { unitId: unit.id, ...input }, `${unit.name} ${input.archive === false ? "restored" : "archived"}`);
export const tenantSaveSpec = (departmentId, input) => spec("property.tenant.save", "Tenant", departmentId, input, input.id ? `${input.name} changed` : input.name);

export const leaseCreateSpec = (departmentId, input, files, summary) => spec("property.lease.create", "Contract", departmentId, input, summary, files);
export const leaseStartSpec = (departmentId, lease, input) => spec("property.lease.start", "Tenant moved in", departmentId, { leaseId: lease.id, ...input }, `${lease.referenceNo}: moved in`);
export const leaseUpdateSpec = (departmentId, lease, input, files) => spec("property.lease.update", "Contract changed", departmentId, { leaseId: lease.id, ...input }, `${lease.referenceNo} changed`, files);
export const leaseRentSpec = (departmentId, lease, input) => spec("property.lease.rent", "Rent changed", departmentId, { leaseId: lease.id, ...input }, `${lease.referenceNo}: ${formatMoney(input.amount)} from ${input.fromMonth}`);
export const leaseCancelSpec = (departmentId, lease, reason) => spec("property.lease.cancel", "Reservation cancelled", departmentId, { leaseId: lease.id, reason }, `${lease.referenceNo} cancelled`);
export const leaseEndSpec = (departmentId, lease, input, files) => spec("property.lease.end", "Tenant moved out", departmentId, { leaseId: lease.id, ...input }, `${lease.referenceNo}: moved out ${input.moveOutKey}`, files);

export const chargeAddSpec = (departmentId, lease, input) => spec("property.charge.add", "Charge billed", departmentId, { leaseId: lease.id, ...input }, `${lease.referenceNo}: ${input.label || input.kind}`);
export const billMonthSpec = (departmentId, input) => spec("property.charge.month", "Monthly billing", departmentId, input, `Bills of ${input.monthKey}`);
export const chargeVoidSpec = (departmentId, charge, reason) => spec("property.charge.void", "Charge voided", departmentId, { chargeId: charge.id, reason }, `${charge.referenceNo} voided`);

export const leasePaymentSpec = (departmentId, lease, input, files) => spec("property.payment.record", "Tenant payment", departmentId, { leaseId: lease.id, ...input }, `${formatMoney(input.amount)} from ${lease.tenant}`, files);
export const leaseRefundSpec = (departmentId, lease, input) => spec("property.refund.record", "Refund to tenant", departmentId, { leaseId: lease.id, ...input }, `Refund ${formatMoney(input.amount)} to ${lease.tenant}`);
export const waiveSpec = (departmentId, lease, input) => spec("property.debt.waive", "Debt forgiven", departmentId, { leaseId: lease.id, ...input }, `${lease.referenceNo}: ${formatMoney(input.amount)} forgiven`);
export const depositReceiveSpec = (departmentId, lease, input, files) => spec("property.deposit.receive", "Deposit received", departmentId, { leaseId: lease.id, ...input }, `Deposit ${formatMoney(input.amount)} from ${lease.tenant}`, files);
export const depositRefundSpec = (departmentId, lease, input) => spec("property.deposit.refund", "Deposit refunded", departmentId, { leaseId: lease.id, ...input }, `Deposit ${formatMoney(input.amount)} back to ${lease.tenant}`);
export const depositApplySpec = (departmentId, lease, input) => spec("property.deposit.apply", "Deposit applied", departmentId, { leaseId: lease.id, ...input }, `${formatMoney(input.amount)} of deposit → ${input.use}`);

export const maintenanceReportSpec = (departmentId, input, files) => spec("property.maintenance.report", "Maintenance request", departmentId, input, input.title, files);
export const maintenanceStepSpec = (departmentId, request, step, input = {}, files) => spec("property.maintenance.step", "Maintenance updated", departmentId, { maintenanceId: request.id, step, ...input }, `${request.referenceNo}: ${step}`, files);
export const inspectionSpec = (departmentId, input, files) => spec("property.inspection.record", "Inspection", departmentId, input, `Inspection ${String(input.kind).toLowerCase().replace("_", "-")}`, files);
export const inspectionCompleteSpec = (departmentId, inspection, input, files) => spec("property.inspection.complete", "Inspection done", departmentId, { inspectionId: inspection.id, ...input }, `${inspection.referenceNo} done`, files);

export const profileSpec = (departmentId, input, files) => spec("property.profile.save", "Business details", departmentId, input, "Business details", files);

/** An expense (or other income) of the department: category, description, payee, its building / office. */
export function propertyMoneySpec(departmentId, { type, amount, category, categoryLabel, paymentMethod = "CASH", counterparty, reference, description, buildingId, propertyUnitId, placeLabel, spentByName, authorizedByName }, files) {
  return spec(
    "money.record",
    type === "OTHER_INCOME" ? "Other income" : "Expense",
    departmentId,
    { type, amount: Number(amount), category, paymentMethod, counterparty, reference, description, buildingId: buildingId || null, propertyUnitId: propertyUnitId || null, spentByName, authorizedByName },
    `${categoryLabel || category} ${formatMoney(amount)}${placeLabel ? ` · ${placeLabel}` : ""}`,
    files
  );
}
