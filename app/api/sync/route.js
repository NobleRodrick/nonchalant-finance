import { getCurrentUser } from "@/lib/auth";
import { ActionError } from "@/lib/errors";
import { normalizeIdempotencyKey } from "@/lib/idempotency";
import { logEvent, newErrorId } from "@/lib/observability";
import { executeOperation } from "@/lib/operations/execute";
import { getOperation } from "@/lib/operations/registry";

export const dynamic = "force-dynamic";

const MAX_BATCH = 50;
const MAX_BODY_BYTES = 1_000_000;
const NO_STORE = { "Cache-Control": "no-store" };

function json(body, status = 200) {
  return Response.json(body, { status, headers: NO_STORE });
}

/** Only pages of this site may send operations (cookies are also SameSite=Lax). */
function sameOrigin(request) {
  const origin = request.headers.get("origin");
  if (!origin) return true;
  try {
    return new URL(origin).host === (request.headers.get("x-forwarded-host") || request.headers.get("host"));
  } catch {
    return false;
  }
}

/**
 * Receives a batch of operations from a device's outbox (lib/offline) and applies them in order.
 * Each result: applied | duplicate (already applied: its first result) | rejected (a rule refused
 * it: the head must look at it) | error (unexpected: the device retries later) | skipped (not
 * tried after an error; retried later, in order).
 */
export async function POST(request) {
  if (!sameOrigin(request)) return json({ error: "Forbidden" }, 403);
  const user = await getCurrentUser();
  if (!user) return json({ error: "Please sign in again.", code: "UNAUTHORIZED" }, 401);
  if (!user.organizationId) return json({ error: "Set up your organization first.", code: "FORBIDDEN" }, 403);

  if (Number(request.headers.get("content-length") || 0) > MAX_BODY_BYTES) return json({ error: "Too much data at once." }, 413);
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }
  const ops = Array.isArray(body?.ops) ? body.ops.slice(0, MAX_BATCH) : [];

  const results = [];
  let stopped = false;
  for (const op of ops) {
    const key = normalizeIdempotencyKey(op?.key);
    if (stopped) {
      results.push({ key: op?.key, status: "skipped" });
      continue;
    }
    if (!key || !getOperation(op?.kind)) {
      results.push({ key: op?.key, status: "rejected", code: "VALIDATION", error: "This record cannot be sent (unknown kind or missing key)." });
      continue;
    }
    try {
      const out = await executeOperation({ user, kind: op.kind, input: op.input || {}, key, occurredAt: op.occurredAt || null });
      results.push({ key, status: out.duplicate ? "duplicate" : "applied", result: out.result, appliedAt: new Date(out.appliedAt).getTime() });
    } catch (error) {
      if (error instanceof ActionError) {
        results.push({ key, status: "rejected", code: error.code, error: error.message });
        continue;
      }
      const mapped = error?.code === "P2034" ? "Another operation changed this data at the same time." : null;
      const errorId = newErrorId();
      logEvent("error", { event: "sync_operation_failed", kind: op.kind, key, errorId, userId: user.id, organizationId: user.organizationId, message: error?.message, stack: error?.stack });
      results.push({ key, status: "error", error: mapped || `Could not be saved right now (reference ${errorId}). It will be sent again.`, errorId });
      stopped = true; // keep the order: the rest is sent again after this one
    }
  }
  return json({ serverTime: Date.now(), results });
}
