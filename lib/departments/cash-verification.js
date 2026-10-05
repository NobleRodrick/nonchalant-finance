/** Cash verification of a department, shared by every type that receives money (pure). */

const int = (v) => Math.round(Number(v) || 0);

/**
 * Cash verification: recorded as received (by person and method), counted, handed over, still to
 * hand over, discrepancies. `receipts`: [{ receivedBy, method, amount }]; `counts`: cash counts of
 * the period [{ dateKey, countedCash, expectedCash, variance }].
 */
export function cashVerification({ receipts = [], counts = [], cashFlow, drawerNow }) {
  const people = new Map();
  for (const r of receipts) {
    const k = r.receivedBy || "Unknown";
    if (!people.has(k)) people.set(k, { receivedBy: k, CASH: 0, MOMO: 0, BANK_TRANSFER: 0, total: 0, count: 0 });
    const p = people.get(k);
    p[r.method] = (p[r.method] || 0) + int(r.amount);
    p.total += int(r.amount);
    p.count += 1;
  }
  const variance = counts.reduce((s, c) => s + int(c.variance), 0);
  return {
    byPerson: [...people.values()].sort((a, b) => b.total - a.total),
    recorded: cashFlow.receivedFromClients,
    recordedCash: int(cashFlow.byMethod.CASH),
    handedOver: cashFlow.handedOver,
    toHandOver: Math.max(0, int(drawerNow?.shouldRemain)),
    counts,
    countVariance: variance,
    disputed: cashFlow.disputed,
    discrepancies: Math.abs(variance) + cashFlow.disputed,
  };
}

