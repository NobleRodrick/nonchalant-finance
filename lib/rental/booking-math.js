/**
 * Bookings of an event rental department as pure functions: totals, statuses and the stage shown
 * to people, and the availability of items over a booking's days (owner's decision: items are
 * reserved from the dispatch date to the return date). Pure module (safe for client components;
 * unit-tested). Dates are "YYYY-MM-DD" keys.
 */
import { addDaysToKey, listDateKeys } from "@/lib/timezone";

export const ORDER_STATUS_LABELS = {
  INQUIRY: "Inquiry",
  QUOTED: "Quotation sent",
  CONFIRMED: "Confirmed",
  PREPARING: "Preparation",
  DISPATCHED: "Items dispatched",
  RETURNED: "Items returned",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

/** What a charge added to a booking is for. */
export const CHARGE_KINDS = { DAMAGE: "Damaged or missing items", EXTRA_DAYS: "Extra days", TRANSPORT: "Transport", LABOUR: "Labour / set-up", OTHER: "Other" };

/** Bookings that hold their items (from dispatch to return). */
export const HOLDING_STATUSES = ["CONFIRMED", "PREPARING", "DISPATCHED"];
/** Bookings still in progress (not closed or cancelled). */
export const OPEN_STATUSES = ["INQUIRY", "QUOTED", "CONFIRMED", "PREPARING", "DISPATCHED", "RETURNED"];
/** Bookings whose lines and dates can still change. */
export const EDITABLE_STATUSES = ["INQUIRY", "QUOTED", "CONFIRMED", "PREPARING"];

/** The steps a booking may take from each status (dispatch and return have their own forms). */
export const NEXT_STEPS = {
  INQUIRY: ["quote", "confirm", "cancel"],
  QUOTED: ["confirm", "cancel"],
  CONFIRMED: ["prepare", "cancel"],
  PREPARING: ["cancel"],
  DISPATCHED: [],
  RETURNED: ["close"],
  CLOSED: [],
  CANCELLED: [],
};

/**
 * The stage shown to people (the ten stages of the requirements), from the stored status, the
 * money and the date: "Deposit paid", "Event completed" and "Fully paid" are computed.
 */
export function orderStage({ status, eventDateKey }, { paid = 0, balance = 0, total = 0 } = {}, todayKey) {
  if (status === "CANCELLED") return { key: "CANCELLED", label: "Cancelled", tone: "slate" };
  if (status === "CLOSED" || status === "RETURNED") {
    if (total > 0 && balance <= 0) return { key: "FULLY_PAID", label: status === "CLOSED" ? "Fully paid · closed" : "Fully paid", tone: "emerald" };
    return { key: status, label: ORDER_STATUS_LABELS[status], tone: status === "CLOSED" ? "slate" : "violet" };
  }
  if (status === "DISPATCHED") {
    if (todayKey && eventDateKey < todayKey) return { key: "EVENT_DONE", label: "Event completed", tone: "violet" };
    return { key: "DISPATCHED", label: "Items dispatched", tone: "sky" };
  }
  if (status === "PREPARING") return { key: "PREPARING", label: "Preparation", tone: "cyan" };
  if (status === "CONFIRMED") return paid > 0 ? { key: "DEPOSIT_PAID", label: "Deposit paid", tone: "emerald" } : { key: "CONFIRMED", label: "Booking confirmed", tone: "emerald" };
  if (status === "QUOTED") return { key: "QUOTED", label: "Quotation sent", tone: "amber" };
  return { key: "INQUIRY", label: "Inquiry", tone: "slate" };
}

const int = (v) => Math.round(Number(v) || 0);

/** Totals of the lines: items, services, discount, the price agreed. */
export function orderTotals(lines, discount = 0) {
  let itemsTotal = 0;
  let servicesTotal = 0;
  for (const l of lines) {
    const total = int(l.quantity) * int(l.unitPrice);
    if (l.kind === "SERVICE") servicesTotal += total;
    else itemsTotal += total;
  }
  const d = int(discount);
  return { itemsTotal, servicesTotal, discount: d, agreedPrice: Math.max(0, itemsTotal + servicesTotal - d) };
}

/** Dispatch the day before the event and return the day after, unless chosen otherwise. */
export function defaultRange(eventDateKey) {
  return { dispatchDateKey: addDaysToKey(eventDateKey, -1), returnDateKey: addDaysToKey(eventDateKey, 1) };
}

/** Number of days a booking holds its items (dispatch to return, both included). */
export const rangeDays = (fromKey, toKey) => listDateKeys(fromKey, toKey).length;

/**
 * Units a booking line holds: before dispatch, the quantity booked; once dispatched, the units
 * still out (issued − back − damaged − broken − missing).
 */
export function lineHolds(line, status) {
  if (status === "DISPATCHED") return Math.max(0, int(line.issued) - int(line.returned) - int(line.damaged) - int(line.broken) - int(line.missing));
  return int(line.quantity);
}

/**
 * The last day a booking holds its items: its return date, or today when its items are late
 * (dispatched and not back after the return date).
 */
export const holdUntil = (order, todayKey) => (order.status === "DISPATCHED" && todayKey && order.returnDateKey < todayKey ? todayKey : order.returnDateKey);

/**
 * Availability of items over [fromKey, toKey]. `items`: [{ id, name, owned, damaged, inRepair,
 * missing }] (units not usable are left out; units out at events are counted through their
 * bookings). `orders`: holding bookings [{ id, status, dispatchDateKey, returnDateKey, lines:
 * [{ itemId, quantity, issued, returned, damaged, broken, missing }] }] (the booking being changed
 * excluded). Returns { [itemId]: { usable, reserved (the busiest day), available, busiestDay } };
 * on a tie the busiest day is `preferDayKey` when it is one of them.
 */
export function availability(items, orders, fromKey, toKey, todayKey = null, preferDayKey = null) {
  const days = listDateKeys(fromKey, toKey);
  const out = {};
  for (const item of items) {
    const usable = int(item.owned) - int(item.damaged) - int(item.inRepair) - int(item.missing);
    out[item.id] = { usable, reserved: 0, available: usable, busiestDay: null };
  }
  const perDay = {};
  for (const o of orders) {
    if (!HOLDING_STATUSES.includes(o.status)) continue;
    const end = holdUntil(o, todayKey);
    if (o.dispatchDateKey > toKey || end < fromKey) continue;
    for (const l of o.lines || []) {
      if (!l.itemId || !out[l.itemId]) continue;
      const held = lineHolds(l, o.status);
      if (!held) continue;
      for (const day of days) {
        if (day < o.dispatchDateKey || day > end) continue;
        perDay[l.itemId] ||= {};
        perDay[l.itemId][day] = (perDay[l.itemId][day] || 0) + held;
      }
    }
  }
  for (const [itemId, byDay] of Object.entries(perDay)) {
    for (const [day, n] of Object.entries(byDay)) {
      // The busiest day; on a tie, the day asked about (the event date) is named.
      if (n > out[itemId].reserved || (n === out[itemId].reserved && day === preferDayKey)) Object.assign(out[itemId], { reserved: n, busiestDay: day });
    }
    out[itemId].available = out[itemId].usable - out[itemId].reserved;
  }
  return out;
}

/** Quantities asked per item (several lines of the same item are added). */
export function requestedByItem(lines) {
  const m = {};
  for (const l of lines) if (l.kind !== "SERVICE" && l.itemId) m[l.itemId] = (m[l.itemId] || 0) + int(l.quantity);
  return m;
}

/**
 * Items asked beyond what is available: [{ itemId, name, requested, available, day }] with the
 * message of the requirements ("Insufficient chairs available for 20 Nov 2026. Only 100 chairs are
 * available.").
 */
export function shortages(lines, avail, items, formatDay = (d) => d) {
  const names = Object.fromEntries(items.map((i) => [i.id, i.name]));
  return Object.entries(requestedByItem(lines))
    .filter(([id, q]) => q > Math.max(0, avail[id]?.available ?? 0))
    .map(([itemId, requested]) => {
      const a = avail[itemId] || { available: 0, busiestDay: null };
      const name = String(names[itemId] || "items").toLowerCase();
      const when = a.busiestDay ? ` for ${formatDay(a.busiestDay)}` : "";
      return { itemId, name: names[itemId], requested, available: Math.max(0, a.available), day: a.busiestDay, message: `Insufficient ${name} available${when}. Only ${Math.max(0, a.available)} ${name} ${Math.max(0, a.available) === 1 ? "is" : "are"} available.` };
    });
}
