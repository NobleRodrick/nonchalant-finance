import { clerkMiddleware, createRouteMatcher } from '@clerk/nextjs/server';
import { NextResponse } from 'next/server';

const isProtectedRoute = createRouteMatcher([
  "/dashboard/(.*)",
  "/account(.*)",
  "/transaction(.*)",
]);

// Keep middleware minimal and Edge-friendly: only Clerk here.
// Arcjet is moved to a server API route (app/api/arcjet/route.js)
// so it won't be bundled into the Edge Function.
const clerk = clerkMiddleware(async (auth, req) => {
  const { userId } = await auth();
  if (!userId && isProtectedRoute(req)) {
    const { redirectToSignIn } = await auth();
    return redirectToSignIn();
  }
});

// Compose Clerk middleware with a lightweight server-side Arcjet check.
// The Arcjet check runs in a serverless function (`/api/arcjet`) so the
// heavy Arcjet SDK is not bundled into the Edge Function. This middleware
// will call the server route for protected routes and act on its decision.
export default async function middleware(req, ev) {
  // First run Clerk middleware (handles auth/redirects). If it returns a
  // Response (like redirect to sign-in), return it immediately.
  const clerkResponse = await clerk(req, ev);
  if (clerkResponse) return clerkResponse;

  // Only run Arcjet server-side check for protected routes to minimize calls.
  try {
    if (isProtectedRoute(req)) {
      const url = new URL('/api/arcjet', req.url);
      const res = await fetch(url.toString(), {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          path: req.nextUrl.pathname,
          method: req.method,
          // Forward a few useful headers; server route can use them if needed
          userAgent: req.headers.get('user-agent'),
        }),
      });

      // Expect `{ block: true }` to indicate a blocked request. Default to
      // allow when the server route doesn't provide a block decision.
      const data = await res.json().catch(() => ({}));
      if (data && data.block) {
        return new NextResponse('Forbidden', { status: 403 });
      }
    }
  } catch (err) {
    // Fail-open: if the Arcjet server check errors, allow the request so we
    // don't break user flows. This preserves app functionality.
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    '/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)',
    // Always run for API routes
    '/(api|trpc)(.*)',
  ],
};