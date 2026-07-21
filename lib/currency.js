// Currency formatting for the CFA franc.
//
// Intl.NumberFormat is deliberately avoided here: its group separators for XAF
// are ICU-version dependent (U+202F vs U+00A0), and Node's ICU can differ from
// the browser's. That mismatch shows up as a React hydration error on amounts
// rendered in Server Components. This formatter is deterministic on both sides.
//
// To switch to the West African CFA franc, change CURRENCY_SYMBOL to "CFA".

export const CURRENCY_SYMBOL = "FCFA"; // XAF - Central African CFA franc

/** Format the bare number, e.g. 45000 -> "45 000". */
export function formatAmount(value) {
  const amount = Math.round(Number(value) || 0);
  const sign = amount < 0 ? "-" : "";
  const digits = Math.abs(amount)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  return `${sign}${digits}`;
}

/** Format a value as CFA francs, e.g. 45000 -> "45 000 FCFA". */
export function formatCurrency(value) {
  return `${formatAmount(value)} ${CURRENCY_SYMBOL}`;
}
