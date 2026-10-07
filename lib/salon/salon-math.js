/**
 * Arithmetic of appointments and memberships (salon, spa, gym) — pure, safe for the browser.
 */

const DAY = 86400000;
const keyDiff = (a, b) => Math.round((Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / DAY);

export const APPOINTMENT_LABELS = { BOOKED: "Booked", ARRIVED: "Arrived", NO_SHOW: "Did not come", CANCELLED: "Cancelled" };
export const APPOINTMENT_TONES = { BOOKED: "sky", ARRIVED: "emerald", NO_SHOW: "rose", CANCELLED: "slate" };
export const MEMBERSHIP_LABELS = { ACTIVE: "Active", NOT_STARTED: "Starts later", EXPIRED: "Expired", USED_UP: "Sessions used up", CANCELLED: "Cancelled" };
export const MEMBERSHIP_TONES = { ACTIVE: "emerald", NOT_STARTED: "sky", EXPIRED: "slate", USED_UP: "amber", CANCELLED: "slate" };

/** End of an appointment (ms). */
export const appointmentEnd = (a) => new Date(a.startAt).getTime() + (Number(a.minutes) || 60) * 60000;

/** Whether two appointments overlap in time. */
export function overlaps(a, b) {
  return new Date(a.startAt).getTime() < appointmentEnd(b) && new Date(b.startAt).getTime() < appointmentEnd(a);
}

/** The last day of a membership starting on `startKey` for `days` days (inclusive), or null. */
export function membershipEndKey(startKey, days) {
  if (!days) return null;
  return new Date(Date.parse(`${startKey}T00:00:00Z`) + (Number(days) - 1) * DAY).toISOString().slice(0, 10);
}

/**
 * State of a membership on `todayKey`: { status, daysLeft, sessionsLeft, usable }.
 * `m`: { status, startKey, endKey, sessionsTotal }, `used`: visits already counted.
 */
export function membershipState(m, used, todayKey) {
  const sessionsLeft = m.sessionsTotal ? Math.max(0, m.sessionsTotal - used) : null;
  const daysLeft = m.endKey ? keyDiff(m.endKey, todayKey) + 1 : null;
  let status = "ACTIVE";
  if (m.status === "CANCELLED") status = "CANCELLED";
  else if (m.startKey > todayKey) status = "NOT_STARTED";
  else if (m.endKey && m.endKey < todayKey) status = "EXPIRED";
  else if (sessionsLeft === 0) status = "USED_UP";
  return { status, daysLeft: daysLeft === null ? null : Math.max(0, daysLeft), sessionsLeft, usable: status === "ACTIVE" };
}

/** Ends within `days` days (or 1 session left): time to remind the member to renew. */
export function renewalDue(state, days = 7) {
  return state.status === "ACTIVE" && ((state.daysLeft !== null && state.daysLeft <= days) || (state.sessionsLeft !== null && state.sessionsLeft <= 1));
}

/** The WhatsApp reminder to renew. */
export function renewalMessage({ business, customer, plan, endKey, sessionsLeft }) {
  const when = sessionsLeft !== null && sessionsLeft <= 1 ? `you have ${sessionsLeft} session${sessionsLeft === 1 ? "" : "s"} left` : `it ends on ${endKey}`;
  return `Hello ${customer || ""}, ${business}: your ${plan} membership — ${when}. Renew it at your next visit to keep training with us. Thank you!`.replace(/\s+/g, " ").trim();
}

/** What needs attention (pure): memberships to renew, appointments of today not marked, no-shows. */
export function salonWarnings({ memberships = [], appointments = [], nowIso }) {
  const out = [];
  const add = (w) => w.count && out.push(w);
  const renew = memberships.filter((m) => m.renew);
  add({ key: "renew", tone: "warn", count: renew.length, title: `${renew.length} membership(s) ending soon`, detail: "Remind the members to renew (WhatsApp from the membership).", href: "/memberships?view=renew", rows: renew.map((m) => ({ id: m.id, label: `${m.customer} · ${m.plan}`, note: m.state.sessionsLeft !== null && m.state.sessionsLeft <= 1 ? `${m.state.sessionsLeft} session(s) left` : `ends ${m.endKey}` })) });
  const late = appointments.filter((a) => a.status === "BOOKED" && nowIso && a.startAt < new Date(Date.parse(nowIso) - 30 * 60000).toISOString());
  add({ key: "late", tone: "info", count: late.length, title: `${late.length} appointment(s) past and not marked`, detail: "Mark them arrived, did not come, or cancelled.", href: "/appointments", rows: late.map((a) => ({ id: a.id, label: `${a.time} · ${a.customer}`, note: a.worker || "" })) });
  return out;
}

