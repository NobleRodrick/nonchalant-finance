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

/** Returns an error message, or null when the password is acceptable. */
export function validatePasswordStrength(password) {
  if (typeof password !== "string" || password.length < 8) {
    return "Password must be at least 8 characters long.";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "Password must contain letters and numbers.";
  }
  return null;
}
