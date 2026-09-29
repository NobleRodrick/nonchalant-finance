import { isOnline } from "@/lib/offline/connectivity";

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
  if (isOnline()) router.push(href);
  else window.location.assign(href);
}
