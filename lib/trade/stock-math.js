/**
 * Stock arithmetic of shops and bars (pure; safe for the browser): quantities with 3 decimals
 * (kg, litres), average cost, the value of each movement, a cart's totals, margins.
 *
 *   average cost after a purchase = (qty × cost + bought × unit cost) ÷ (qty + bought)
 *   value of a movement            = quantity × unit cost (signed: + in, − out)
 *   stock value                     = Σ values = quantity × average cost (± rounding)
 */

export const qty = (v) => Math.round(Number(v || 0) * 1000) / 1000;
const int = (v) => Math.round(Number(v || 0));

/** The new average cost when `bought` units at `unitCost` join `quantity` units at `cost`. */
export function averageCost(quantity, cost, bought, unitCost) {
  const q = Math.max(0, qty(quantity));
  const b = qty(bought);
  if (b <= 0) return int(cost);
  if (q <= 0) return int(unitCost);
  return Math.round((q * int(cost) + b * int(unitCost)) / (q + b));
}

/** Signed value of a movement at a unit cost. */
export function movementValue(quantity, unitCost) {
  return Math.round(qty(quantity) * int(unitCost));
}

/** Whether a product is low (stock kept, a level set, at or under it). */
export function isLow(p) {
  return p.kind !== "SERVICE" && qty(p.lowStock) > 0 && qty(p.quantity) <= qty(p.lowStock);
}

/**
 * Totals of a cart: [{ productId, name, quantity, unitPrice }] and a discount spread over the lines
 * in proportion (the last line takes the rounding). Returns lines with total / discount / net.
 */
export function cartTotals(lines, discount = 0) {
  const ls = lines.map((l) => ({ ...l, quantity: qty(l.quantity), unitPrice: int(l.unitPrice), total: Math.round(qty(l.quantity) * int(l.unitPrice)) }));
  const gross = ls.reduce((s, l) => s + l.total, 0);
  const d = Math.min(Math.max(0, int(discount)), gross);
  let left = d;
  ls.forEach((l, i) => {
    const share = i === ls.length - 1 ? left : gross ? Math.floor((d * l.total) / gross) : 0;
    l.discount = share;
    l.net = l.total - share;
    left -= share;
  });
  return { lines: ls, gross, discount: d, net: gross - d };
}

/** Margin of sold lines: [{ total, discount, quantity, unitCost }] → revenue, cost, margin, %. */
export function margin(lines) {
  const revenue = lines.reduce((s, l) => s + int(l.total) - int(l.discount), 0);
  const cost = lines.reduce((s, l) => s + Math.round(qty(l.quantity) * int(l.unitCost)), 0);
  return { revenue, cost, margin: revenue - cost, pct: revenue ? Math.round(((revenue - cost) / revenue) * 1000) / 10 : null };
}

/** "PR-0007" style product code from a sequence number. */
export function productCode(n) {
  return `PR-${String(n).padStart(4, "0")}`;
}

/**
 * Crates and deposits (bar) from movements: [{ kind, quantity, amount }]. Suppliers' moves are in
 * crates; customers' moves (CUSTOMER_OUT / CUSTOMER_BACK) are in bottles.
 */
export function packagingBalances(moves) {
  const b = { received: 0, returned: 0, customerOut: 0, customerBack: 0, broken: 0, counted: 0, depositPaid: 0, depositBack: 0, depositReceived: 0, depositRefunded: 0, depositLost: 0 };
  for (const m of moves) {
    const q = int(m.quantity);
    const a = int(m.amount);
    if (m.kind === "RECEIVED") {
      b.received += q;
      b.depositPaid += a;
    } else if (m.kind === "RETURNED") {
      b.returned += q;
      b.depositBack += a;
    } else if (m.kind === "CUSTOMER_OUT") {
      b.customerOut += q;
      b.depositReceived += a;
    } else if (m.kind === "CUSTOMER_BACK") {
      b.customerBack += q;
      b.depositRefunded += a;
    } else if (m.kind === "BROKEN") {
      b.broken += q;
      b.depositLost += a;
    } else if (m.kind === "COUNT") b.counted += q;
  }
  // Crates owed back to suppliers; crates here (full or empty); bottles out with customers.
  b.owedToSuppliers = b.received - b.returned - b.broken;
  b.onHand = b.received - b.returned - b.broken + b.counted;
  b.bottlesWithCustomers = b.customerOut - b.customerBack;
  b.depositsWithSuppliers = b.depositPaid - b.depositBack - b.depositLost;
  b.depositsHeldForCustomers = b.depositReceived - b.depositRefunded;
  return b;
}
