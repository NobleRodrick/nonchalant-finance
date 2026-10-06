/**
 * Office status and labels (pure; safe for client components). The status shown is computed:
 * an active contract makes the office Occupied, a signed one not started yet Reserved; otherwise
 * the state managers set (available, under maintenance, unavailable, awaiting handover).
 */

export const UNIT_STATUS = {
  AVAILABLE: { label: "Available", tone: "emerald", dot: "🟢" },
  OCCUPIED: { label: "Occupied", tone: "rose", dot: "🔴" },
  RESERVED: { label: "Reserved", tone: "amber", dot: "🟡" },
  MAINTENANCE: { label: "Under maintenance", tone: "sky", dot: "🔵" },
  UNAVAILABLE: { label: "Unavailable", tone: "slate", dot: "⚫" },
  AWAITING_HANDOVER: { label: "Vacant, awaiting handover", tone: "violet", dot: "⏳" },
};

/** States a manager may set by hand (occupied and reserved come from contracts). */
export const MANUAL_STATES = ["AVAILABLE", "MAINTENANCE", "UNAVAILABLE", "AWAITING_HANDOVER"];

export const CONDITION_LABELS = { GOOD: "Good", FAIR: "Fair", NEEDS_REPAIR: "Needs repair" };

export const BILLING_METHOD_LABELS = { METER: "Meter readings × rate", FIXED: "Fixed amount a month", SHARE: "Share of the building's bill", INCLUDED: "Included in the rent" };

export const UTILITY_KINDS = ["ELECTRICITY", "WATER", "INTERNET", "CLEANING", "SECURITY", "WASTE", "MAINTENANCE", "OTHER"];

export const LEASE_STATUS_LABELS = { RESERVED: "Reserved", ACTIVE: "Active", ENDED: "Ended", CANCELLED: "Cancelled" };
export const LEASE_STATUS_TONES = { RESERVED: "amber", ACTIVE: "emerald", ENDED: "slate", CANCELLED: "slate" };

/**
 * Status of an office: `leases` are its contracts that are RESERVED or ACTIVE (at most one of
 * each in practice). Returns a key of UNIT_STATUS.
 */
export function unitStatus(unit, leases = []) {
  if (leases.some((l) => l.status === "ACTIVE")) return "OCCUPIED";
  if (leases.some((l) => l.status === "RESERVED")) return "RESERVED";
  return UNIT_STATUS[unit.state] ? unit.state : "AVAILABLE";
}

/** Counts by status: { total, AVAILABLE, OCCUPIED, … , occupancyRate } (offices not archived). */
export function statusCounts(units) {
  const c = { total: 0, ...Object.fromEntries(Object.keys(UNIT_STATUS).map((k) => [k, 0])) };
  for (const u of units) {
    c.total += 1;
    c[u.status] += 1;
  }
  c.vacant = c.AVAILABLE + c.AWAITING_HANDOVER;
  c.occupancyRate = c.total ? Math.round((c.OCCUPIED / c.total) * 1000) / 10 : 0;
  return c;
}

/** Contract expiring within `days` days of `todayKey` (and not yet ended). */
export function expiresSoon(lease, todayKey, days = 60) {
  if (!lease.endKey || !["ACTIVE", "RESERVED"].includes(lease.status)) return false;
  const left = Math.round((Date.parse(`${lease.endKey}T00:00:00Z`) - Date.parse(`${todayKey}T00:00:00Z`)) / 86400000);
  return left <= days;
}

/** "A12 · Place Étoilée" */
export const unitTitle = (u) => (u ? `${u.name}${u.building?.name ? ` · ${u.building.name}` : ""}` : "");

export const MAINTENANCE_STATUS_LABELS = { REPORTED: "Reported", APPROVED: "Approved", IN_PROGRESS: "In progress", COMPLETED: "Completed", CANCELLED: "Cancelled" };
export const MAINTENANCE_STATUS_TONES = { REPORTED: "amber", APPROVED: "sky", IN_PROGRESS: "violet", COMPLETED: "emerald", CANCELLED: "slate" };
export const PRIORITY_LABELS = { LOW: "Low", NORMAL: "Normal", URGENT: "Urgent" };
export const INSPECTION_KIND_LABELS = { MOVE_IN: "Move-in", MOVE_OUT: "Move-out", DAMAGE: "Damage reported", MAINTENANCE: "Maintenance", ROUTINE: "Routine" };
