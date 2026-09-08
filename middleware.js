import { NextResponse } from "next/server";
import { jwtVerify } from "jose";

const JWT_SECRET = new TextEncoder().encode(
  process.env.JWT_SECRET || "springer-finance-super-secure-jwt-secret-key-2026"
);

const PROTECTED_PREFIXES = [
  "/dashboard",
  "/onboarding",
  "/organization",
  "/reports",
  "/transaction",
  "/account",
  "/profile",
];

const AUTH_ROUTES = ["/login", "/register", "/sign-in", "/sign-up"];

export async function middleware(req) {
  const { pathname } = req.nextUrl;

  const accessToken = req.cookies.get("sf_access_token")?.value;
  const refreshToken = req.cookies.get("sf_refresh_token")?.value;

  let hasValidAccessToken = false;
  let hasRefreshToken = false;

  if (accessToken) {
    try {
      await jwtVerify(accessToken, JWT_SECRET);
      hasValidAccessToken = true;
    } catch {
      // Let getCurrentUser validate the refresh token and issue a new access token.
    }
  }

  if (refreshToken) {
    try {
      await jwtVerify(refreshToken, JWT_SECRET);
      hasRefreshToken = true;
    } catch {
      hasRefreshToken = false;
    }
  }

  const canReachProtectedRoute = hasValidAccessToken || hasRefreshToken;

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  // If visiting protected route without valid session, redirect to /login
  if (isProtected && !canReachProtectedRoute) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // Only redirect auth pages when the short-lived access token is valid. A stale
  // refresh cookie must not send the browser back into a login/dashboard loop.
  if (isAuthRoute && hasValidAccessToken) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};