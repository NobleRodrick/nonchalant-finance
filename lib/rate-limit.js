/**
 * Small fixed-window in-memory rate limiter: the fallback used by lib/security/protect.js
 * when Arcjet is not configured (development, tests) or cannot be reached. Per server
 * instance only; production uses Arcjet's shared limits.
 */
const buckets = new Map();

export function rateLimit(key, { limit = 10, windowMs = 15 * 60 * 1000 } = {}) {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, remaining: limit - 1, retryAfterMs: 0 };
  }
  bucket.count += 1;
  if (bucket.count > limit) {
    return { allowed: false, remaining: 0, retryAfterMs: bucket.resetAt - now };
  }
  return { allowed: true, remaining: limit - bucket.count, retryAfterMs: 0 };
}

export function resetRateLimit(key) {
  buckets.delete(key);
}

// Prevent unbounded growth.
setInterval?.(() => {
  const now = Date.now();
  for (const [k, b] of buckets) if (b.resetAt <= now) buckets.delete(k);
}, 10 * 60 * 1000)?.unref?.();
