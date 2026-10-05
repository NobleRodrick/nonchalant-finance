import { NextResponse } from "next/server";
import { jwtVerify } from "jose";
import { getJwtSecretKey } from "@/lib/jwt-secret";

/**
 * Route gate: application pages require a signed session cookie. Authorization (roles,
 * department membership) is enforced again inside every page and server action.
 */
// The service worker, the offline page and the connectivity check must load without a session.
const PUBLIC_PREFIXES = ["/_next", "/favicon.ico", "/logo.jpg", "/api/inngest", "/api/health", "/sw.js", "/offline.html", "/manifest.webmanifest", "/icons/"];
const PUBLIC_EXACT = ["/", "/login", "/register"];
const AUTH_ROUTES = ["/login", "/register", "/sign-in", "/sign-up"];

async function isValid(token, typ) {
  if (!token) return false;
  try {
    const { payload } = await jwtVerify(token, getJwtSecretKey(), { algorithms: ["HS256"] });
    return payload.typ === typ;
  } catch {
    return false;
  }
}

export async function proxy(req) {
  const { pathname, search } = req.nextUrl;
  if (PUBLIC_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  const hasAccess = await isValid(req.cookies.get("sf_access_token")?.value, "access");
  const hasRefresh = hasAccess ? true : await isValid(req.cookies.get("sf_refresh_token")?.value, "refresh");

  if (AUTH_ROUTES.includes(pathname)) {
    if (hasAccess) return NextResponse.redirect(new URL("/home", req.url));
    return NextResponse.next();
  }
  if (PUBLIC_EXACT.includes(pathname)) return NextResponse.next();

  if (!hasRefresh) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", `${pathname}${search || ""}`);
    return NextResponse.redirect(url);
  }
  // Remember the last department opened (/d/<id>/…) so "Home" returns to it.
  const dept = pathname.match(/^\/d\/([0-9a-f-]{36})(?:\/|$)/i)?.[1];
  // The app layout checks access to the page before anything is streamed, so a refused page
  // answers with a real 404 / redirect status (see app/(main)/layout.js).
  const requestHeaders = new Headers(req.headers);
  requestHeaders.set("x-sf-path", pathname);
  const res = NextResponse.next({ request: { headers: requestHeaders } });
  if (dept && req.cookies.get("sf_active_dept")?.value !== dept) {
    res.cookies.set("sf_active_dept", dept, { httpOnly: true, sameSite: "lax", secure: process.env.NODE_ENV === "production", path: "/", maxAge: 30 * 24 * 60 * 60 });
  }
  return res;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)"],
};
