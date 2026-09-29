/**
 * Abuse protection for sensitive actions (sign-in, registration, password change).
 *
 * With ARCJET_KEY set (production), Arcjet decides: its limits are shared by every server
 * instance (Vercel runs many), it blocks automated clients and common attacks (shield), and
 * it refuses disposable or undeliverable e-mail addresses at registration.
 * Without a key (development, tests), or if Arcjet cannot be reached, the in-memory limiter
 * in lib/rate-limit.js applies, so these actions never break because of the protection.
 *
 * ARCJET_MODE=DRY_RUN makes Arcjet only log what it would block (useful the first days).
 */
import { rateLimit } from "@/lib/rate-limit";
import { logEvent } from "@/lib/observability";

/** Limits per action: Arcjet interval + the in-memory fallback window. */
export const LIMITS = {
  login: { max: 8, interval: "15m", windowMs: 15 * 60 * 1000, perIpMax: 40 },
  register: { max: 5, interval: "1h", windowMs: 60 * 60 * 1000 },
  password: { max: 10, interval: "15m", windowMs: 15 * 60 * 1000 },
};

let clientsPromise = null;

async function arcjetClients() {
  if (!process.env.ARCJET_KEY) return null;
  if (!clientsPromise) {
    clientsPromise = (async () => {
      const { default: arcjet, shield, detectBot, slidingWindow, protectSignup } = await import("@arcjet/next");
      const mode = process.env.ARCJET_MODE === "DRY_RUN" ? "DRY_RUN" : "LIVE";
      const base = arcjet({ key: process.env.ARCJET_KEY, characteristics: ["ip.src"], rules: [shield({ mode })] });
      return {
        login: base
          .withRule(detectBot({ mode, allow: [] }))
          .withRule(slidingWindow({ mode, characteristics: ["ip.src", "account"], interval: LIMITS.login.interval, max: LIMITS.login.max }))
          .withRule(slidingWindow({ mode, interval: LIMITS.login.interval, max: LIMITS.login.perIpMax })),
        register: base.withRule(
          protectSignup({
            rateLimit: { mode, interval: LIMITS.register.interval, max: LIMITS.register.max },
            bots: { mode, allow: [] },
            email: { mode, deny: ["DISPOSABLE", "INVALID", "NO_MX_RECORDS"] },
          })
        ),
        password: base.withRule(slidingWindow({ mode, characteristics: ["ip.src", "account"], interval: LIMITS.password.interval, max: LIMITS.password.max })),
      };
    })();
  }
  return clientsPromise;
}

const minutes = (seconds) => Math.max(1, Math.ceil(seconds / 60));

/** Message shown to the person for an Arcjet denial. */
export function denialMessage(reason) {
  if (reason?.isRateLimit?.()) return `Too many attempts. Try again in ${minutes(reason.reset || 60)} minute(s).`;
  if (reason?.isEmail?.()) return "Enter a real e-mail address that can receive mail.";
  if (reason?.isBot?.()) return "Automated requests are not allowed. Use the app in a browser.";
  return "This request was blocked for security reasons. Try again later.";
}

function localCheck(kind, { ip, account }) {
  const limit = LIMITS[kind];
  const key = `${kind}:${ip}:${account || ""}`;
  const res = rateLimit(key, { limit: limit.max, windowMs: limit.windowMs });
  if (res.allowed) return { allowed: true, key, source: "local" };
  return { allowed: false, key, source: "local", message: `Too many attempts. Try again in ${minutes(res.retryAfterMs / 1000)} minute(s).` };
}

/**
 * Checks an action. `kind` is login | register | password; `account` is the e-mail (or user
 * id) the attempt is about; `email` is validated at registration.
 * Returns { allowed, message?, source, key? } — `key` lets a successful sign-in clear the
 * local counter.
 */
export async function guard(kind, { ip = "local", account = "", email } = {}) {
  let clients = null;
  try {
    clients = await arcjetClients();
  } catch (error) {
    logEvent("warn", { event: "arcjet_unavailable", message: error.message });
  }
  if (!clients) return localCheck(kind, { ip, account });
  try {
    const { request } = await import("@arcjet/next");
    const req = await request();
    const props = kind === "register" ? { email: String(email || account) } : { account: String(account || "anonymous") };
    const decision = await clients[kind].protect(req, props);
    if (decision.isErrored()) {
      logEvent("warn", { event: "arcjet_error", kind, message: decision.reason?.message });
      return localCheck(kind, { ip, account });
    }
    if (decision.isDenied()) {
      logEvent("warn", { event: "arcjet_denied", kind, reason: decision.reason?.type });
      return { allowed: false, source: "arcjet", message: denialMessage(decision.reason) };
    }
    return { allowed: true, source: "arcjet" };
  } catch (error) {
    logEvent("warn", { event: "arcjet_error", kind, message: error.message });
    return localCheck(kind, { ip, account });
  }
}
