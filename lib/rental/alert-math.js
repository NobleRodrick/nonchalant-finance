/**
 * What needs attention in an event rental department today (the dashboard's warnings, the
 * morning alert and the daily report all use this list). Pure module (unit-tested).
 *
 * `orders`: open bookings shaped by order-queries.shapeOrder; `items`: the stock sheet;
 * `incidents`: open damages and losses; `refused`: double bookings refused recently;
 * `unvalidated`: expenses waiting for approval { count, amount }.
 */
import { addDaysToKey } from "@/lib/timezone";

const SOON_DAYS = 7; // "upcoming" events
const PREPARE_DAYS = 2; // items leave within this many days: prepare them

const sum = (rows, f) => rows.reduce((s, r) => s + f(r), 0);
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

export function rentalWarnings({ orders = [], items = [], incidents = [], refused = [], unvalidated = { count: 0, amount: 0 }, todayKey }) {
  const soon = addDaysToKey(todayKey, SOON_DAYS);
  const prepareBy = addDaysToKey(todayKey, PREPARE_DAYS);
  const out = [];
  const add = (w) => w.count && out.push(w);

  const late = orders.filter((o) => o.lateReturn);
  add({ key: "late-returns", tone: "bad", count: late.length, title: `${plural(late.length, "booking")} not returned on time`, detail: "Items still out after their return date: call the customer.", href: "/bookings?status=DISPATCHED", rows: late.map((o) => ({ id: o.id, label: `${o.referenceNo} · ${o.client?.name}`, note: `due back ${o.returnDateKey}`, href: `/bookings/${o.id}` })) });

  const missing = incidents.filter((i) => i.kind === "MISSING");
  add({ key: "missing", tone: "bad", count: missing.length, title: `${plural(sum(missing, (i) => i.quantity), "item")} missing to settle`, detail: "Charge the customer, record the loss, or mark them found.", href: "/damages", rows: missing.map((i) => ({ id: i.id, label: `${i.quantity} × ${i.item?.name}`, note: i.order?.referenceNo, href: "/damages" })) });

  const overdue = orders.filter((o) => o.overdue);
  add({ key: "overdue", tone: "bad", count: overdue.length, amount: sum(overdue, (o) => o.figures.balance), title: `${plural(overdue.length, "overdue payment")}`, detail: "Balances owed after their deadline.", href: "/bookings?payment=overdue&status=all", rows: overdue.map((o) => ({ id: o.id, label: `${o.referenceNo} · ${o.client?.name}`, amount: o.figures.balance, href: `/bookings/${o.id}` })) });

  const unpaid = orders.filter((o) => ["CONFIRMED", "PREPARING"].includes(o.status) && o.eventDateKey >= todayKey && o.eventDateKey <= soon && o.figures.balance > 0 && !o.overdue);
  add({ key: "unpaid-soon", tone: "warn", count: unpaid.length, amount: sum(unpaid, (o) => o.figures.balance), title: `${plural(unpaid.length, "event")} in the next ${SOON_DAYS} days not fully paid`, detail: "Collect the balance before the items leave.", href: "/bookings?payment=unpaid", rows: unpaid.map((o) => ({ id: o.id, label: `${o.eventDateKey} · ${o.referenceNo} · ${o.client?.name}`, amount: o.figures.balance, href: `/bookings/${o.id}` })) });

  const prepare = orders.filter((o) => o.status === "CONFIRMED" && o.dispatchDateKey <= prepareBy);
  add({ key: "prepare", tone: "warn", count: prepare.length, title: `${plural(prepare.length, "booking")} to prepare`, detail: `Items leave within ${PREPARE_DAYS} days and the booking is not marked as being prepared.`, href: "/bookings?status=CONFIRMED", rows: prepare.map((o) => ({ id: o.id, label: `${o.referenceNo} · ${o.eventType} · ${o.client?.name}`, note: `leaves ${o.dispatchDateKey}`, href: `/bookings/${o.id}` })) });

  const low = items.filter((i) => i.alert);
  add({ key: "low-stock", tone: "warn", count: low.length, title: `${plural(low.length, "item")} running low`, detail: "At or under their low-stock level, or none left in the store.", href: "/stock?status=low", rows: low.map((i) => ({ id: i.id, label: `${i.code} · ${i.name}`, note: `${i.inStock} in the store`, href: `/stock/${i.id}` })) });

  const damaged = items.filter((i) => i.damaged > 0);
  add({ key: "damaged", tone: "warn", count: damaged.length, title: `${plural(sum(damaged, (i) => i.damaged), "damaged item")} waiting`, detail: "Send them to repair or write them off.", href: "/damages", rows: damaged.map((i) => ({ id: i.id, label: i.name, note: `${i.damaged} damaged`, href: `/stock/${i.id}` })) });

  add({ key: "refused", tone: "info", count: refused.length, title: `${plural(refused.length, "booking")} refused for lack of items (last 7 days)`, detail: "Demand you could not serve: consider buying more of these items.", href: "/stock", rows: refused.map((r) => ({ id: r.id, label: r.label, note: r.dateKey })) });

  add({ key: "approvals", tone: "info", count: unvalidated.count, amount: unvalidated.amount, title: `${plural(unvalidated.count, "expense")} waiting for approval`, detail: "Recorded by one person, approved by another.", href: "/money?pending=1", rows: [] });

  return out;
}

/** One line for a notification: "2 bookings not returned on time · 1 overdue payment …". */
export function warningsLine(warnings) {
  return warnings.map((w) => w.title).join(" · ");
}
