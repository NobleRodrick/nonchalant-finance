/**
 * A tenant's account on one contract, from plain rows (owner's rules, docs/PROPERTY_RENTAL_PLAN.md):
 *
 *   items        rent months (lib/property/rent-schedule) + charges (utilities, cleaning, damages …)
 *   paid         what allocations (payments, deposit uses, waivers) gave each item
 *   credit       money received and not allocated yet (an advance): it pays the oldest open items
 *                automatically, here in the computation and in the database at the next payment
 *   balance      amount − paid − credit applied, per item; outstanding = balance of items already due
 *
 * Items are ordered by due date, then rent before charges of the same month, then month. Pure
 * module (safe for client components; unit-tested).
 */
import { monthLabel } from "./rent-schedule";

export const CHARGE_KIND_LABELS = {
  RENT: "Rent",
  ELECTRICITY: "Electricity",
  WATER: "Water",
  INTERNET: "Internet",
  CLEANING: "Cleaning",
  SECURITY: "Security",
  WASTE: "Waste collection",
  MAINTENANCE: "Maintenance",
  DAMAGE: "Damages",
  LATE_FEE: "Late fee",
  OTHER: "Other",
};

export const ACCOUNT_STATUS_LABELS = { PAID: "Paid", PARTLY: "Partially paid", UNPAID: "Unpaid", OVERDUE: "Overdue", ADVANCE: "Paid ahead", NONE: "Nothing due" };
export const ACCOUNT_STATUS_TONES = { PAID: "emerald", PARTLY: "amber", UNPAID: "slate", OVERDUE: "rose", ADVANCE: "sky", NONE: "slate" };

const int = (v) => Math.round(Number(v) || 0);
const DAY = 86400000;
const daysLate = (dueKey, todayKey) => Math.max(0, Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${dueKey}T00:00:00Z`)) / DAY));

/** The key of an item: "rent:2026-11" or "charge:<id>". */
export const itemKey = (i) => (i.chargeId ? `charge:${i.chargeId}` : `rent:${i.monthKey}`);

function order(a, b) {
  return a.dueKey.localeCompare(b.dueKey) || (a.kind === "RENT" ? 0 : 1) - (b.kind === "RENT" ? 0 : 1) || a.monthKey.localeCompare(b.monthKey) || a.label.localeCompare(b.label);
}

/**
 * `schedule`: rent months; `charges`: [{ id, kind, label, monthKey, dueKey, amount, voidedAt }];
 * `allocations`: [{ monthKey | chargeId, amount, source, voidedAt }] (source WAIVER: forgiven, no money); `received`: money paid for the
 * contract (payments − refunds) + deposit applied (what allocations may draw on).
 */
export function leaseAccount({ schedule = [], charges = [], allocations = [], received = 0, todayKey }) {
  const live = allocations.filter((a) => !a.voidedAt);
  const paidOf = new Map();
  for (const a of live) {
    const k = a.chargeId ? `charge:${a.chargeId}` : `rent:${a.monthKey}`;
    paidOf.set(k, (paidOf.get(k) || 0) + int(a.amount));
  }
  const items = [
    ...schedule.map((m) => ({ kind: "RENT", monthKey: m.monthKey, chargeId: null, label: `Rent ${monthLabel(m.monthKey)}${m.prorated ? ` (${m.days} of ${m.daysInMonth} days)` : ""}`, dueKey: m.dueKey, amount: int(m.amount) })),
    ...charges.filter((c) => !c.voidedAt).map((c) => ({ kind: c.kind, monthKey: c.monthKey, chargeId: c.id, referenceNo: c.referenceNo, label: c.label || CHARGE_KIND_LABELS[c.kind], dueKey: c.dueKey, amount: int(c.amount) })),
  ].sort(order);

  // Waivers forgive a debt; they draw on no money received.
  const allocated = live.filter((a) => a.source !== "WAIVER").reduce((s, a) => s + int(a.amount), 0);
  let credit = Math.max(0, int(received) - allocated);
  const creditStart = credit;
  for (const it of items) {
    it.paid = Math.min(it.amount, paidOf.get(itemKey(it)) || 0);
    const open = it.amount - it.paid;
    it.byCredit = Math.min(open, credit);
    credit -= it.byCredit;
    it.balance = open - it.byCredit;
    it.due = it.dueKey <= todayKey;
    it.overdue = it.due && it.dueKey < todayKey && it.balance > 0;
    it.daysOverdue = it.overdue ? daysLate(it.dueKey, todayKey) : 0;
    it.status = it.balance === 0 ? "PAID" : it.paid + it.byCredit > 0 ? "PARTLY" : "UNPAID";
  }

  const dueItems = items.filter((i) => i.due);
  const owed = dueItems.filter((i) => i.balance > 0);
  const byKind = {};
  for (const i of owed) byKind[i.kind] = (byKind[i.kind] || 0) + i.balance;
  const rentOwed = owed.filter((i) => i.kind === "RENT");
  const oldest = owed[0] || null;
  const dueTotal = dueItems.reduce((s, i) => s + i.amount, 0);
  const outstanding = owed.reduce((s, i) => s + i.balance, 0);
  const overdueAmount = owed.filter((i) => i.overdue).reduce((s, i) => s + i.balance, 0);
  const paidAhead = items.filter((i) => !i.due).reduce((s, i) => s + i.paid + i.byCredit, 0);
  const next = items.find((i) => !i.due && i.balance > 0) || null;
  const status = outstanding > 0 ? (overdueAmount > 0 ? "OVERDUE" : dueItems.some((i) => i.paid + i.byCredit > 0 && i.balance > 0) ? "PARTLY" : "UNPAID") : paidAhead > 0 || credit > 0 ? "ADVANCE" : dueTotal > 0 ? "PAID" : "NONE";
  return {
    items,
    dueTotal,
    paidTotal: dueItems.reduce((s, i) => s + i.paid + i.byCredit, 0),
    outstanding,
    overdue: overdueAmount,
    byKind,
    rentOutstanding: byKind.RENT || 0,
    utilitiesOutstanding: outstanding - (byKind.RENT || 0),
    monthsOwed: rentOwed.length,
    oldestDueKey: oldest?.dueKey || null,
    daysOverdue: oldest?.overdue ? oldest.daysOverdue : 0,
    credit, // advance left after paying every item shown
    creditStart,
    paidAhead,
    next,
    status,
  };
}

/**
 * The split of `amount` proposed for a new payment: the oldest open items first (everything
 * already due, then the next ones), on the balances of `account` (credit already applied).
 * Returns { lines: [{ key, kind, monthKey, chargeId, label, amount }], advance }.
 */
export function proposeAllocation(account, amount) {
  let left = int(amount);
  const lines = [];
  for (const it of account.items) {
    if (left <= 0) break;
    if (it.balance <= 0) continue;
    const take = Math.min(left, it.balance);
    lines.push({ key: itemKey(it), kind: it.kind, monthKey: it.chargeId ? null : it.monthKey, chargeId: it.chargeId, label: it.label, amount: take });
    left -= take;
  }
  return { lines, advance: left };
}

/**
 * Checks a split chosen by hand against the account: every line names an open item, no item gets
 * more than its balance, the total does not exceed `amount`. Returns the cleaned lines and the
 * advance, or throws an Error with the reason.
 */
export function checkAllocation(account, amount, lines) {
  const open = new Map(account.items.map((i) => [itemKey(i), i]));
  const used = new Map();
  const out = [];
  let total = 0;
  for (const l of lines || []) {
    const v = int(l.amount);
    if (!v) continue;
    if (v < 0) throw new Error("An amount of the split is negative.");
    const key = l.key || (l.chargeId ? `charge:${l.chargeId}` : `rent:${l.monthKey}`);
    const it = open.get(key);
    if (!it) throw new Error("The split names a month or a charge that is not on this contract.");
    const already = used.get(key) || 0;
    if (already + v > it.balance) throw new Error(`${it.label}: only ${it.balance} FCFA is still owed.`);
    used.set(key, already + v);
    total += v;
    out.push({ key, kind: it.kind, monthKey: it.chargeId ? null : it.monthKey, chargeId: it.chargeId, label: it.label, amount: v });
  }
  if (total > int(amount)) throw new Error("The split adds up to more than the amount received.");
  return { lines: out, advance: int(amount) - total };
}

/** What happened to a contract's deposit (pure). */
export function depositStatus(d) {
  if (!d.received) return d.required ? "NOT_PAID" : "NONE";
  if (d.held > 0) return "PENDING";
  if (d.refunded >= d.received) return "REFUNDED";
  if (d.refunded > 0) return "PARTLY_REFUNDED";
  return "USED";
}

export const DEPOSIT_STATUS_LABELS = { NONE: "No deposit", NOT_PAID: "Not paid yet", PENDING: "Held", REFUNDED: "Fully refunded", PARTLY_REFUNDED: "Partly refunded, rest used", USED: "Used for rent, charges or damages" };
