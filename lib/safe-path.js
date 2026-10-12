/**
 * A path of this site to go to after signing in (or another step), or `fallback`.
 * The browser drops tabs and new lines from URLs ("/\t/evil.com" is "//evil.com", another site),
 * so a path with control characters or a backslash is refused, and what is left must resolve to
 * this site.
 */
export function safePath(path, fallback = "/home") {
  // eslint-disable-next-line no-control-regex
  if (typeof path !== "string" || !path.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(path)) return fallback;
  try {
    const base = "http://sf.invalid";
    const u = new URL(path, base);
    if (u.origin !== base) return fallback;
    return `${u.pathname}${u.search}${u.hash}`;
  } catch {
    return fallback;
  }
}
