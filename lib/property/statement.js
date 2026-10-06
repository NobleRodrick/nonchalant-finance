/**
 * A tenant's statement (requirement §31): opening balance + rent charged + utilities + other
 * charges − payments (and deposit used, amounts forgiven) + refunds = closing balance, line by
 * line in date order, over [fromKey, toKey]. Pure (unit-tested).
 *
 * `items`: account items (rent months and charges: { dueKey, label, kind, amount });
 * `credits`: [{ dateKey, label, amount, kind: PAYMENT | DEPOSIT | WAIVER | REFUND, referenceNo }]
 * (refunds increase the balance).
 */
export function tenantStatement({ items, credits, fromKey = "0000-00-00", toKey = "9999-99-99" }) {
  const moves = [
    ...items.map((i) => ({ dateKey: i.dueKey, label: i.label, kind: i.kind, debit: i.amount, credit: 0, referenceNo: i.referenceNo || null })),
    ...credits.map((c) => (c.kind === "REFUND" ? { dateKey: c.dateKey, label: c.label, kind: c.kind, debit: c.amount, credit: 0, referenceNo: c.referenceNo || null } : { dateKey: c.dateKey, label: c.label, kind: c.kind, debit: 0, credit: c.amount, referenceNo: c.referenceNo || null })),
  ].sort((a, b) => a.dateKey.localeCompare(b.dateKey) || b.debit - a.debit);
  let opening = 0;
  for (const m of moves) if (m.dateKey < fromKey) opening += m.debit - m.credit;
  let balance = opening;
  const lines = [];
  const totals = { rent: 0, utilities: 0, other: 0, payments: 0, deposit: 0, waived: 0, refunds: 0 };
  for (const m of moves) {
    if (m.dateKey < fromKey || m.dateKey > toKey) continue;
    balance += m.debit - m.credit;
    lines.push({ ...m, balance });
    if (m.kind === "RENT") totals.rent += m.debit;
    else if (["ELECTRICITY", "WATER", "INTERNET", "CLEANING", "SECURITY", "WASTE"].includes(m.kind)) totals.utilities += m.debit;
    else if (m.kind === "PAYMENT") totals.payments += m.credit;
    else if (m.kind === "DEPOSIT") totals.deposit += m.credit;
    else if (m.kind === "WAIVER") totals.waived += m.credit;
    else if (m.kind === "REFUND") totals.refunds += m.debit;
    else totals.other += m.debit;
  }
  return { opening, lines, closing: balance, totals };
}
