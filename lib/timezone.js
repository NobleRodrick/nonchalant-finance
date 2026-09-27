/**
 * Business-day handling in the organization's time zone (default Africa/Douala, UTC+1).
 * Servers usually run in UTC, so date-fns startOfDay() would cut the business day at
 * 01:00 local time. These helpers compute exact UTC instants for local day boundaries.
 * A "date key" is a local calendar date string: "YYYY-MM-DD".
 */
export const DEFAULT_TIMEZONE = "Africa/Douala";

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function partsInZone(date, timeZone) {
  const fmt = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const out = {};
  for (const p of fmt.formatToParts(date)) {
    if (p.type !== "literal") out[p.type] = Number(p.value);
  }
  return out;
}

/** Offset (ms) of `timeZone` from UTC at instant `date`. Douala: +3 600 000. */
export function timeZoneOffsetMs(date, timeZone = DEFAULT_TIMEZONE) {
  const p = partsInZone(date, timeZone);
  const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
  return asUtc - Math.floor(date.getTime() / 1000) * 1000;
}

/** Local calendar date key for an instant. */
export function toDateKey(input = new Date(), timeZone = DEFAULT_TIMEZONE) {
  if (typeof input === "string" && DATE_KEY_RE.test(input)) return input;
  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) throw new Error("Invalid date");
  const p = partsInZone(date, timeZone);
  return `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
}

export function isDateKey(value) {
  return typeof value === "string" && DATE_KEY_RE.test(value);
}

/** UTC instant of local midnight at the start of `dateKey`. */
export function startOfDateKey(dateKey, timeZone = DEFAULT_TIMEZONE) {
  if (!isDateKey(dateKey)) throw new Error(`Invalid date key: ${dateKey}`);
  const [y, m, d] = dateKey.split("-").map(Number);
  const guess = Date.UTC(y, m - 1, d);
  // Two passes handle DST transitions in zones that have them.
  let instant = guess - timeZoneOffsetMs(new Date(guess), timeZone);
  instant = guess - timeZoneOffsetMs(new Date(instant), timeZone);
  return new Date(instant);
}

export function addDaysToKey(dateKey, days) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return t.toISOString().slice(0, 10);
}

/** { start, end } UTC instants of the local business day (end inclusive, ms precision). */
export function dayBounds(input = new Date(), timeZone = DEFAULT_TIMEZONE) {
  const key = toDateKey(input, timeZone);
  const start = startOfDateKey(key, timeZone);
  const next = startOfDateKey(addDaysToKey(key, 1), timeZone);
  return { key, start, end: new Date(next.getTime() - 1) };
}

/** Bounds for an inclusive range of date keys. */
export function rangeBounds(fromKey, toKey, timeZone = DEFAULT_TIMEZONE) {
  const [a, b] = fromKey <= toKey ? [fromKey, toKey] : [toKey, fromKey];
  return {
    fromKey: a,
    toKey: b,
    start: startOfDateKey(a, timeZone),
    end: new Date(startOfDateKey(addDaysToKey(b, 1), timeZone).getTime() - 1),
  };
}

export function daysBetweenKeys(fromKey, toKey) {
  const a = Date.UTC(...fromKey.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...toKey.split("-").map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
}

export function listDateKeys(fromKey, toKey) {
  const out = [];
  for (let k = fromKey; k <= toKey; k = addDaysToKey(k, 1)) out.push(k);
  return out;
}

/** ISO-week (Monday start) and calendar-month ranges containing `dateKey`. */
export function periodRange(period, dateKey) {
  const [y, m, d] = dateKey.split("-").map(Number);
  if (period === "week") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    const back = (dow + 6) % 7;
    const from = addDaysToKey(dateKey, -back);
    return { fromKey: from, toKey: addDaysToKey(from, 6) };
  }
  if (period === "month") {
    const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
    const mm = String(m).padStart(2, "0");
    return { fromKey: `${y}-${mm}-01`, toKey: `${y}-${mm}-${String(last).padStart(2, "0")}` };
  }
  return { fromKey: dateKey, toKey: dateKey };
}

/** The range of equal length immediately before [fromKey, toKey] (for period comparison). */
export function previousRange(fromKey, toKey, period) {
  if (period === "month") {
    return periodRange("month", addDaysToKey(fromKey, -1));
  }
  const len = daysBetweenKeys(fromKey, toKey) + 1;
  return { fromKey: addDaysToKey(fromKey, -len), toKey: addDaysToKey(fromKey, -1) };
}

/** Human label for a date key, e.g. "Sat 26 Sep 2026". */
export function formatDateKey(dateKey, options = {}) {
  const [y, m, d] = dateKey.split("-").map(Number);
  return new Intl.DateTimeFormat("en-GB", {
    weekday: options.weekday === false ? undefined : "short",
    day: "2-digit",
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(Date.UTC(y, m - 1, d)));
}

/** Local time "HH:mm" of an instant in the business time zone. */
export function formatTimeInZone(input, timeZone = DEFAULT_TIMEZONE) {
  const date = input instanceof Date ? input : new Date(input);
  return new Intl.DateTimeFormat("en-GB", {
    timeZone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).format(date);
}

/**
 * Converts a user-entered business date (date key) to the instant stored on a record.
 * Today -> now; another day -> 12:00 local on that day (unambiguously inside the day).
 */
export function instantForDateKey(dateKey, timeZone = DEFAULT_TIMEZONE, now = new Date()) {
  if (!dateKey) return now;
  if (!isDateKey(dateKey)) {
    const parsed = new Date(dateKey);
    if (Number.isNaN(parsed.getTime())) throw new Error("Invalid date");
    return parsed;
  }
  if (dateKey === toDateKey(now, timeZone)) return now;
  return new Date(startOfDateKey(dateKey, timeZone).getTime() + 12 * 3600 * 1000);
}
