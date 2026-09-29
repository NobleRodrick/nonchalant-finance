export const dynamic = "force-dynamic";

/** Connectivity check for devices (is the server reachable right now?). No database access. */
export function GET() {
  return Response.json({ ok: true, serverTime: Date.now() }, { headers: { "Cache-Control": "no-store" } });
}

export function HEAD() {
  return new Response(null, { headers: { "Cache-Control": "no-store" } });
}
