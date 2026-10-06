/**
 * Operations of office & property rental departments (e.g. Place Étoilée & Main Building):
 * buildings and offices, tenants, contracts, charges and meter readings, payments with their
 * allocation, deposits, move-out, maintenance and inspections (see lib/operations/registry.js for
 * the definition format; docs/PROPERTY_RENTAL_PLAN.md for the rules).
 */
import { PERMISSIONS } from "@/lib/permissions";
import { saveClient } from "@/lib/clients/client-service";
import { saveProfile } from "@/lib/business-profile";
import { recordCashCount } from "@/lib/departments/cash-count-service";
import { archiveUnit, saveBuilding, saveUnit, setUnitState } from "@/lib/property/unit-service";
import { cancelLease, changeRent, createLease, startLease, updateLease } from "@/lib/property/lease-service";
import { addCharge, billMonth, voidCharge } from "@/lib/property/charge-service";
import { recordLeasePayment, recordLeaseRefund, waiveDebt } from "@/lib/property/payment-service";
import { applyDeposit, receiveDeposit, refundDeposit } from "@/lib/property/deposit-service";
import { endLease } from "@/lib/property/move-out";
import { reportMaintenance, stepMaintenance } from "@/lib/property/maintenance-service";
import { completeInspection, recordInspection } from "@/lib/property/inspection-service";
import { writeIn } from "./helpers";

const DOMAIN = "PROPERTY_RENTAL";
const MANAGE = writeIn(DOMAIN, PERMISSIONS.PROPERTY_MANAGE);
const LEASE = writeIn(DOMAIN, PERMISSIONS.PROPERTY_LEASE);
const ARCHIVE = writeIn(DOMAIN, PERMISSIONS.ITEMS_ARCHIVE);

export const PROPERTY_OPERATIONS = {
  // ─── Buildings and offices ────────────────────────────────────────────────
  "property.building.save": { label: "Building", access: MANAGE, run: saveBuilding },
  /** An office: building, name, floor, category, size, rent (from a month), deposit, charges, photos. */
  "property.unit.save": { label: "Office", dated: true, access: MANAGE, run: saveUnit },
  /** Available (from a date), under maintenance, unavailable, awaiting handover. */
  "property.unit.state": { label: "Office state", access: MANAGE, run: setUnitState },
  "property.unit.archive": { label: "Office archived", access: ARCHIVE, run: archiveUnit },

  // ─── Tenants ──────────────────────────────────────────────────────────────
  "property.tenant.save": { label: "Tenant", access: LEASE, run: saveClient },

  // ─── Contracts ────────────────────────────────────────────────────────────
  /** A tenant on an office: reserved, or active (moved in). The office is locked; no overlap. */
  "property.lease.create": { label: "Contract", dated: true, access: LEASE, run: createLease },
  /** The tenant moved in (reserved → active). */
  "property.lease.start": { label: "Tenant moved in", dated: true, access: LEASE, run: startLease },
  /** End date (renewal), due day, months per bill, deposit, notice, utilities, conditions. */
  "property.lease.update": { label: "Contract changed", access: LEASE, run: updateLease },
  /** A new monthly rent from a month (the right to change prices; the old price stays). */
  "property.lease.rent": { label: "Rent changed", access: LEASE, run: changeRent },
  "property.lease.cancel": { label: "Reservation cancelled", access: LEASE, run: cancelLease },
  /** Move-out: last day billed, final inspection, deposit applied / refunded, office awaiting handover. */
  "property.lease.end": { label: "Tenant moved out", dated: true, money: true, access: LEASE, run: endLease },

  // ─── Charges and money ────────────────────────────────────────────────────
  /** A utility (meter readings or amount) or other charge billed to a contract. */
  "property.charge.add": { label: "Charge billed", dated: true, access: LEASE, run: addCharge },
  /** The month's bills for every contract (meter readings, fixed charges, shares of bills). */
  "property.charge.month": { label: "Monthly billing", dated: true, access: LEASE, run: billMonth },
  "property.charge.void": { label: "Charge voided", access: writeIn(DOMAIN, PERMISSIONS.RECORDS_VOID), run: voidCharge },
  /** A tenant's payment, allocated to the oldest debts first (or as chosen); the rest is an advance. */
  "property.payment.record": { label: "Tenant payment", money: true, dated: true, access: LEASE, run: recordLeasePayment },
  "property.refund.record": { label: "Refund to tenant", money: true, dated: true, access: LEASE, run: recordLeaseRefund },
  /** Part of a month's rent or of a charge forgiven (reason; the right to change prices). */
  "property.debt.waive": { label: "Debt forgiven", dated: true, access: writeIn(DOMAIN, PERMISSIONS.PRICES_CHANGE), run: waiveDebt },
  "property.deposit.receive": { label: "Deposit received", money: true, dated: true, access: LEASE, run: receiveDeposit },
  "property.deposit.refund": { label: "Deposit refunded", money: true, dated: true, access: LEASE, run: refundDeposit },
  /** Held deposit applied to rent, charges or damages (no money moves). */
  "property.deposit.apply": { label: "Deposit applied", dated: true, access: LEASE, run: applyDeposit },

  // ─── Maintenance and inspections ──────────────────────────────────────────
  "property.maintenance.report": { label: "Maintenance request", dated: true, access: LEASE, run: reportMaintenance },
  /** approve | plan | start | complete (pay now, bill the tenant) | cancel */
  "property.maintenance.step": { label: "Maintenance updated", dated: true, money: true, access: LEASE, run: stepMaintenance },
  "property.inspection.record": { label: "Inspection", dated: true, access: LEASE, run: recordInspection },
  "property.inspection.complete": { label: "Inspection done", dated: true, access: LEASE, run: completeInspection },

  // ─── Business details and cash ────────────────────────────────────────────
  "property.profile.save": { label: "Business details", access: MANAGE, run: saveProfile },
  "property.cash.count": { label: "Cash count", dated: true, access: writeIn(DOMAIN, PERMISSIONS.HANDOVER_CREATE), run: recordCashCount },
};
