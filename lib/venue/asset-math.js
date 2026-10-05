/**
 * Assets checked before and after an event, as pure functions: a check line counts the units of
 * an asset in good condition, damaged and missing (good + damaged + missing = units expected).
 * The difference between the two checks is what the event cost the hall: units newly damaged and
 * newly missing (pages, the server and tests use the same rules).
 */

export const CATEGORY_LABELS = {
  CHAIRS: "Chairs",
  TABLES: "Tables",
  DECORATION: "Decorations",
  SOUND: "Sound equipment",
  LIGHTING: "Lighting equipment",
  FURNITURE: "Furniture",
  OTHER: "Other equipment",
};

const int = (v) => Math.max(0, Math.round(Number(v) || 0));

/** A check line made consistent: missing = expected − good − damaged (never negative). */
export function normalizeLine({ expected, good, damaged = 0, missing = null }) {
  const e = int(expected);
  const d = int(damaged);
  const g = int(good);
  const m = missing === null || missing === undefined || missing === "" ? Math.max(0, e - g - d) : int(missing);
  return { expected: e, good: g, damaged: d, missing: m, valid: g + d + m === e };
}

/**
 * Differences between the check before and the check after an event, per asset:
 * { assetId, newDamaged, newMissing, repaired, found }. Lines are matched by asset; an asset not
 * checked before counts as all good before.
 */
export function compareChecks(before = [], after = []) {
  const prev = new Map(before.map((l) => [l.assetId, l]));
  return after.map((a) => {
    const b = prev.get(a.assetId) || { damaged: 0, missing: 0 };
    return {
      assetId: a.assetId,
      newDamaged: Math.max(0, int(a.damaged) - int(b.damaged)),
      newMissing: Math.max(0, int(a.missing) - int(b.missing)),
      repaired: Math.max(0, int(b.damaged) - int(a.damaged)),
      found: Math.max(0, int(b.missing) - int(a.missing)),
    };
  });
}

/** Estimated cost of a difference: the units × the asset's replacement value. */
export function estimatedCost(units, unitValue) {
  return int(units) * int(unitValue);
}

/** Totals of incidents: { open, charged, loss, resolved, count } in FCFA. */
export function incidentTotals(incidents = []) {
  const t = { open: 0, charged: 0, loss: 0, resolved: 0, count: incidents.length, units: 0 };
  for (const i of incidents) {
    const cost = int(i.cost);
    t.units += int(i.quantity);
    if (i.status === "OPEN") t.open += cost;
    else if (i.status === "CHARGED") t.charged += cost;
    else if (i.status === "LOSS") t.loss += cost;
    else t.resolved += cost;
  }
  return t;
}
