/**
 * Arithmetic of production (bakery, workshop) — pure, safe for the browser.
 *
 *   materials for a batch = recipe line × (planned quantity ÷ recipe yield)
 *   cost of a batch       = Σ materials used × their average cost
 *   unit cost             = cost ÷ good units produced  (waste raises it)
 *   waste                 = planned − produced (never below 0)
 */

const q3 = (v) => Math.round(Number(v || 0) * 1000) / 1000;

/** The materials a batch of `planned` units needs from a recipe { yieldQuantity, lines: [{ materialId, quantity }] }. */
export function scaleRecipe(recipe, planned) {
  const y = Number(recipe?.yieldQuantity) || 0;
  if (!y || !planned) return [];
  const f = Number(planned) / y;
  return (recipe.lines || []).map((l) => ({ materialId: l.materialId, quantity: q3(Number(l.quantity) * f) })).filter((l) => l.quantity > 0);
}

/** Cost of a recipe from the materials' average cost: { cost, unitCost, margin, marginPct } against a sale price. */
export function recipeCost(recipe, costOf, salePrice = 0) {
  const cost = Math.round((recipe?.lines || []).reduce((s, l) => s + Number(l.quantity) * (costOf(l.materialId) || 0), 0));
  const y = Number(recipe?.yieldQuantity) || 0;
  const unitCost = y ? Math.round(cost / y) : 0;
  const margin = salePrice ? salePrice - unitCost : null;
  return { cost, unitCost, margin, marginPct: salePrice ? Math.round(((salePrice - unitCost) / salePrice) * 1000) / 10 : null };
}

/** Totals of a batch: cost of materials [{ quantity, unitCost }], good units → unit cost and waste. */
export function batchFigures({ materials, planned, produced }) {
  const totalCost = Math.round(materials.reduce((s, m) => s + q3(m.quantity) * Math.round(Number(m.unitCost) || 0), 0));
  const p = q3(produced);
  return { totalCost, unitCost: p > 0 ? Math.round(totalCost / p) : 0, waste: Math.max(0, q3(Number(planned || 0) - p)), wastePct: planned ? Math.max(0, Math.round(((planned - p) / planned) * 1000) / 10) : 0 };
}
