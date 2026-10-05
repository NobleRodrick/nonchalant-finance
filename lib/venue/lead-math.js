/**
 * Leads (enquiries not yet booked), as pure functions: what is open, what needs a follow-up, and
 * the conversion from leads to confirmed bookings (dashboards, the Leads page and tests share them).
 *
 *   conversion rate = leads booked ÷ leads closed (booked + lost + cancelled)
 */
import { dateKeyOf } from "./dates";

export const LEAD_STATUS_LABELS = {
  NEW: "New",
  CONTACTED: "Contacted",
  FOLLOW_UP: "Follow-up required",
  NEGOTIATING: "Negotiating",
  BOOKED: "Booked",
  LOST: "Lost",
  CANCELLED: "Cancelled",
};
export const OPEN_LEAD_STATUSES = ["NEW", "CONTACTED", "FOLLOW_UP", "NEGOTIATING"];
export const CLOSED_LEAD_STATUSES = ["BOOKED", "LOST", "CANCELLED"];

const pct = (part, whole) => (whole ? Math.round((part / whole) * 1000) / 10 : null);

/** Counts and conversion of a list of leads. */
export function leadStats(leads = []) {
  const s = { total: leads.length, open: 0, booked: 0, lost: 0, cancelled: 0 };
  for (const l of leads) {
    if (OPEN_LEAD_STATUSES.includes(l.status)) s.open += 1;
    else if (l.status === "BOOKED") s.booked += 1;
    else if (l.status === "LOST") s.lost += 1;
    else if (l.status === "CANCELLED") s.cancelled += 1;
  }
  s.closed = s.booked + s.lost + s.cancelled;
  s.conversionRate = pct(s.booked, s.closed);
  s.bookedShare = pct(s.booked, s.total);
  return s;
}

/** Conversion by a key of the lead (source, person handling it). */
export function conversionBy(leads = [], keyOf) {
  const groups = new Map();
  for (const l of leads) {
    const k = keyOf(l) || "Unknown";
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(l);
  }
  return [...groups.entries()].map(([key, list]) => ({ key, ...leadStats(list) })).sort((a, b) => b.total - a.total || a.key.localeCompare(b.key));
}

/** Open leads whose follow-up is due on or before `todayKey` (overdue first). */
export function followUpsDue(leads = [], todayKey) {
  return leads
    .filter((l) => OPEN_LEAD_STATUSES.includes(l.status) && dateKeyOf(l.followUpDate ?? l.followUpKey) && dateKeyOf(l.followUpDate ?? l.followUpKey) <= todayKey)
    .map((l) => ({ ...l, overdue: dateKeyOf(l.followUpDate ?? l.followUpKey) < todayKey }))
    .sort((a, b) => String(dateKeyOf(a.followUpDate ?? a.followUpKey)).localeCompare(String(dateKeyOf(b.followUpDate ?? b.followUpKey))));
}
