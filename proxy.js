import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-secret";
import { OFFLINE_OWNER_COOKIE, OFFLINE_OWNER_HEADER, ownerCookieOptions, validOwner } from "@/lib/offline/owner";

/**
 * Route gate: application pages require a signed session cookie. Authorization (roles,
 * department membership) is enforced again inside every page and server action.
 */
// The service worker, the offline page and the connectivity check must load without a session.
const PUBLIC_PREFIXES = ["/_next", "/favicon.ico", "/logo.jpg", "/api/inngest", "/api/health", "/sw.js", "/offline.html", "/manifest.webmanifest", "/icons/"];
const PUBLIC_EXACT = ["/", "/login", "/register"];
const AUTH_ROUTES = ["/login", "/register", "/sign-in", "/sign-up"];

/** The token's payload when it is valid and of the type, else null. */
async function verified(token, typ) {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), { algorithms: ["HS256"] });
    return payload.typ === typ ? payload : null;
  } catch {
    return null;
  }
}

/** No session any more: the marker of the pages saved offline goes too (see lib/offline/owner). */
function withoutOwner(req, res) {
  if (req.cookies.get(OFFLINE_OWNER_COOKIE)) res.cookies.delete(OFFLINE_OWNER_COOKIE);
  return res;
}

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasAccess = Boolean(await verified(req.cookies.get("sf_access_token")?.value, "access"));
  const refresh = await verified(req.cookies.get("sf_refresh_token")?.value, "refresh");
  const hasRefresh = hasAccess || Boolean(refresh);

  if (AUTH_ROUTES.includes(pathname)) {
    if (hasAccess) return NextResponse.redirect(new URL("/home", req.url));
    return refresh ? NextResponse.next() : withoutOwner(req, NextResponse.next());
  }
  if (PUBLIC_EXACT.includes(pathname)) return NextResponse.next();

  if (!hasRefresh) {
    if (pathname.startsWith("/api/")) {
      return withoutOwner(req, NextResponse.json({ error: "Unauthorized" }, { status: 401 }));
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", `${pathname}${search || ""}`);
    return withoutOwner(req, NextResponse.redirect(url));
  }
  // Remember the last department opened (/d/<id>/…) so "Home" returns to it.
  const dept = pathname.match(/^\/d\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  // The app layout checks access to the page before anything is streamed, so a refused page
  // answers with a real 404 / redirect status (see app/(main)/layout.js).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-sf-path", pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  // Owner of the offline copy of this page (sessions started before the marker existed get one,
  // lasting as long as their refresh token).
  let owner = validOwner(req.cookies.get(OFFLINE_OWNER_COOKIE)?.value);
  if (!owner && refresh?.exp) {
    owner = crypto.randomUUID();
    res.cookies.set(OFFLINE_OWNER_COOKIE, owner, ownerCookieOptions(refresh.exp - Date.now() / 1000));
  }
  if (owner) res.headers.set(OFFLINE_OWNER_HEADER, owner);
  if (dept && req.cookies.get("sf_active_dept")?.value !== dept) {
    res.cookies.set("sf_active_dept", dept, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60 });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
