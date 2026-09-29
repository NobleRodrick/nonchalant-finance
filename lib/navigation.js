import { DEV_SLOWNESS, checkConnectivity, isOnline } from "@/lib/offline/connectivity";

/** A move through the app router that has not arrived after this long checks the connection. */
export const NAVIGATION_WATCH_MS = 5000 * DEV_SLOWNESS;

let watched = null;

/**
 * Watches a move made through the app router: when it has not arrived after NAVIGATION_WATCH_MS
 * and the server does not answer, the connection hangs rather than fails (the browser still says
 * "online"), so the page is loaded normally instead and the service worker answers with the copy
 * saved on this computer.
 */
export function watchNavigation(href) {
  clearTimeout(watched?.timer);
  const target = new URL(href, window.location.href).toString();
  const entry = { target };
  entry.timer = setTimeout(async () => {
    if (watched !== entry) return;
    const reachable = await checkConnectivity(4000);
    if (watched === entry && !reachable) {
      watched = null;
      window.location.assign(target);
    }
  }, NAVIGATION_WATCH_MS);
  watched = entry;
}

/** The app arrived on a new page: nothing to watch any more. */
export function navigationSettled() {
  clearTimeout(watched?.timer);
  watched = null;
}

/**
 * Clicks that navigate inside the app (shared by the progress bar and offline navigation).
 * Returns the target URL, or null for anything the browser should handle itself (new tab,
 * download, another site, modifier keys, the same page or a #hash).
 */
export function internalNavigationTarget(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return null;
  const a = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!a || (a.target && a.target !== "_self") || a.hasAttribute("download")) return null;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return null;
  const here = window.location;
  if (url.pathname === here.pathname && url.search === here.search) return null;
  return url;
}

/**
 * Goes to `href`. Online: the app router (fast, no reload). Offline: a normal page load, which the
 * service worker answers with the page saved on this computer (the router would need the server).
 */
export function navigateTo(router, href) {
  if (isOnline()) {
    router.push(href);
    watchNavigation(href);
  } else window.location.assign(href);
}
