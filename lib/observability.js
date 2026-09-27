/**
 * Minimal structured logging for server actions (plan Phase 10: observability around
 * failed server actions). Emits one JSON line per failure / slow call so logs can be
 * searched by action name, error id, user and organization.
 */
const SLOW_MS = Number(process.env.SLOW_ACTION_MS || 3000);

export function newErrorId() {
  return `err_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export function logEvent(level, payload) {
  if (level === "warn" && process.env.QUIET_ACTION_WARNINGS === "1") return;
  const line = JSON.stringify({ ts: new Date().toISOString(), level, ...payload });
  if (level === "error") console.error(line);
  else if (level === "warn") console.warn(line);
  else if (process.env.LOG_LEVEL === "debug") console.log(line);
}

export function logActionResult({ action, durationMs, userId, organizationId, error, errorId }) {
  if (error) {
    logEvent(error.name === "ActionError" ? "warn" : "error", {
      event: "action_failed",
      action,
      errorId,
      code: error.code || "INTERNAL",
      message: error.message,
      userId,
      organizationId,
      durationMs,
      stack: error.name === "ActionError" ? undefined : error.stack,
    });
  } else if (durationMs > SLOW_MS) {
    logEvent("warn", { event: "action_slow", action, durationMs, userId, organizationId });
  }
}
