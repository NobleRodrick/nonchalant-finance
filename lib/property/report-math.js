/**
 * Property rental reports as pure functions (docs/PROPERTY_RENTAL_PLAN.md):
 *
 *   rent revenue      each month's rent spread over the days it covers (a month of 100 000 is
 *                     100 000 for the month, 3 226 for one day of a 31-day month), so daily,
 *                     weekly and monthly reports add up; less what was forgiven (on its date)
 *   utilities, other  charges billed in the period (on their bill date), by kind
 *   expenses          money records of the period (repairs and maintenance included)
 *   net operating income = rent + utilities + other charges + other income − expenses
 *
 * Deposits are never income. Cash shows money the day it moves.
 */
import { listDateKeys } from "@/lib/timezone";
import { daysInMonth } from "./rent-schedule";

const int = (v) => Math.round(Number(v) || 0);
const UTILITIES = new Set(["ELECTRICITY", "WATER", "INTERNET", "CLEANING", "SECURITY", "WASTE"]);

/**
 * Rent of the schedule `items` ([{ monthKey, amount, days, daysInMonth }], with the first billed
 * day of the month `fromDay`) falling in [fromKey, toKey]. Returns the amount (whole francs).
 */
export function rentInPeriod(items, startKey, moveOutKey, fromKey, toKey) {
  let total = 0;
  for (const m of items) {
    const dim = m.daysInMonth || daysInMonth(m.monthKey);
    const first = m.monthKey === String(startKey).slice(0, 7) ? startKey : `${m.monthKey}-01`;
    const last = moveOutKey && m.monthKey === String(moveOutKey).slice(0, 7) ? moveOutKey : `${m.monthKey}-${String(dim).padStart(2, "0")}`;
    const a = first > fromKey ? first : fromKey;
    const b = last < toKey ? last : toKey;
    if (a > b) continue;
    const days = listDateKeys(a, b).length;
    total += days === m.days ? m.amount : Math.round((m.amount * days) / m.days);
  }
  return total;
}

/** Charges split into utilities / other, by kind. `charges`: [{ kind, amount }]. */
export function chargeTotals(charges) {
  const byKind = {};
  let utilities = 0;
  let other = 0;
  for (const c of charges) {
    byKind[c.kind] = (byKind[c.kind] || 0) + int(c.amount);
    if (UTILITIES.has(c.kind)) utilities += int(c.amount);
    else other += int(c.amount);
  }
  return { byKind, utilities, other, total: utilities + other };
}

/** The income statement of a period. */
export function propertyIncome({ rent = 0, waived = 0, charges = { utilities: 0, other: 0, byKind: {} }, otherIncome = 0, expenses = 0, expensesByCategory = [] }) {
  const rentNet = int(rent) - int(waived);
  const revenue = rentNet + charges.utilities + charges.other + int(otherIncome);
  return { rent: int(rent), waived: int(waived), rentNet, utilities: charges.utilities, otherCharges: charges.other, byKind: charges.byKind, otherIncome: int(otherIncome), revenue, expenses: int(expenses), expensesByCategory, net: revenue - int(expenses), margin: revenue ? Math.round(((revenue - int(expenses)) / revenue) * 1000) / 10 : null };
}

/**
 * Revenue and expenses by building, office and tenant. `rows`: [{ buildingId, building, unitId,
 * unit, tenantId, tenant, rent, charges }]; `expenses`: [{ buildingId, unitId, amount }] (an
 * expense of an office counts for its building too; one of the whole business only in totals).
 */
export function performanceBy({ rows, expenses, buildings, units }) {
  const b = new Map(buildings.map((x) => [x.id, { id: x.id, name: x.name, rent: 0, charges: 0, revenue: 0, expenses: 0, net: 0 }]));
  const u = new Map(units.map((x) => [x.id, { id: x.id, name: x.name, buildingId: x.buildingId, building: x.building, rent: 0, charges: 0, revenue: 0, expenses: 0, net: 0 }]));
  const t = new Map();
  for (const r of rows) {
    const add = (o) => {
      if (!o) return;
      o.rent += r.rent;
      o.charges += r.charges;
      o.revenue += r.rent + r.charges;
    };
    add(b.get(r.buildingId));
    add(u.get(r.unitId));
    if (!t.has(r.tenantId)) t.set(r.tenantId, { id: r.tenantId, name: r.tenant, rent: 0, charges: 0, revenue: 0, offices: new Set() });
    const tt = t.get(r.tenantId);
    add(tt);
    tt.offices.add(r.unit);
  }
  let general = 0;
  for (const e of expenses) {
    const unit = e.unitId ? u.get(e.unitId) : null;
    if (unit) unit.expenses += int(e.amount);
    const bid = e.buildingId || unit?.buildingId;
    if (bid && b.get(bid)) b.get(bid).expenses += int(e.amount);
    else general += int(e.amount);
  }
  const fin = (o) => ({ ...o, net: o.revenue - o.expenses });
  return {
    buildings: [...b.values()].map(fin),
    units: [...u.values()].map(fin).sort((a, c) => c.revenue - a.revenue),
    tenants: [...t.values()].map((x) => ({ ...x, offices: [...x.offices].join(", ") })).sort((a, c) => c.revenue - a.revenue),
    generalExpenses: general,
  };
}

/** Occupancy over a period: office-days let ÷ office-days available (offices not archived). */
export function occupancyRate(units, leases, fromKey, toKey) {
  const days = listDateKeys(fromKey, toKey).length;
  if (!units.length || !days) return 0;
  let let_ = 0;
  for (const l of leases) {
    if (!["ACTIVE", "ENDED"].includes(l.status)) continue;
    const a = l.startKey > fromKey ? l.startKey : fromKey;
    const end = l.moveOutKey || toKey;
    const b = end < toKey ? end : toKey;
    if (a <= b) let_ += listDateKeys(a, b).length;
  }
  return Math.round((let_ / (units.length * days)) * 1000) / 10;
}

