/**
 * Is the server reachable right now? The browser's navigator.onLine only says whether a network
 * is connected (a phone hotspot without credit still says "online"), so it is combined with the
 * outcome of real requests and a light check of /api/health.
 */
const listeners = new Set();

/**
 * The last known state is kept for this tab (sessionStorage): a page loaded while offline (from
 * the copy saved on this computer) starts offline instead of assuming a connection that the
 * browser cannot confirm (a connection that hangs still says "online").
 */
const REMEMBER_KEY = "sf-offline";

function rememberedOffline() {
  try {
    return typeof sessionStorage !== "undefined" && sessionStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

function remember(value) {
  try {
    if (value) sessionStorage.removeItem(REMEMBER_KEY);
    else sessionStorage.setItem(REMEMBER_KEY, "1");
  } catch {
    // storage unavailable: nothing remembered
  }
}

let online = typeof navigator === "undefined" ? true : navigator.onLine !== false && !rememberedOffline();
let started = false;
let checking = null;
let pollTimer = null;

/** While offline, the server is asked this often whether it is reachable again (tiny request). */
export const OFFLINE_POLL_MS = 5000;
/** After the browser says "online", checks at these delays (the network often needs a moment). */
const RECONNECT_CHECKS_MS = [0, 1500, 4000];

/** The page is being left: requests it had in flight are cut by the browser, not by the network. */
let leaving = false;

function set(value) {
  if (!value && leaving) return;
  if (value === online) return;
  online = value;
  remember(value);
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

/**
 * How long the server may take to answer the check. Development compiles routes on first use
 * (several seconds), so it gets longer; anything slower counts as no connection.
 */
export const DEV_SLOWNESS = process.env.NODE_ENV === "development" ? 4 : 1;
const CHECK_TIMEOUT_MS = 8000;

/** Asks the server (quickly). Resolves true when it answered. */
export function checkConnectivity(timeoutMs = CHECK_TIMEOUT_MS) {
  timeoutMs *= DEV_SLOWNESS;
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
    .catch(() => {
      // No answer, or none within the time limit: /api/health does no work at all, so a connection
      // that hangs this long is as good as none (a weak mobile signal, a hotspot without credit).
      // Polling notices the return within seconds.
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
  window.addEventListener("pagehide", () => {
    leaving = true;
  });
  window.addEventListener("pageshow", () => {
    leaving = false;
  });
  window.addEventListener("beforeunload", () => {
    leaving = true;
    setTimeout(() => {
      leaving = false; // the page stayed (the departure was cancelled)
    }, 3000);
  });
  window.addEventListener("offline", () => set(false));
  window.addEventListener("online", () => {
    for (const ms of RECONNECT_CHECKS_MS) setTimeout(() => !online && checkConnectivity(), ms);
  });
  if (!online) checkConnectivity(); // started offline (remembered): is the connection back already?
  schedulePolling();
}

/** True for errors of fetch() itself (no answer from the server), as opposed to HTTP errors. */
export function isNetworkError(error) {
  if (!error) return false;
  if (error.retryable) return true;
  if (error.name === "AbortError" || error.name === "TimeoutError") return true;
  return error instanceof TypeError || /network|fetch|load failed|offline/i.test(String(error.message || ""));
}
