/**
 * The stock of an event rental department as pure functions (pages, services and tests share
 * them). Quantities of a stock line are never typed: every change is a movement whose effect on
 * the line's counters is fixed here, so the counters always equal the sum of the movements.
 *
 *   owned     units the business has (in the store, out at events, damaged, in repair, missing)
 *   in stock  owned − out − damaged − in repair − missing   (good units in the store)
 *
 * Pure module (safe for client components; unit-tested).
 */

export const COUNTERS = ["owned", "out", "damaged", "inRepair", "missing"];
const DELTA_OF = { owned: "dOwned", out: "dOut", damaged: "dDamaged", inRepair: "dRepair", missing: "dMissing" };

export const CONDITION_LABELS = { NEW: "New", GOOD: "Good", FAIR: "Fair", WORN: "Worn" };

export const MOVEMENT_LABELS = {
  OPENING: "Opening count",
  PURCHASED: "Bought",
  ISSUED: "Out to an event",
  RETURNED: "Back from an event",
  DAMAGED: "Damaged",
  REPAIR_SENT: "Sent to repair",
  REPAIRED: "Repaired",
  MISSING: "Missing",
  FOUND: "Found",
  WRITTEN_OFF: "Written off",
  ADJUSTED: "Count corrected",
  TRANSFERRED: "Moved to another place",
};

export const INCIDENT_KIND_LABELS = { DAMAGED: "Damaged", BROKEN: "Broken", MISSING: "Missing" };
export const INCIDENT_STATUS_LABELS = { OPEN: "To settle", CHARGED: "Charged to customer", LOSS: "Loss", REPAIR: "In repair", RESOLVED: "Resolved" };

const int = (v) => Math.round(Number(v) || 0);

/** Good units in the store. */
export function inStock(item) {
  return int(item.owned) - int(item.out) - int(item.damaged) - int(item.inRepair) - int(item.missing);
}

/** Value of the units owned at their purchase price. */
export const stockValue = (item) => int(item.owned) * int(item.purchasePrice);

/** What a lost unit costs: its replacement value, or its purchase price when none is set. */
export const unitLossValue = (item) => int(item.replacementValue) || int(item.purchasePrice);

/** "LOW" when the good units in the store are at or under the line's low-stock level, "EMPTY" at 0. */
export function stockAlert(item) {
  const n = inStock(item);
  if (n <= 0 && int(item.owned) > 0) return "EMPTY";
  if (int(item.lowStockLevel) > 0 && n <= int(item.lowStockLevel)) return "LOW";
  return null;
}

/** Where the units of a movement come from (or go to), by kind: the counter that changes. */
const FROM_CHOICES = {
  DAMAGED: ["stock", "out"], // found damaged in the store, or came back damaged
  MISSING: ["stock", "out"],
  REPAIRED: ["inRepair", "damaged"], // back from the repairer, or fixed in house
  WRITTEN_OFF: ["damaged", "inRepair", "missing", "stock"],
};

const BUCKET = { stock: null, out: "out", damaged: "damaged", inRepair: "inRepair", missing: "missing" };

const label = (bucket) => ({ stock: "in the store", out: "out at events", damaged: "damaged", inRepair: "in repair", missing: "missing" })[bucket];

/**
 * Counter changes of a movement. `quantity` > 0 (ADJUSTED: the signed change of the units
 * owned); `from` picks where the units come from for DAMAGED, MISSING, REPAIRED, WRITTEN_OFF.
 * Throws an Error with a message for the person when the line does not have the units.
 * Returns { deltas: { dOwned, dOut, dDamaged, dRepair, dMissing }, counters } (the new counters).
 */
export function movementEffect(item, kind, quantity, from = null) {
  const q = int(quantity);
  const name = item.name || "this item";
  if (kind === "ADJUSTED" ? q === 0 : q <= 0) throw new Error("The quantity must be a whole number of at least 1.");
  const change = { owned: 0, out: 0, damaged: 0, inRepair: 0, missing: 0 };
  const available = { stock: inStock(item), out: int(item.out), damaged: int(item.damaged), inRepair: int(item.inRepair), missing: int(item.missing) };
  const take = (bucket) => {
    if (q > available[bucket]) throw new Error(`Only ${available[bucket]} ${name} ${label(bucket)}.`);
    if (BUCKET[bucket]) change[BUCKET[bucket]] -= q;
  };
  const choices = FROM_CHOICES[kind];
  const source = choices ? (choices.includes(from) ? from : choices[0]) : null;
  switch (kind) {
    case "OPENING":
    case "PURCHASED":
      change.owned += q;
      break;
    case "ISSUED":
      take("stock");
      change.out += q;
      break;
    case "RETURNED":
      take("out");
      break;
    case "DAMAGED":
      take(source);
      change.damaged += q;
      break;
    case "REPAIR_SENT":
      take("damaged");
      change.inRepair += q;
      break;
    case "REPAIRED":
      take(source);
      break;
    case "MISSING":
      take(source);
      change.missing += q;
      break;
    case "FOUND":
      take("missing");
      break;
    case "WRITTEN_OFF":
      take(source);
      change.owned -= q;
      break;
    case "ADJUSTED":
      if (q < 0 && -q > available.stock) throw new Error(`Only ${available.stock} ${name} ${label("stock")} can be taken off the count.`);
      change.owned += q;
      break;
    case "TRANSFERRED":
      break;
    default:
      throw new Error("Unknown stock movement.");
  }
  const counters = Object.fromEntries(COUNTERS.map((c) => [c, int(item[c]) + change[c]]));
  const deltas = Object.fromEntries(COUNTERS.map((c) => [DELTA_OF[c], change[c]]));
  return { deltas, counters, from: source };
}

/** Counters of a line from its movements (the integrity check: they must equal the stored ones). */
export function countersFromMovements(movements) {
  const c = { owned: 0, out: 0, damaged: 0, inRepair: 0, missing: 0 };
  for (const m of movements) {
    c.owned += int(m.dOwned);
    c.out += int(m.dOut);
    c.damaged += int(m.dDamaged);
    c.inRepair += int(m.dRepair);
    c.missing += int(m.dMissing);
  }
  return c;
}

/** Three letters for item codes: "Chairs" → "CHR", "Gold plates" → "GLD". */
export function codePrefix(name) {
  const letters = String(name || "").toUpperCase().normalize("NFD").replace(/[^A-Z]/g, "");
  if (!letters) return "ITM";
  const consonants = letters[0] + letters.slice(1).replace(/[AEIOUY]/g, "");
  return (consonants.length >= 3 ? consonants : letters).slice(0, 3).padEnd(3, "X");
}

/** "CHR-001" */
export const formatItemCode = (prefix, n) => `${prefix}-${String(n).padStart(3, "0")}`;
