/** Temporary password for new staff: 10 random characters from an unambiguous alphabet. */
export function generateTempPassword() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  const bytes = new Uint8Array(10);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += alphabet[b % alphabet.length];
  const digit = "23456789"[bytes[0] % 8];
  return `${out.slice(0, 5)}-${out.slice(5, 9)}${digit}`;
}

/**
 * Passwords people pick first and attackers try first. A password is refused when, once lower-cased
 * and stripped of digits and symbols at its ends, it is one of these (e.g. "Password123!").
 */
const COMMON = new Set([
  "password", "passw0rd", "motdepasse", "azerty", "qwerty", "abc", "abcd", "abcdef", "letmein", "welcome",
  "admin", "administrator", "user", "login", "secret", "changeme", "default", "test", "iloveyou", "monkey",
  "dragon", "football", "baseball", "sunshine", "princess", "master", "shadow", "superman", "batman", "trustno",
  "qwertyuiop", "azertyuiop", "asdfgh", "zxcvbn", "bonjour", "soleil", "cameroun", "cameroon", "douala", "yaounde",
  "springer", "finance", "restaurant", "hotel", "company", "business", "boss", "manager", "temp", "temporary",
]);

/** Most bytes bcrypt reads: anything longer would be silently cut. */
const MAX_BYTES = 72;

/**
 * Returns an error message, or null when the password is acceptable: at least 8 characters with
 * letters and numbers, at most 72 bytes, not a common password, and not the e-mail or name of
 * the person (`email` and `name` are optional).
 */
export function validatePasswordStrength(password, { email = "", name = "" } = {}) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (new TextEncoder().encode(password).length > MAX_BYTES) {
    return "Password is too long (at most 72 characters).";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain letters and numbers.";
  }
  const lower = password.toLowerCase();
  const core = lower.replace(/^[^a-z]+|[^a-z]+$/g, "");
  if (COMMON.has(core) || /^(.)\1+$/.test(core)) {
    return "This password is too easy to guess. Choose another one.";
  }
  const local = String(email || "").toLowerCase().split("@")[0];
  if (local.length >= 4 && lower.includes(local)) return "The password must not contain your e-mail address.";
  const words = String(name || "").toLowerCase().split(/\s+/).filter((w) => w.length >= 4);
  if (words.some((w) => core === w)) return "The password must not be your name.";
  return null;
}
