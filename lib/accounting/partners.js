/**
 * Customers' and suppliers' balances from the books, with their age: what is owed is matched with
 * what was paid oldest first, and what remains is aged from the day it was charged. Customers are
 * the 41 accounts (debit: they owe; credit: they paid ahead), suppliers the 40 accounts (credit: the
 * company owes; debit: advances paid).
 */
import { db } from "@/lib/prisma";
import { dbDay } from "./ledger";
import { BUCKETS, ageLines } from "./books-math";

export { BUCKETS, ageLines };

/** Partners of one side ("customers" | "suppliers") with balances and ageing at `asOfKey`. */
export async function partnerLedger({ company, side = "customers", asOfKey, departmentId = null, client = db }) {
  const prefix = side === "suppliers" ? "40" : "41";
  const accounts = await client.ledgerAccount.findMany({ where: { companyId: company.id, number: { startsWith: prefix }, NOT: { number: { startsWith: "419" } } }, select: { id: true } });
  if (!accounts.length) return { rows: [], totals: { owed: 0, ahead: 0, buckets: Object.fromEntries(BUCKETS.map(([k]) => [k, 0])) } };
  const lines = await client.journalLine.findMany({
    // A reversed entry and its reversal cancel out: left out, so they do not distort the ages.
    where: { companyId: company.id, entry: { status: "POSTED", reversedAt: null, reversalOfId: null }, accountId: { in: accounts.map((a) => a.id) }, date: { lte: dbDay(asOfKey) }, ...(departmentId ? { departmentId } : {}) },
    select: { date: true, debit: true, credit: true, partnerKey: true, partnerName: true, departmentId: true },
  });
  const sign = side === "suppliers" ? -1 : 1;
  const by = new Map();
  for (const l of lines) {
    const key = l.partnerKey || "(none)";
    if (!by.has(key)) by.set(key, { key, name: l.partnerName || "Without a name", departmentIds: new Set(), lines: [] });
    const p = by.get(key);
    if (l.partnerName) p.name = l.partnerName;
    if (l.departmentId) p.departmentIds.add(l.departmentId);
    p.lines.push({ dateKey: l.date.toISOString().slice(0, 10), amount: sign * (l.debit - l.credit) });
  }
  const rows = [...by.values()]
    .map((p) => ({ key: p.key, name: p.name, departmentIds: [...p.departmentIds], ...ageLines(p.lines, asOfKey) }))
    .filter((r) => r.owed || r.ahead)
    .sort((a, b) => b.owed - a.owed || b.ahead - a.ahead);
  const totals = { owed: 0, ahead: 0, buckets: Object.fromEntries(BUCKETS.map(([k]) => [k, 0])) };
  for (const r of rows) {
    totals.owed += r.owed;
    totals.ahead += r.ahead;
    for (const [k] of BUCKETS) totals.buckets[k] += r.buckets[k];
  }
  return { rows, totals };
}
