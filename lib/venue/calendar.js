/** The dates of a month calendar. Pure module (server and client). */
import { listDateKeys } from "@/lib/timezone";
import { monthBounds } from "./dates";

/** The dates shown for a month: whole weeks, Monday to Sunday. */
export function monthGrid(monthKey) {
  const [first, last] = monthBounds(`${monthKey}-01`);
  const lead = (new Date(`${first}T00:00:00Z`).getUTCDay() + 6) % 7;
  const tail = 6 - ((new Date(`${last}T00:00:00Z`).getUTCDay() + 6) % 7);
  const start = new Date(Date.parse(`${first}T00:00:00Z`) - lead * 86400000).toISOString().slice(0, 10);
  const end = new Date(Date.parse(`${last}T00:00:00Z`) + tail * 86400000).toISOString().slice(0, 10);
  return { first, last, start, end, keys: listDateKeys(start, end) };
}
