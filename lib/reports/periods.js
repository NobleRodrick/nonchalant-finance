/**
 * The report periods every report page offers (?period=today|yesterday|week|month|last-month|
 * year|custom, with ?from=&to= for custom), resolved to date keys in the business time zone.
 * Pure (safe for client components).
 */
import { addDaysToKey, formatDateKey, isDateKey, periodRange } from "@/lib/timezone";

export const PERIOD_PRESETS = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
  { key: "month", label: "This month" },
  { key: "last-month", label: "Last month" },
  { key: "year", label: "This year" },
  { key: "custom", label: "Custom" },
];

/** { preset, fromKey, toKey } of the URL's period (default `fallback`). */
export function resolvePeriod(sp, todayKey, fallback = "month") {
  const preset = PERIOD_PRESETS.some((p) => p.key === sp?.period) ? sp.period : fallback;
  if (preset === "custom" && isDateKey(sp?.from) && isDateKey(sp?.to)) {
    const [fromKey, toKey] = sp.from <= sp.to ? [sp.from, sp.to] : [sp.to, sp.from];
    return { preset, fromKey, toKey };
  }
  if (preset === "today") return { preset, fromKey: todayKey, toKey: todayKey };
  if (preset === "yesterday") return { preset, fromKey: addDaysToKey(todayKey, -1), toKey: addDaysToKey(todayKey, -1) };
  if (preset === "week") return { preset, ...periodRange("week", todayKey) };
  if (preset === "last-month") return { preset, ...periodRange("month", addDaysToKey(periodRange("month", todayKey).fromKey, -1)) };
  if (preset === "year") return { preset, fromKey: `${todayKey.slice(0, 4)}-01-01`, toKey: `${todayKey.slice(0, 4)}-12-31` };
  return { preset: preset === "custom" ? "month" : preset, ...periodRange("month", todayKey) };
}

/** "Fri 02 Oct 2026" or "01 Oct 2026 – 31 Oct 2026". */
export function periodLabel({ fromKey, toKey }) {
  return fromKey === toKey ? formatDateKey(fromKey) : `${formatDateKey(fromKey, { weekday: false })} – ${formatDateKey(toKey, { weekday: false })}`;
}
