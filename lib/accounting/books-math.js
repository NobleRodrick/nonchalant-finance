/**
 * Pure arithmetic of the books' working tools (safe for unit tests and the browser): ageing of what
 * customers and suppliers owe, the VAT return's lines, matching a bank statement with the books.
 */

const days = (a, b) => Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86400000;
export const MATCH_DAYS = 7;

export const BUCKETS = [
  ["0-30", 0, 30],
  ["31-60", 31, 60],
  ["61-90", 61, 90],
  ["90+", 91, Infinity],
];

const daysBetween = (a, b) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);

/**
 * Pure: one partner's lines [{ dateKey, amount }] (amount > 0: it owes / is owed more; < 0: paid)
 * → { balance, buckets, oldestKey } as of `asOfKey` (oldest charges are settled first).
 */
export function ageLines(lines, asOfKey) {
  const open = [];
  let credit = 0;
  for (const l of [...lines].sort((a, b) => a.dateKey.localeCompare(b.dateKey))) {
    if (l.amount > 0) open.push({ dateKey: l.dateKey, left: l.amount });
    else credit += -l.amount;
  }
  for (const o of open) {
    const used = Math.min(o.left, credit);
    o.left -= used;
    credit -= used;
  }
  const buckets = Object.fromEntries(BUCKETS.map(([k]) => [k, 0]));
  let oldestKey = null;
  for (const o of open) {
    if (!o.left) continue;
    const age = daysBetween(o.dateKey, asOfKey);
    const [k] = BUCKETS.find(([, from, to]) => age >= from && age <= to) || BUCKETS[3];
    buckets[k] += o.left;
    if (!oldestKey) oldestKey = o.dateKey;
  }
  const owed = open.reduce((s, o) => s + o.left, 0);
  return { balance: owed - credit, owed, ahead: credit, buckets, oldestKey };
}

/**
 * Pure: the lines of the return from the month's balances. `collected`: { 4431: credit amount … },
 * `deductible`: { 4452: debit amount … }, `credit`: VAT credit carried (4449 debit balance).
 */
export function returnLines({ collected, deductible, credit }) {
  const c = Object.values(collected).reduce((s, v) => s + v, 0);
  const d = Object.values(deductible).reduce((s, v) => s + v, 0);
  const net = c - d;
  const lines = [];
  for (const [n, v] of Object.entries(collected)) if (v > 0) lines.push({ account: n, debit: v, credit: 0, label: "VAT collected" });
  for (const [n, v] of Object.entries(collected)) if (v < 0) lines.push({ account: n, debit: 0, credit: -v, label: "VAT collected (credit notes)" });
  for (const [n, v] of Object.entries(deductible)) if (v > 0) lines.push({ account: n, debit: 0, credit: v, label: "Deductible VAT" });
  for (const [n, v] of Object.entries(deductible)) if (v < 0) lines.push({ account: n, debit: -v, credit: 0, label: "Deductible VAT (reversed)" });
  let toPay = 0;
  let carried = 0;
  if (net > 0) {
    const used = Math.min(Math.max(0, credit), net);
    if (used) lines.push({ account: "4449", debit: 0, credit: used, label: "Credit of earlier months used" });
    toPay = net - used;
    if (toPay) lines.push({ account: "4441", debit: 0, credit: toPay, label: "VAT to pay" });
  } else if (net < 0) {
    carried = -net;
    lines.push({ account: "4449", debit: carried, credit: 0, label: "VAT credit carried forward" });
  }
  return { lines, collected: c, deductible: d, net, toPay, carried, creditUsed: net > 0 ? Math.min(Math.max(0, credit), net) : 0 };
}

/**
 * Pure: pairs statement lines with ledger lines. A pair has the same signed amount and dates at
 * most MATCH_DAYS apart; a shared reference wins, then the closest date. Each line pairs once.
 */
export function proposeMatches(statementLines, ledgerLines) {
  const used = new Set();
  const out = [];
  for (const s of statementLines) {
    const candidates = ledgerLines.filter((l) => !used.has(l.id) && l.amount === s.amount && days(l.dateKey, s.dateKey) <= MATCH_DAYS);
    if (!candidates.length) continue;
    const ref = s.reference && candidates.find((l) => [l.reference, l.label].filter(Boolean).some((x) => String(x).toLowerCase().includes(String(s.reference).toLowerCase())));
    const best = ref || candidates.sort((a, b) => days(a.dateKey, s.dateKey) - days(b.dateKey, s.dateKey))[0];
    used.add(best.id);
    out.push({ statementLineId: s.id, journalLineId: best.id });
  }
  return out;
}
