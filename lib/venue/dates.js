/**
 * Calendar dates of the venue (events, seasons, follow-ups) are stored as DATE columns and
 * handled as "YYYY-MM-DD" keys in the organization's time zone: no time, no time-zone shift.
 * Pure module (safe for client components).
 */

/** A DATE value for Prisma (midnight UTC of the key). */
export function dbDate(dateKey) {
  return dateKey ? new Date(`${dateKey}T00:00:00.000Z`) : null;
}

/** The key of a DATE value read from the database (or a key, returned as is). */
export function dateKeyOf(value) {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  return value.toISOString().slice(0, 10);
}

/** 0 = Sunday … 6 = Saturday. */
export function weekdayOf(dateKey) {
  return new Date(`${dateKey}T00:00:00.000Z`).getUTCDay();
}

export const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** First and last day of the month of `dateKey` ("2026-12-15" → ["2026-12-01", "2026-12-31"]). */
export function monthBounds(dateKey) {
  const [y, m] = dateKey.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const mm = String(m).padStart(2, "0");
  return [`${y}-${mm}-01`, `${y}-${mm}-${String(last).padStart(2, "0")}`];
}

/** "2026-12" of a key, and the month before / after it. */
export function monthKeyOf(dateKey) {
  return dateKey.slice(0, 7);
}

export function shiftMonth(monthKey, delta) {
  const [y, m] = monthKey.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
