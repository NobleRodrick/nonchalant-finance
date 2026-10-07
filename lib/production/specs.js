/**
 * Builders of the production, farm and salon / gym operations the forms record (lib/offline). Pure.
 */
import { formatMoney } from "@/lib/format";

const spec = (kind, label, departmentId, input, summary) => ({ kind, label, departmentId, input: { departmentId, ...input }, meta: { summary } });

// Production
export const recipeSpec = (d, input, product) => spec("production.recipe.save", "Recipe", d, input, `Recipe of ${product || "a product"}`);
export const batchSpec = (d, input, product) => spec("production.batch.record", "Production batch", d, input, `${input.producedQuantity} × ${product || "product"} made`);
export const batchVoidSpec = (d, b, reason) => spec("production.batch.void", "Batch voided", d, { batchId: b.id, reason }, `${b.referenceNo} voided`);

// Farm
export const farmBatchSpec = (d, input) => spec("farm.batch.save", "Farm batch", d, input, input.id ? `${input.name} changed` : input.name);
export const farmEventSpec = (d, b, input, label) => spec("farm.event.record", "Farm record", d, { batchId: b.id, ...input }, `${b.name}: ${label}${input.quantity ? ` ${input.quantity}` : ""}`);
export const farmEventVoidSpec = (d, e, reason) => spec("farm.event.void", "Farm record voided", d, { eventId: e.id, reason }, `${e.label} voided`);
export const farmSellSpec = (d, b, input) => spec("farm.batch.sell", "Farm sale", d, { batchId: b.id, ...input }, `${b.name}: ${input.quantity} sold · ${formatMoney(input.amount)}`);
export const farmCloseSpec = (d, b, input) => spec("farm.batch.close", input.reopen ? "Batch reopened" : "Batch closed", d, { batchId: b.id, ...input }, `${b.name} ${input.reopen ? "reopened" : "closed"}`);

// Salon, spa, gym
export const appointmentSpec = (d, input) => spec("salon.appointment.save", "Appointment", d, input, `${input.client?.name || input.customerName} · ${input.startAt?.slice(0, 16).replace("T", " ")}`);
export const appointmentStatusSpec = (d, a, status, reason) => spec("salon.appointment.status", "Appointment", d, { appointmentId: a.id, status, reason }, `${a.customer}: ${status.toLowerCase().replace("_", " ")}`);
export const planSpec = (d, input) => spec("salon.plan.save", "Membership plan", d, input, input.name);
export const membershipSpec = (d, input, plan) => spec("salon.membership.sell", "Membership", d, input, `${input.client?.name} · ${plan}`);
export const visitSpec = (d, m) => spec("salon.membership.visit", "Check-in", d, { membershipId: m.id }, `${m.customer} checked in`);
export const membershipCancelSpec = (d, m, reason) => spec("salon.membership.cancel", "Membership cancelled", d, { membershipId: m.id, reason }, `${m.referenceNo} cancelled`);
