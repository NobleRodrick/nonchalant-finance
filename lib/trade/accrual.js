/**
 * What shops and bars add to the money records in the statements and the books: the change in the
 * stock of goods (purchases not yet sold, goods lost: cost of goods sold = purchases − stock change),
 * and crates broken or lost (their deposit is a cost). Opening stock is an opening balance, never
 * profit. Same sources for the company statements (Simple) and the ledger (Full accounting).
 */
import { db } from "@/lib/prisma";
import { rangeBounds, toDateKey } from "@/lib/timezone";
import { TRADE_DOMAINS } from "@/lib/domains/trade";
import { STOCK_GROUPS, stockGroup } from "./stock-math";

export { STOCK_GROUPS, stockGroup };

/** Movements and broken crates of a department in [fromKey, toKey]. */
async function parts(client, departmentId, fromKey, toKey, timeZone) {
  const { start, end } = rangeBounds(fromKey, toKey, timeZone);
  const [moves, broken] = await Promise.all([
    client.tradeMovement.findMany({ where: { departmentId, date: { gte: start, lte: end } }, select: { id: true, kind: true, value: true, date: true, product: { select: { kind: true } } } }),
    client.packagingMovement.findMany({ where: { departmentId, kind: "BROKEN", voidedAt: null, date: { gte: start, lte: end } }, select: { id: true, amount: true, quantity: true, date: true, packaging: { select: { name: true } } } }),
  ]);
  return { moves: moves.map((m) => ({ ...m, dateKey: toDateKey(m.date, timeZone) })), broken: broken.map((b) => ({ ...b, dateKey: toDateKey(b.date, timeZone) })) };
}

/** { [departmentId]: { stockChange, assetLosses, days } } — stockChange > 0 is a cost (stock went down). */
export async function tradeStatementFigures({ departments, fromKey, toKey, timeZone, client = db }) {
  const out = {};
  await Promise.all(
    departments
      .filter((d) => TRADE_DOMAINS.includes(d.domain))
      .map(async (d) => {
        const p = await parts(client, d.id, fromKey, toKey, timeZone);
        const days = {};
        const day = (k) => (days[k] ||= { revenue: 0, assetLosses: 0, costs: 0 });
        let stockChange = 0;
        for (const m of p.moves) {
          if (m.kind === "OPENING") continue;
          stockChange -= m.value;
          day(m.dateKey).costs -= m.value;
        }
        let assetLosses = 0;
        for (const b of p.broken) {
          assetLosses += b.amount;
          day(b.dateKey).assetLosses += b.amount;
        }
        if (stockChange || assetLosses) out[d.id] = { stockChange, assetLosses, days };
      })
  );
  return out;
}

/**
 * Ledger facts of a shop or bar for [fromKey, toKey] (one month): the month's stock change (dated
 * on its last movement), each opening count (an opening balance), each crate broken.
 */
export async function tradeRecognitions({ department, fromKey, toKey, timeZone, client = db }) {
  const p = await parts(client, department.id, fromKey, toKey, timeZone);
  const out = [];
  const regular = p.moves.filter((m) => m.kind !== "OPENING");
  for (const [key, g] of Object.entries(STOCK_GROUPS)) {
    const mine = regular.filter((m) => stockGroup(department.domain, m.product?.kind) === key);
    const change = mine.reduce((s, m) => s + m.value, 0);
    if (!change) continue;
    const last = mine.map((m) => m.dateKey).sort().at(-1);
    out.push({ sourceKey: `stock-change:${department.id}:${fromKey.slice(0, 7)}${g.suffix}`, kind: "stock-change", stockRole: g.stockRole, changeRole: g.changeRole, dateKey: last, amount: change, label: `Change in stock of ${g.label} ${fromKey.slice(0, 7)}`, departmentId: department.id });
  }
  for (const m of p.moves.filter((x) => x.kind === "OPENING" && x.value)) {
    out.push({ sourceKey: `opening-stock:${m.id}`, kind: "opening-stock", stockRole: STOCK_GROUPS[stockGroup(department.domain, m.product?.kind)].stockRole, dateKey: m.dateKey, amount: m.value, label: "Opening stock", departmentId: department.id });
  }
  for (const b of p.broken.filter((x) => x.amount)) {
    out.push({ sourceKey: `crates-broken:${b.id}`, kind: "loss", assetRole: "PACKAGING_PAID", dateKey: b.dateKey, amount: b.amount, label: `${b.quantity} × ${b.packaging.name} broken or lost`, departmentId: department.id });
  }
  return out;
}
