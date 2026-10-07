/**
 * Arithmetic of a farm batch (poultry or livestock band, crop field, fish pond) — pure.
 *
 *   alive now      = put in + added − dead − sold alive
 *   mortality      = dead ÷ (put in + added)
 *   cost           = inputs used from stock (at average cost) + expenses named on the batch
 *   profit         = sales of the batch + other income named on it − cost
 *   cost per head  = cost ÷ (alive now + sold alive)      (animals and fish)
 */

const q3 = (v) => Math.round(Number(v || 0) * 1000) / 1000;
const int = (v) => Math.round(Number(v || 0));

export const BATCH_KINDS = {
  POULTRY: { label: "Poultry (broilers, layers)", unit: "birds", live: true, word: "band" },
  LIVESTOCK: { label: "Livestock (pigs, goats, cattle, rabbits)", unit: "heads", live: true, word: "band" },
  CROP: { label: "Crops (field, plantation, garden)", unit: "ha", live: false, word: "field" },
  FISH: { label: "Fish pond (tilapia, catfish)", unit: "fish", live: true, word: "pond" },
};

export const EVENT_LABELS = { ADDITION: "Animals added", MORTALITY: "Deaths / losses", FEED: "Feeding", TREATMENT: "Treatment / vaccine / fertiliser", WEIGHT: "Weighing", PRODUCE: "Produce / harvest", SALE: "Sale", NOTE: "Note" };

/** What each kind of batch can record (crops have no deaths or weighings of animals, but losses). */
export function eventKindsFor(kind) {
  if (kind === "CROP") return ["FEED", "TREATMENT", "MORTALITY", "PRODUCE", "NOTE"];
  return ["MORTALITY", "FEED", "TREATMENT", "WEIGHT", "PRODUCE", "ADDITION", "NOTE"];
}

/**
 * Figures of a batch from its events [{ kind, quantity, unit, value, voidedAt }] and money records
 * [{ type, amount, status }]. A sale from an animal or fish batch is of live animals (produce is
 * sold at the till from the stock).
 */
export function batchFigures(batch, events = [], records = []) {
  const ev = events.filter((e) => !e.voidedAt);
  const sum = (kind, f = (e) => Number(e.quantity)) => q3(ev.filter((e) => e.kind === kind).reduce((s, e) => s + f(e), 0));
  const live = BATCH_KINDS[batch.kind]?.live !== false;
  const added = sum("ADDITION");
  const dead = sum("MORTALITY");
  const soldAlive = live ? sum("SALE") : 0;
  const started = q3(Number(batch.initialCount) + added);
  const alive = live ? q3(started - dead - soldAlive) : null;
  const inputs = ev.reduce((s, e) => s + int(e.value), 0);
  const ok = records.filter((r) => r.status !== "VOIDED");
  const sales = ok.filter((r) => r.type === "SALE").reduce((s, r) => s + int(r.amount), 0);
  const otherIncome = ok.filter((r) => r.type === "OTHER_INCOME").reduce((s, r) => s + int(r.amount), 0);
  const expenses = ok.filter((r) => ["EXPENSE", "OTHER_EXPENSE"].includes(r.type)).reduce((s, r) => s + int(r.amount), 0);
  const cost = inputs + expenses;
  const lastWeight = ev.filter((e) => e.kind === "WEIGHT").sort((a, b) => String(b.date).localeCompare(String(a.date)))[0];
  const produce = {};
  for (const e of ev.filter((x) => x.kind === "PRODUCE")) produce[e.unit || "units"] = q3((produce[e.unit || "units"] || 0) + Number(e.quantity));
  const feed = {};
  for (const e of ev.filter((x) => x.kind === "FEED")) feed[e.unit || "units"] = q3((feed[e.unit || "units"] || 0) + Number(e.quantity));
  const heads = live ? q3(alive + soldAlive) : 0;
  return {
    live,
    started,
    added,
    dead,
    soldAlive,
    alive,
    mortalityPct: live && started ? Math.round((dead / started) * 1000) / 10 : null,
    inputs,
    expenses,
    cost,
    sales,
    otherIncome,
    profit: sales + otherIncome - cost,
    costPerHead: live && heads > 0 ? Math.round(cost / heads) : null,
    lastWeight: lastWeight ? { quantity: Number(lastWeight.quantity), unit: lastWeight.unit || "kg" } : null,
    produce,
    feed,
  };
}

/** Days since the batch started (on `todayKey`). */
export function ageInDays(startKey, todayKey) {
  return Math.max(0, Math.round((Date.parse(`${todayKey}T00:00:00Z`) - Date.parse(`${startKey}T00:00:00Z`)) / 86400000));
}
