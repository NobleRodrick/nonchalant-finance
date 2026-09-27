function isDecimal(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    typeof value.toNumber === "function" &&
    (value.constructor?.name === "Decimal" || typeof value.toFixed === "function")
  );
}

/**
 * Converts Prisma results into plain JSON-safe values for Client Components:
 * Decimal -> number, Date -> ISO string, Bytes -> omitted, BigInt -> number.
 */
export function serialize(value) {
  if (value === null || value === undefined) return value;
  return JSON.parse(
    JSON.stringify(value, function replacer(key, item) {
      const raw = this[key]; // value before toJSON() was applied
      if (isDecimal(raw)) return raw.toNumber();
      if (raw instanceof Uint8Array) return undefined;
      if (typeof raw === "bigint") return Number(raw);
      return item;
    })
  );
}

export function num(value) {
  if (value === null || value === undefined) return 0;
  if (isDecimal(value)) return value.toNumber();
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}
