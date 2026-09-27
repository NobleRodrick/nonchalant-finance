/**
 * Plate stock arithmetic (pure; safe for client and server).
 *
 * A dish is one line of the menu and one line of stock. Its plates at any instant are the
 * sum of its stock movements up to that instant. For a business day D:
 *
 *   Opening   = Σ movements before D  (+ OPENING_CORRECTION dated at the start of D)
 *   Added     = STOCK_ADDED + OPENING (dish created during D) + legacy PREPARATION/PURCHASE
 *   Sold      = SOLD (+ legacy USAGE) − reversals of sales
 *   Spoiled   = SPOILED (+ legacy WASTE/DAMAGE)
 *   Corrected = CORRECTION (+ legacy ADJUSTMENT) + reversals of additions
 *   Closing   = Opening + Added − Sold − Spoiled + Corrected
 */
import { num } from "@/lib/serialize";

export const ADDED_TYPES = ["STOCK_ADDED", "OPENING", "PREPARATION", "PURCHASE"];
export const SOLD_TYPES = ["SOLD", "USAGE"];
export const SPOILED_TYPES = ["SPOILED", "WASTE", "DAMAGE"];
export const CORRECTION_TYPES = ["CORRECTION", "ADJUSTMENT", "REVERSAL"];

/**
 * Sign conventions. New movement types store a signed quantity so a void is written as the
 * same type with the opposite sign (a voided sale of 3 plates = SOLD −3), which keeps every
 * column honest. Legacy types (PREPARATION, USAGE, WASTE …) stored absolute values.
 */
const LEGACY_ABS = ["PREPARATION", "PURCHASE", "USAGE", "WASTE", "DAMAGE"];

/** Plates are whole numbers; legacy rows may hold decimals, rounded to 3 places. */
export function plates(value) {
  return Math.round(num(value) * 1000) / 1000 || 0;
}

/** Signed effect of one movement on the plates in stock. */
export function movementDelta(m) {
  const raw = plates(m.quantity);
  const q = LEGACY_ABS.includes(m.type) ? Math.abs(raw) : raw;
  if (ADDED_TYPES.includes(m.type)) return q;
  if (SOLD_TYPES.includes(m.type) || SPOILED_TYPES.includes(m.type)) return -q;
  return q; // CORRECTION, OPENING_CORRECTION, ADJUSTMENT, REVERSAL are signed
}

/** Report column of a movement. */
export function movementColumn(m) {
  if (m.type === "OPENING_CORRECTION") return "openingCorrection";
  if (ADDED_TYPES.includes(m.type)) return "added";
  if (SOLD_TYPES.includes(m.type)) return "sold";
  if (SPOILED_TYPES.includes(m.type)) return "spoiled";
  return "corrected";
}

const t = (d) => (d instanceof Date ? d.getTime() : new Date(d).getTime());

/**
 * Positions of each dish for the window [start, end] from its movements.
 * `movements` must contain every movement of the dishes dated up to `end`.
 * An OPENING_CORRECTION dated exactly at `start` belongs to the opening of the day.
 */
export function dayPositions(dishes, movements, start, end) {
  const s = t(start);
  const e = t(end);
  const byDish = new Map(dishes.map((d) => [d.id, { opening: 0, openingCorrection: 0, added: 0, sold: 0, spoiled: 0, corrected: 0 }]));
  for (const m of movements) {
    const row = byDish.get(m.menuItemId);
    if (!row) continue;
    const when = t(m.date);
    const delta = movementDelta(m);
    if (when < s) {
      row.opening += delta;
      continue;
    }
    if (when > e) continue;
    const col = movementColumn(m);
    if (col === "openingCorrection") {
      if (when === s) {
        row.opening += delta;
        row.openingCorrection += delta;
      } else row.corrected += delta;
    } else if (col === "added") row.added += delta;
    else if (col === "sold") row.sold -= delta;
    else if (col === "spoiled") row.spoiled -= delta;
    else row.corrected += delta;
  }
  const round = (v) => Math.round(v * 1000) / 1000 || 0;
  return dishes.map((dish) => {
    const r = byDish.get(dish.id);
    const opening = round(r.opening);
    const added = round(r.added);
    const sold = round(r.sold);
    const spoiled = round(r.spoiled);
    const corrected = round(r.corrected);
    return {
      dishId: dish.id,
      name: dish.name,
      section: dish.section || null,
      unitPrice: Math.round(num(dish.unitPrice ?? dish.sellingPrice)),
      costPrice: Math.round(num(dish.costPrice)),
      isActive: dish.isActive !== false,
      lowStockLevel: num(dish.lowStockLevel),
      opening,
      openingCorrection: round(r.openingCorrection),
      added,
      sold,
      spoiled,
      corrected,
      closing: round(opening + added - sold - spoiled + corrected),
    };
  });
}

/** Adds values (at unit price, and at cost when a cost is known) and totals. */
export function valuePositions(rows) {
  const out = rows.map((r) => ({
    ...r,
    openingValue: Math.round(Math.max(0, r.opening) * r.unitPrice),
    value: Math.round(Math.max(0, r.closing) * r.unitPrice),
    costValue: r.costPrice > 0 ? Math.round(Math.max(0, r.closing) * r.costPrice) : null,
    soldValue: Math.round(r.sold * r.unitPrice),
    lowStock: r.isActive && (r.closing <= 0 || (r.lowStockLevel > 0 && r.closing <= r.lowStockLevel)),
  }));
  const sum = (k) => Math.round(out.reduce((acc, r) => acc + (r[k] || 0), 0) * 1000) / 1000;
  return {
    rows: out,
    totals: {
      opening: sum("opening"),
      added: sum("added"),
      sold: sum("sold"),
      spoiled: sum("spoiled"),
      corrected: sum("corrected"),
      closing: sum("closing"),
      openingValue: sum("openingValue"),
      value: sum("value"),
      soldValue: sum("soldValue"),
      costValue: out.some((r) => r.costValue !== null) ? sum("costValue") : null,
      dishes: out.filter((r) => r.isActive).length,
      lowStock: out.filter((r) => r.lowStock).length,
    },
    showSpoiled: out.some((r) => r.spoiled !== 0),
    showCorrected: out.some((r) => r.corrected !== 0),
  };
}

/**
 * Lowest opening allowed for day D: after D starts the plates must never go below 0.
 * `laterMovements` are the dish's movements dated after the start of D (oldest first),
 * excluding opening corrections at the start of D.
 */
export function minimumOpening(laterMovements) {
  let running = 0;
  let lowest = 0;
  for (const m of laterMovements) {
    running += movementDelta(m);
    if (running < lowest) lowest = running;
  }
  return Math.max(0, -lowest);
}

/**
 * Same as dayPositions but anchored on each dish's cached `currentQuantity`, so only the
 * movements dated at/after `start` are needed (fast for long histories).
 * Relies on the invariant currentQuantity = Σ all movements (checked nightly and in tests).
 */
export function dayPositionsFromCurrent(dishes, movementsSinceStart, start, end) {
  const s = t(start);
  const sinceByDish = new Map();
  for (const m of movementsSinceStart) {
    sinceByDish.set(m.menuItemId, (sinceByDish.get(m.menuItemId) || 0) + movementDelta(m));
  }
  const synthetic = dishes.map((d) => ({
    menuItemId: d.id,
    type: "CORRECTION",
    quantity: plates(d.currentQuantity) - (sinceByDish.get(d.id) || 0),
    date: new Date(s - 1),
  }));
  return dayPositions(dishes, [...synthetic, ...movementsSinceStart], start, end);
}
