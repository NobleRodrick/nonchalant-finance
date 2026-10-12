/**
 * Owner of the pages saved for offline use.
 *
 * Every session carries a random marker in a cookie the service worker (and the page) can read,
 * `sf_offline`; every page the server sends echoes it in the `x-sf-owner` header, and the
 * service worker keeps it with the saved copy. A saved page is shown only while the browser still
 * holds the same marker: once the session ends (sign-out, expiry, cookies cleared, another person
 * signs in on this computer) the previous person's pages are never shown again, even without a
 * connection. The marker is not a credential: it only says which session saved a page.
 */
export const OFFLINE_OWNER_COOKIE = "sf_offline";
export const OFFLINE_OWNER_HEADER = "x-sf-owner";

/** Cookie options of the marker: readable by scripts (not httpOnly), same lifetime as the session. */
export function ownerCookieOptions(maxAge) {
  return { httpOnly: false, secure: process.env.NODE_ENV === "production", sameSite: "lax", path: "/", maxAge: Math.max(0, Math.floor(maxAge)) };
}

/** A marker is a UUID; anything else (a hand-edited cookie) is ignored. */
export function validOwner(value) {
  return typeof value === "string" && /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}
