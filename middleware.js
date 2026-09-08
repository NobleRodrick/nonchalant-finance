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

  let isValidSession = false;

  if (accessToken) {
    try {
      await jwtVerify(accessToken, JWT_SECRET);
      isValidSession = true;
    } catch {
      // Access token expired, check if refresh token exists
      isValidSession = !!refreshToken;
    }
  } else if (refreshToken) {
    try {
      await jwtVerify(refreshToken, JWT_SECRET);
      isValidSession = true;
    } catch {
      isValidSession = false;
    }
  }

  const isProtected = PROTECTED_PREFIXES.some((prefix) =>
    pathname.startsWith(prefix)
  );
  const isAuthRoute = AUTH_ROUTES.some((route) => pathname === route);

  // If visiting protected route without valid session, redirect to /login
  if (isProtected && !isValidSession) {
    const url = new URL("/login", req.url);
    url.searchParams.set("redirect", pathname);
    return NextResponse.redirect(url);
  }

  // If already logged in and visiting /login or /register, redirect to /dashboard
  if (isAuthRoute && isValidSession) {
    return NextResponse.redirect(new URL("/dashboard", req.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};