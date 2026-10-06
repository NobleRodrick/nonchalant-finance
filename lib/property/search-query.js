/** Reading a search box query (pure). */

/** "owing more than 100 000", "owes > 50000", "> 100000" → 100000 (else null). */
export function owingThreshold(q) {
  const m = String(q || "").match(/^(?:(?:tenants?\s+)?(?:owing|owe|owes|debt|debts)\s*)?(?:>|more than|over|above|≥|>=)\s*([\d\s.,]+)\s*(?:fcfa|f)?$/i) || String(q || "").match(/^(?:owing|owe|owes)\s+([\d\s.,]+)/i);
  if (!m) return null;
  const n = Number(m[1].replace(/[\s.,]/g, ""));
  return Number.isFinite(n) && n > 0 ? n : null;
}

