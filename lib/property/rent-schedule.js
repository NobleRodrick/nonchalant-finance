/**
 * The rent of a contract, month by month (owner's rules, docs/PROPERTY_RENTAL_PLAN.md):
 *
 *   - rent runs from the start date; a first month started after the 1st is prorated by days
 *     (rent × days left ÷ days of the month); a last month ended before its end likewise
 *   - the monthly rent of a month is the contract's latest rate whose `fromMonth` ≤ that month
 *     (price history: old prices stay for the old months)
 *   - months are billed in blocks of `monthsPerBill` (1, 3, 6, 12) from the start month; every
 *     month of a block is due on the block's due day (the contract's `dueDay` of its first month,
 *     never before the start date)
 *
 * Nothing here is stored: the schedule is computed, so a rent change or a move-out date applies
 * at once and no monthly job is needed. Pure module (unit-tested).
 */

const pad = (n) => String(n).padStart(2, "0");

/** "2026-11-14" → "2026-11". */
export const monthOf = (dateKey) => String(dateKey).slice(0, 7);

/** "2026-11" + 3 → "2027-02". */
export function addMonths(monthKey, n) {
  const [y, m] = monthKey.split("-").map(Number);
  const t = y * 12 + (m - 1) + n;
  return `${Math.floor(t / 12)}-${pad((t % 12) + 1)}`;
}

/** Months from `a` to `b` ("2026-01" → "2026-03" = 2). */
export function monthsBetween(a, b) {
  const [y1, m1] = a.split("-").map(Number);
  const [y2, m2] = b.split("-").map(Number);
  return (y2 - y1) * 12 + (m2 - m1);
}

export function daysInMonth(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** The `day` of a month, clamped to its length ("2026-02", 31 → "2026-02-28"). */
export function dayOfMonth(monthKey, day) {
  return `${monthKey}-${pad(Math.min(day, daysInMonth(monthKey)))}`;
}

/** The rate of `monthKey`: the latest rate from that month or before, else `base`. */
export function rateFor(rates, monthKey, base) {
  let best = null;
  for (const r of rates || []) if (r.fromMonth <= monthKey && (!best || r.fromMonth >= best.fromMonth)) best = r;
  return best ? Number(best.amount) : Number(base) || 0;
}

/** "January 2026" / "Jan 2026". */
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export function monthLabel(monthKey, short = false) {
  const [y, m] = monthKey.split("-").map(Number);
  return short ? `${MONTHS[m - 1].slice(0, 3)} ${y}` : `${MONTHS[m - 1]} ${y}`;
}

/**
 * Rent months of a contract up to `throughMonth` (included):
 * [{ monthKey, amount, monthlyRate, days, daysInMonth, prorated, dueKey }].
 * `lease`: { startKey, moveOutKey (last day billed, optional), rent, dueDay, monthsPerBill, rates }.
 */
export function rentSchedule(lease, throughMonth) {
  const { startKey, moveOutKey = null } = lease;
  if (!startKey) return [];
  const dueDay = Math.min(28, Math.max(1, Number(lease.dueDay) || 5));
  const per = [1, 3, 6, 12].includes(Number(lease.monthsPerBill)) ? Number(lease.monthsPerBill) : 1;
  const first = monthOf(startKey);
  const lastByMoveOut = moveOutKey ? monthOf(moveOutKey) : null;
  const last = lastByMoveOut && lastByMoveOut < throughMonth ? lastByMoveOut : throughMonth;
  if (moveOutKey && moveOutKey < startKey) return [];
  const out = [];
  for (let mk = first, i = 0; mk <= last; mk = addMonths(mk, 1), i += 1) {
    const dim = daysInMonth(mk);
    const fromDay = mk === first ? Number(startKey.slice(8, 10)) : 1;
    const toDay = moveOutKey && mk === monthOf(moveOutKey) ? Number(moveOutKey.slice(8, 10)) : dim;
    const days = Math.max(0, toDay - fromDay + 1);
    const monthlyRate = rateFor(lease.rates, mk, lease.rent);
    const prorated = days < dim;
    const amount = prorated ? Math.round((monthlyRate * days) / dim) : monthlyRate;
    const blockFirst = addMonths(first, Math.floor(i / per) * per);
    let dueKey = dayOfMonth(blockFirst, dueDay);
    if (dueKey < startKey) dueKey = startKey;
    if (amount > 0) out.push({ monthKey: mk, amount, monthlyRate, days, daysInMonth: dim, prorated, dueKey });
  }
  return out;
}

/** The month up to which a contract's rent is shown: its last month, or `ahead` months after today. */
export function scheduleHorizon(lease, todayKey, ahead = 2) {
  const horizon = addMonths(monthOf(todayKey), ahead);
  const blockEnd = lease.startKey ? addMonths(monthOf(lease.startKey), Math.ceil((monthsBetween(monthOf(lease.startKey), horizon) + 1) / (lease.monthsPerBill || 1)) * (lease.monthsPerBill || 1) - 1) : horizon;
  const h = blockEnd > horizon ? blockEnd : horizon;
  return lease.moveOutKey && monthOf(lease.moveOutKey) < h ? monthOf(lease.moveOutKey) : h;
}
