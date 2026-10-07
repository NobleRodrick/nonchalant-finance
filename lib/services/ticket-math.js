/**
 * Arithmetic of job tickets (pressing, car wash, jobs) — pure, safe for the browser.
 *
 *   line total   = quantity × unit price (the price list: the variant's price, else the base price)
 *   subtotal     = Σ lines;  express surcharge = subtotal × % ;  total = subtotal + surcharge − discount
 *   commission   = PERCENT: line's share of the total × % ; FIXED: amount × quantity
 *   balance      = total − (payments − refunds)       (a cancelled ticket owes nothing)
 */

const int = (v) => Math.round(Number(v || 0));
const qty = (v) => Math.round(Number(v || 0) * 1000) / 1000;

export const STATUS_LABELS = { RECEIVED: "Received", IN_PROGRESS: "In progress", READY: "Ready", COLLECTED: "Collected", CANCELLED: "Cancelled" };
export const STATUS_TONES = { RECEIVED: "sky", IN_PROGRESS: "violet", READY: "amber", COLLECTED: "emerald", CANCELLED: "slate" };
export const CAR_WASH_LABELS = { RECEIVED: "Waiting", IN_PROGRESS: "Washing", READY: "Ready", COLLECTED: "Gone", CANCELLED: "Cancelled" };
export const NEXT_STEPS = { RECEIVED: ["start", "ready", "cancel"], IN_PROGRESS: ["ready", "cancel"], READY: ["collect", "cancel"], COLLECTED: [], CANCELLED: [] };

/** The price of a service for a variant (garment, vehicle type). */
export function priceOf(item, variant) {
  const prices = item?.prices && typeof item.prices === "object" ? item.prices : {};
  if (variant && prices[variant] !== undefined && prices[variant] !== null && prices[variant] !== "") return int(prices[variant]);
  return int(item?.basePrice);
}

/** Totals of a ticket's lines [{ quantity, unitPrice }] with an express surcharge and a discount. */
export function ticketTotals(lines, { surchargePct = 0, discount = 0 } = {}) {
  const ls = lines.map((l) => ({ ...l, quantity: qty(l.quantity), unitPrice: int(l.unitPrice), total: Math.round(qty(l.quantity) * int(l.unitPrice)) }));
  const subtotal = ls.reduce((s, l) => s + l.total, 0);
  const surcharge = Math.round((subtotal * Math.max(0, int(surchargePct))) / 100);
  const d = Math.min(Math.max(0, int(discount)), subtotal + surcharge);
  return { lines: ls, subtotal, surcharge, discount: d, total: subtotal + surcharge - d };
}

/**
 * Commission of each line (with a worker): PERCENT of the line's share of the ticket total (after
 * surcharge and discount), FIXED × quantity. `items`: { [itemId]: { commissionType, commissionValue } }.
 */
export function commissions(lines, items, { subtotal, total }) {
  return lines.map((l) => {
    const it = items[l.itemId];
    if (!l.workerId || !it || it.commissionType === "NONE") return 0;
    if (it.commissionType === "FIXED") return Math.round(int(it.commissionValue) * qty(l.quantity));
    const share = subtotal ? (int(l.total) * int(total)) / subtotal : 0;
    return Math.round((share * int(it.commissionValue)) / 100);
  });
}

/** Paid and balance of a ticket from its money records [{ type, status, amount }]. */
export function ticketMoney(ticket, money = []) {
  let paid = 0;
  for (const m of money) {
    if (m.status === "VOIDED") continue;
    if (m.type === "BOOKING_PAYMENT") paid += int(m.amount);
    else if (m.type === "BOOKING_REFUND") paid -= int(m.amount);
  }
  const due = ticket.status === "CANCELLED" ? 0 : int(ticket.total);
  return { total: int(ticket.total), paid, balance: due - paid, kept: ticket.status === "CANCELLED" ? Math.max(0, paid) : 0 };
}

/** Whether the next wash of a vehicle is free: every `every`-th collected wash (0: no loyalty). */
export function loyaltyFree(collectedBefore, every) {
  const n = int(every);
  return n > 1 && (int(collectedBefore) + 1) % n === 0;
}

/** Ready but not collected for `days` days or more (pressing: unclaimed items). */
export function isUnclaimed(ticket, todayKey, days = 30) {
  if (ticket.status !== "READY" || !ticket.readyAt) return false;
  const ready = (typeof ticket.readyAt === "string" ? ticket.readyAt : ticket.readyAt.toISOString()).slice(0, 10);
  return (Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${ready}T00:00:00Z`)) / 86400000 >= days;
}

/** Promised for a time already past and not ready. */
export function isLate(ticket, now = new Date()) {
  return ["RECEIVED", "IN_PROGRESS"].includes(ticket.status) && ticket.promisedAt && new Date(ticket.promisedAt) < now;
}

/** "Your clothes are ready" message (pressing) / "your vehicle" (car wash). */
export function readyMessage({ business, customer, referenceNo, balance, kind }) {
  const what = kind === "CAR_WASH" ? "your vehicle is ready" : "your items are ready for collection";
  const owe = balance > 0 ? ` Amount to pay: ${balance.toLocaleString("fr-FR").replace(/ /g, " ")} FCFA.` : "";
  return `Hello ${customer || ""}, ${business}: ${what} (ticket ${referenceNo}).${owe} Thank you!`.replace(/\s+/g, " ").trim();
}
