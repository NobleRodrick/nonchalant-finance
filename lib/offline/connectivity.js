/**
 * Is the server reachable right now? The browser's navigator.onLine only says whether a network
 * is connected (a phone hotspot without credit still says "online"), so it is combined with the
 * outcome of real requests and a light check of /api/health.
 */
const listeners = new Set();
let online = typeof navigator === "undefined" ? true : navigator.onLine !== false;
let started = false;
let checking = null;
let pollTimer = null;

/** While offline, the server is asked this often whether it is reachable again (tiny request). */
export const OFFLINE_POLL_MS = 5000;
/** After the browser says "online", checks at these delays (the network often needs a moment). */
const RECONNECT_CHECKS_MS = [0, 1500, 4000];

function set(value) {
  if (value === online) return;
  online = value;
  schedulePolling();
  for (const l of listeners) l(online);
}

/** Polls while offline, so the return of the connection is noticed within seconds. */
function schedulePolling() {
  clearTimeout(pollTimer);
  pollTimer = null;
  if (online || !started) return;
  pollTimer = setTimeout(async () => {
    pollTimer = null;
    await checkConnectivity(); // no request at all while the browser itself says it is offline
    schedulePolling();
  }, OFFLINE_POLL_MS);
}

export function isOnline() {
  return online;
}

export function subscribeConnectivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** A request to the server failed for network reasons. */
export function reportNetworkFailure() {
  set(false);
}

/** A request to the server succeeded. */
export function reportNetworkSuccess() {
  set(true);
}

/** Asks the server (quickly). Resolves true when it answered. */
export function checkConnectivity(timeoutMs = 8000) {
  if (typeof fetch === "undefined") return Promise.resolve(online);
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    set(false);
    return Promise.resolve(false);
  }
  if (checking) return checking;
  const controller = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), timeoutMs);
  checking = fetch(`/api/health?t=${Date.now()}`, { cache: "no-store", signal: controller?.signal, headers: { "x-sf-check": "1" } })
    .then(async (res) => {
      await res.text().catch(() => ""); // read the (tiny) body so the request completes
      set(res.ok);
      return res.ok;
    })
    .catch((error) => {
      // No answer at all: offline. Only slow (our timeout): unknown, keep what we knew (a sending
      // attempt will tell), so a busy server is not taken for a lost connection.
      if (error?.name === "AbortError") return online;
      set(false);
      return false;
    })
    .finally(() => {
      clearTimeout(timer);
      checking = null;
    });
  return checking;
}

/** Follows the browser's online/offline events (verifying "online" with the server). */
export function startConnectivity() {
  if (started || typeof window === "undefined") return;
  started = true;
  window.addEventListener("offline", () => set(false));
  window.addEventListener("online", () => {
    for (const ms of RECONNECT_CHECKS_MS) setTimeout(() => !online && checkConnectivity(), ms);
  });
  schedulePolling();
}

/** True for errors of fetch() itself (no answer from the server), as opposed to HTTP errors. */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.retryable) return true;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return error instanceof TypeError || /network|fetch|load failed|offline/i.test(String(error.message || ""));
}
