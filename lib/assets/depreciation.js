/**
 * Depreciation of long-term assets (the asset register of any department), as pure functions.
 * Months are counted whole from the purchase date: an asset bought on 15 March has its first
 * month charged on 15 April. Amounts are whole FCFA; the last month absorbs the rounding so the
 * total equals cost − salvage exactly.
 *
 *   straight-line      each month: (cost − salvage) ÷ useful life (months)
 *   declining balance  each month: book value × 2 ÷ useful life (double-declining), switching to
 *                      straight-line on what is left as soon as that gives more; never below salvage
 *
 * Pure module (safe for client components; unit-tested).
 */

export const METHOD_LABELS = { STRAIGHT_LINE: "Straight-line", DECLINING_BALANCE: "Declining balance (double)" };

const int = (v) => Math.round(Number(v) || 0);

/** Whole months from `fromKey` to `toKey` ("2026-03-15" → "2026-04-15" = 1). Negative = 0. */
export function monthsBetween(fromKey, toKey) {
  const [y1, m1, d1] = fromKey.split("-").map(Number);
  const [y2, m2, d2] = toKey.split("-").map(Number);
  let n = (y2 - y1) * 12 + (m2 - m1);
  if (d2 < d1) n -= 1;
  return Math.max(0, n);
}

/** The key of `n` months after `dateKey` (same day, or the month's last day). */
export function addMonths(dateKey, n) {
  const [y, m, d] = dateKey.split("-").map(Number);
  const first = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0)).getUTCDate();
  return `${first.getUTCFullYear()}-${String(first.getUTCMonth() + 1).padStart(2, "0")}-${String(Math.min(d, last)).padStart(2, "0")}`;
}

/** The monthly charges over the whole life: [amount of month 1, month 2, …]. */
export function schedule({ cost, salvageValue = 0, usefulLifeMonths, method = "STRAIGHT_LINE" }) {
  const base = Math.max(0, int(cost) - int(salvageValue));
  const life = Math.max(1, int(usefulLifeMonths));
  const out = [];
  if (method === "DECLINING_BALANCE") {
    let book = int(cost);
    const rate = 2 / life;
    let done = 0;
    for (let i = 0; i < life; i++) {
      const left = life - i;
      const remaining = base - done;
      const declining = Math.round(book * rate);
      const straight = Math.round(remaining / left);
      let amount = i === life - 1 ? remaining : Math.min(remaining, Math.max(declining, straight));
      if (amount < 0) amount = 0;
      out.push(amount);
      done += amount;
      book -= amount;
    }
    return out;
  }
  const monthly = Math.floor(base / life);
  for (let i = 0; i < life; i++) out.push(i === life - 1 ? base - monthly * (life - 1) : monthly);
  return out;
}

/** Depreciation accumulated after `months` whole months. */
export function accumulatedAfter(asset, months) {
  const s = schedule(asset);
  let sum = 0;
  for (let i = 0; i < Math.min(months, s.length); i++) sum += s[i];
  return sum;
}

/**
 * The value of an asset on `asOfKey`: { months (elapsed), monthly (this month's charge),
 * accumulated, bookValue, remainingMonths, fullyDepreciated }. A disposed asset stops on its
 * disposal date.
 */
export function assetValue(asset, asOfKey) {
  const purchaseKey = typeof asset.purchaseDate === "string" ? asset.purchaseDate.slice(0, 10) : asset.purchaseDate.toISOString().slice(0, 10);
  const disposedKey = asset.disposedOn ? (typeof asset.disposedOn === "string" ? asset.disposedOn.slice(0, 10) : asset.disposedOn.toISOString().slice(0, 10)) : null;
  const until = disposedKey && disposedKey < asOfKey ? disposedKey : asOfKey;
  const life = Math.max(1, int(asset.usefulLifeMonths));
  const months = Math.min(life, monthsBetween(purchaseKey, until));
  const s = schedule(asset);
  const accumulated = s.slice(0, months).reduce((a, b) => a + b, 0);
  return {
    months,
    monthly: months < life && !disposedKey ? s[months] : 0,
    accumulated,
    bookValue: int(asset.cost) - accumulated,
    remainingMonths: disposedKey ? 0 : life - months,
    fullyDepreciated: months >= life,
  };
}

/** Depreciation of an asset charged in [fromKey, toKey] (for the income statement of a period). */
export function depreciationBetween(asset, fromKey, toKey) {
  const before = assetValue(asset, addDayKey(fromKey, -1)).accumulated;
  const after = assetValue(asset, toKey).accumulated;
  return Math.max(0, after - before);
}

function addDayKey(dateKey, days) {
  return new Date(Date.parse(`${dateKey}T00:00:00Z`) + days * 86400000).toISOString().slice(0, 10);
}

/** Gain (positive) or loss (negative) when an asset is disposed of: money received − book value. */
export function disposalResult(asset) {
  if (!asset.disposedOn) return 0;
  const key = typeof asset.disposedOn === "string" ? asset.disposedOn.slice(0, 10) : asset.disposedOn.toISOString().slice(0, 10);
  return int(asset.disposalValue) - assetValue(asset, key).bookValue;
}
