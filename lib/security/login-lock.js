/**
 * Sign-in lockout settings (see loginUser in actions/auth.js). Wrong passwords for an e-mail are
 * counted in the shared database counters: after LOCK_AFTER within FAIL_WINDOW_MS the e-mail is
 * locked for LOCK_MINUTES. In a browser where the person signed in before, the attempts count for
 * that browser alone (its own key).
 */
export const LOCK_AFTER = 10;
export const LOCK_MINUTES = 15;
export const FAIL_WINDOW_MS = 60 * 60 * 1000;
/** Wrong passwords from one address (any e-mails) within IP_WINDOW_MS before it is refused. */
export const IP_FAIL_MAX = 50;
export const IP_WINDOW_MS = 15 * 60 * 1000;
export const ipFailKey = (ip) => `login-fail-ip:${ip}`;

/** Counter key of an e-mail's wrong passwords: everywhere, or in one known browser. */
export function loginFailKey(email, device = null) {
  const e = String(email || "").toLowerCase().trim();
  return device ? `login-fail:${e}:device:${device}` : `login-fail:${e}`;
}
