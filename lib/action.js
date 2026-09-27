import { ActionError } from "@/lib/errors";
import { logActionResult, newErrorId } from "@/lib/observability";
import { serialize } from "@/lib/serialize";

/**
 * Runs a server-action body with uniform error handling.
 * Returns { success: true, data } or { success: false, error, code, errorId }.
 * Known validation/permission errors keep their message; unexpected errors are
 * logged with an error id and a generic message is returned to the client.
 */
export async function runAction(name, fn, context = {}) {
  const started = Date.now();
  try {
    const data = await fn();
    logActionResult({ action: name, durationMs: Date.now() - started, ...context });
    return { success: true, data: serialize(data) };
  } catch (error) {
    const errorId = newErrorId();
    const mapped = mapPrismaError(error);
    logActionResult({
      action: name,
      durationMs: Date.now() - started,
      error: mapped,
      errorId,
      ...context,
    });
    if (mapped instanceof ActionError) {
      return { success: false, error: mapped.message, code: mapped.code, errorId };
    }
    return {
      success: false,
      error: `Something went wrong. Please try again (reference ${errorId}).`,
      code: "INTERNAL",
      errorId,
    };
  }
}

function mapPrismaError(error) {
  if (error instanceof ActionError) return error;
  if (error?.code === "P2002") {
    return new ActionError("CONFLICT", "A record with these details already exists.");
  }
  if (error?.code === "P2025") {
    return new ActionError("NOT_FOUND", "Record not found.");
  }
  if (error?.code === "P2034") {
    return new ActionError("CONFLICT", "Another operation changed this data at the same time. Please retry.");
  }
  return error;
}
