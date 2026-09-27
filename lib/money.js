/**
 * Consistent arithmetic for money and quantities.
 * FCFA has no minor unit, so money is always an integer number of francs.
 * Quantities keep 3 decimals (e.g. 0.25 kg). Integer arithmetic on scaled values
 * avoids floating-point drift such as 0.1 + 0.2.
 */
import { num } from "@/lib/serialize";

const QTY_SCALE = 1000;
const COST_SCALE = 100;

export const toNumber = num;

export function roundMoney(value) {
  const n = num(value);
  return Math.round(n + (n >= 0 ? 1e-9 : -1e-9)) || 0;
}

export function roundQty(value) {
  return Math.round(num(value) * QTY_SCALE) / QTY_SCALE || 0;
}

/** Unit costs may be fractional (e.g. 733.33 FCFA per kg). */
export function roundUnitCost(value) {
  return Math.round(num(value) * COST_SCALE) / COST_SCALE || 0;
}

export function sumMoney(values) {
  return values.reduce((acc, v) => acc + roundMoney(v), 0);
}

export function addQty(...values) {
  return values.reduce((acc, v) => acc + Math.round(num(v) * QTY_SCALE), 0) / QTY_SCALE;
}

export function subQty(a, b) {
  return (Math.round(num(a) * QTY_SCALE) - Math.round(num(b) * QTY_SCALE)) / QTY_SCALE;
}

export function mulQty(a, b) {
  return roundQty(num(a) * num(b));
}

/** quantity × unit price, rounded to whole francs. */
export function lineMoney(quantity, unitPrice) {
  return roundMoney(num(quantity) * num(unitPrice));
}

export function positiveNumber(value, { allowZero = false } = {}) {
  const n = num(value);
  if (!Number.isFinite(n)) return null;
  if (allowZero ? n < 0 : n <= 0) return null;
  return n;
}

/**
 * Splits `total` across `weights` so the parts are whole francs and sum exactly to
 * `total` (largest-remainder method).
 */
export function allocateProportionally(total, weights) {
  const T = roundMoney(total);
  const W = weights.map((w) => Math.max(0, num(w)));
  const sumW = W.reduce((a, b) => a + b, 0);
  if (T === 0 || sumW === 0) return W.map(() => 0);
  const raw = W.map((w) => (w / sumW) * T);
  const floors = raw.map((r) => Math.floor(r));
  let remainder = T - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((r, i) => ({ i, frac: r - Math.floor(r) }))
    .sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (let k = 0; remainder > 0 && k < order.length; k += 1, remainder -= 1) {
    floors[order[k].i] += 1;
  }
  return floors;
}
