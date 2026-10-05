/**
 * The price of a date for a hall. Rules, most specific first:
 *   1. a special date (e.g. 31 December),
 *   2. a season (a date range; when seasons overlap, the shortest range wins),
 *   3. a day of the week,
 *   4. the hall's base price.
 * Inactive rules are ignored. Pure module (safe for client components): the booking form, the
 * calendar and the server use the same function.
 */
import { WEEKDAYS, dateKeyOf, weekdayOf } from "./dates";

const DAY_MS = 86400000;

function rangeLength(rule) {
  return (Date.parse(rule.endKey) - Date.parse(rule.startKey)) / DAY_MS;
}

/** A price rule with its dates as keys ({ kind, price, weekday, startKey, endKey, label, isActive }). */
export function normalizeRule(rule) {
  return {
    ...rule,
    startKey: rule.startKey || dateKeyOf(rule.startDate),
    endKey: rule.endKey || dateKeyOf(rule.endDate) || rule.startKey || dateKeyOf(rule.startDate),
  };
}

/** A readable description of a rule ("Saturdays", "15 Dec – 5 Jan", "31 Dec 2026"). */
export function describeRule(rule) {
  const r = normalizeRule(rule);
  if (r.kind === "WEEKDAY") return `${WEEKDAYS[r.weekday]}s`;
  const fmt = (k) => new Date(`${k}T00:00:00Z`).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  if (r.kind === "SPECIAL_DATE") return fmt(r.startKey);
  return `${fmt(r.startKey)} – ${fmt(r.endKey)}`;
}

/**
 * { price, source: "SPECIAL_DATE" | "SEASON" | "WEEKDAY" | "BASE", rule, label } for `dateKey`.
 */
export function priceForDate(dateKey, { basePrice = 0, rules = [] } = {}) {
  const active = rules.filter((r) => r.isActive !== false).map(normalizeRule);
  const special = active.find((r) => r.kind === "SPECIAL_DATE" && r.startKey === dateKey);
  if (special) return { price: special.price, source: "SPECIAL_DATE", rule: special, label: special.label || "Special date" };

  const seasons = active
    .filter((r) => r.kind === "SEASON" && r.startKey <= dateKey && dateKey <= r.endKey)
    .sort((a, b) => rangeLength(a) - rangeLength(b) || String(b.updatedAt || "").localeCompare(String(a.updatedAt || "")));
  if (seasons.length) return { price: seasons[0].price, source: "SEASON", rule: seasons[0], label: seasons[0].label || "Season" };

  const weekday = weekdayOf(dateKey);
  const day = active.find((r) => r.kind === "WEEKDAY" && r.weekday === weekday);
  if (day) return { price: day.price, source: "WEEKDAY", rule: day, label: day.label || `${WEEKDAYS[weekday]} price` };

  return { price: basePrice, source: "BASE", rule: null, label: "Base price" };
}
