/** What needs attention on a farm (pure, unit-tested; the dashboard and the morning alert). */
import { addDaysToKey } from "@/lib/timezone";

/**
 * What needs attention on a farm (pure, from farmBoard batches): deaths today above 2 % of a band,
 * batches past their expected end, batches losing money, nothing recorded for 3 days.
 */
export function farmWarnings(batches, todayKey, lastEventKeys = {}) {
  const out = [];
  const add = (w) => w.count && out.push(w);
  const active = batches.filter((b) => b.status === "ACTIVE");
  const deaths = active.filter((b) => b.figures.live && b.figures.started && b.today.deaths / b.figures.started >= 0.02);
  add({ key: "deaths", tone: "bad", count: deaths.length, title: `${deaths.length} batch(es) with many deaths today`, detail: "2 % or more died today: check water, feed, heat and call the vet.", href: "/batches", rows: deaths.map((b) => ({ id: b.id, label: `${b.name} · ${b.referenceNo}`, note: `${b.today.deaths} ${b.unit} today`, href: `/batches/${b.id}` })) });
  const over = active.filter((b) => b.expectedEndKey && b.expectedEndKey < todayKey);
  add({ key: "overdue", tone: "warn", count: over.length, title: `${over.length} batch(es) past their expected end`, detail: "Sell, harvest or close them — every day costs feed.", href: "/batches", rows: over.map((b) => ({ id: b.id, label: `${b.name} · ${b.referenceNo}`, note: `expected ${b.expectedEndKey}`, href: `/batches/${b.id}` })) });
  const quiet = active.filter((b) => (lastEventKeys[b.id] || b.startKey) < addDaysToKey(todayKey, -3));
  add({ key: "quiet", tone: "info", count: quiet.length, title: `${quiet.length} batch(es) with nothing recorded for 3 days`, detail: "Record the feed, deaths and produce every day: the figures are only as good as the records.", href: "/batches", rows: quiet.map((b) => ({ id: b.id, label: `${b.name} · ${b.referenceNo}`, href: `/batches/${b.id}` })) });
  return out;
}

