/**
 * Number formatting for screens, print and e-mails (CFA franc, no decimals).
 * Intl.NumberFormat is deliberately avoided: its group separators for XAF depend on the ICU
 * version (U+202F vs U+00A0) and differ between Node and browsers, which breaks hydration.
 * These helpers are deterministic on both sides: 1250000 -> "1 250 000".
 */
export const CURRENCY = "FCFA";

/** "45 000" (negative: "−45 000"). */
export function formatAmount(value) {
  const amount = Math.round(Number(value) || 0);
  const digits = Math.abs(amount).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return amount < 0 ? `−${digits}` : digits;
}

/** "45 000 FCFA". */
export function formatMoney(value) {
  return `${formatAmount(value)} ${CURRENCY}`;
}

/** Statement style: negatives in brackets, "(12 500)". */
export function formatStatementAmount(value) {
  const amount = Math.round(Number(value) || 0);
  return amount < 0 ? `(${formatAmount(-amount)})` : formatAmount(amount);
}

/** "+2 000" / "−500" / "0". */
export function formatSigned(value) {
  const amount = Math.round(Number(value) || 0);
  return amount > 0 ? `+${formatAmount(amount)}` : formatAmount(amount);
}

/** Plates: whole numbers, legacy decimals kept up to 3 places. */
export function formatPlates(value) {
  const n = Number(value) || 0;
  const rounded = Math.round(n * 1000) / 1000;
  return Number.isInteger(rounded) ? formatAmount(rounded) : String(rounded).replace(".", ",");
}

/** "+12.5%" or "—" when there is no comparison base. */
export function formatPct(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${value > 0 ? "+" : ""}${value.toFixed(1)}%`;
}

/** A share as a percentage without sign: "33.3%" ("—" when unknown). */
export function formatRate(value) {
  if (value === null || value === undefined || !Number.isFinite(value)) return "—";
  return `${Number.isInteger(value) ? value : value.toFixed(1)}%`;
}

/** "1 plate", "3 plates": a count followed by the right singular or plural word. */
export function countOf(n, singular, plural = `${singular}s`) {
  const v = Number(n) || 0;
  return `${formatAmount(v)} ${Math.abs(v) === 1 ? singular : plural}`;
}
