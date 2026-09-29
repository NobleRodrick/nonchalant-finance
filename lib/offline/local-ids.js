/**
 * Records created offline have no database id yet. On this device they are shown with a local
 * id "local:<field>:<operation key>" (field = which id of the operation's result it stands for:
 * dishId, transactionId, debtId, debtorId …). When an operation that uses such an id is queued,
 * the id becomes { $ref: <key>, field } and the server swaps it for the real id (the earlier
 * operation is always applied first). Pure functions: used on the device and in tests.
 */
const PREFIX = "local:";

export function localId(field, key) {
  return `${PREFIX}${field}:${key}`;
}

export function isLocalId(value) {
  return typeof value === "string" && value.startsWith(PREFIX);
}

export function parseLocalId(value) {
  if (!isLocalId(value)) return null;
  const rest = value.slice(PREFIX.length);
  const i = rest.indexOf(":");
  if (i < 1) return null;
  return { field: rest.slice(0, i), key: rest.slice(i + 1) };
}

/** Replaces local ids in `value` by { $ref, field }; returns the value and the keys it depends on. */
export function encodeLocalIds(value) {
  const deps = new Set();
  const walk = (v) => {
    if (Array.isArray(v)) return v.map(walk);
    if (isLocalId(v)) {
      const ref = parseLocalId(v);
      if (!ref) return v;
      deps.add(ref.key);
      return { $ref: ref.key, field: ref.field };
    }
    if (v && typeof v === "object" && !(v instanceof Date)) {
      const out = {};
      for (const [k, x] of Object.entries(v)) out[k] = walk(x);
      return out;
    }
    return v;
  };
  return { value: walk(value), deps: [...deps] };
}

/** A new operation key (also the idempotency key of the record it creates). */
export function newOperationKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}${Math.random().toString(36).slice(2, 12)}`;
}

/** Short code shown on a provisional receipt until the real reference arrives (e.g. "#3F9A"). */
export function provisionalCode(key) {
  return `#${String(key).slice(-4).toUpperCase()}`;
}
