/**
 * Attempt counters shared by every server instance, kept in Postgres (table rate_limits).
 *
 * Vercel runs many instances: a counter in memory would give an attacker a fresh allowance on
 * each one. Every operation here is one atomic statement, so parallel attempts are all counted.
 * A key counts within a window that starts at its first attempt; `lockMs` (optional) extends the
 * window once the limit is reached, so a lock lasts that long from the attempt that set it.
 */
import { db } from "@/lib/prisma";

/** Counts one attempt. Returns { count, resetAt }. */
export async function hit(key, { windowMs, limit = null, lockMs = null, client = db }) {
  const rows = await client.$queryRaw`
    INSERT INTO "rate_limits" ("key", "count", "resetAt")
    VALUES (${key}, 1, timezone('utc', now()) + ${windowMs}::int * interval '1 millisecond')
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "rate_limits"."resetAt" <= timezone('utc', now()) THEN 1 ELSE "rate_limits"."count" + 1 END,
      "resetAt" = CASE
        WHEN "rate_limits"."resetAt" <= timezone('utc', now()) THEN timezone('utc', now()) + ${windowMs}::int * interval '1 millisecond'
        WHEN ${limit}::int IS NOT NULL AND ${lockMs}::int IS NOT NULL AND "rate_limits"."count" + 1 = ${limit}::int THEN timezone('utc', now()) + ${lockMs}::int * interval '1 millisecond'
        ELSE "rate_limits"."resetAt" END
    RETURNING "count", "resetAt"`;
  if (Math.random() < 0.01) sweep(client).catch(() => {});
  return { count: Number(rows[0].count), resetAt: rows[0].resetAt };
}

/** The key's current count (0 once its window is over). */
export async function peek(key, { client = db } = {}) {
  const row = await client.rateLimit.findUnique({ where: { key } });
  if (!row || row.resetAt <= new Date()) return { count: 0, resetAt: null };
  return { count: row.count, resetAt: row.resetAt };
}

/** Forgets a key (a successful sign-in, an unlock by the Boss). */
export async function clear(key, { client = db } = {}) {
  await client.rateLimit.deleteMany({ where: { key } });
}

/** Removes counters whose window ended more than a day ago. */
export async function sweep(client = db) {
  await client.rateLimit.deleteMany({ where: { resetAt: { lt: new Date(Date.now() - 24 * 3600 * 1000) } } });
}
