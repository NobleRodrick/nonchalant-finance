/* Springer Finance service worker: opens the app without a connection.
 *
 *  - Pages (HTML): network first. Every page opened (or warmed, see "warm") is kept, so when the
 *    connection is gone the last copy is shown; the page then adds what this computer recorded
 *    since (lib/offline/overlay). A page never opened on this computer shows /offline.html.
 *  - App code (/_next/static, immutable file names): cache first.
 *  - Data requests of the app router (RSC): network only. When they fail the router falls back
 *    to loading the page itself, which the rule above serves.
 *  - Writes never go through here: the app's outbox (IndexedDB) sends them to /api/sync.
 * The pages cache holds the signed-in person's data: it is emptied at sign-out and when another
 * person signs in on this computer ("purge-pages").
 */
const VERSION = "2"; // v2: code files cached under one key (see staticKey)
const STATIC_CACHE = `sf-static-v${VERSION}`;
const ASSETS_CACHE = `sf-assets-v${VERSION}`;
const PAGES_CACHE = `sf-pages-v${VERSION}`; // a new version saves the pages (and their code) again
const OFFLINE_URL = "/offline.html";
const PRECACHE = [OFFLINE_URL, "/logo.jpg"];
const NAV_TIMEOUT_MS = 12000;
const MAX_PAGES = 80;
const MAX_STATIC = 500;
const KEEP = [STATIC_CACHE, ASSETS_CACHE, PAGES_CACHE];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(ASSETS_CACHE)
      .then((c) => c.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((n) => n.startsWith("sf-") && !KEEP.includes(n)).map((n) => caches.delete(n)));
      if (self.registration.navigationPreload) await self.registration.navigationPreload.enable().catch(() => {});
      await self.clients.claim();
    })()
  );
});

function pageKey(url) {
  const u = new URL(url);
  u.searchParams.delete("_rsc");
  u.hash = "";
  return u.toString();
}

async function trim(cacheName, max) {
  const cache = await caches.open(cacheName);
  const keys = await cache.keys();
  for (let i = 0; i < keys.length - max; i += 1) await cache.delete(keys[i]);
}

function isHtml(response) {
  return (response.headers.get("content-type") || "").includes("text/html");
}

/** A page worth keeping: a real page of the signed-in app (not the sign-in page). */
function keepable(response) {
  if (!response || !response.ok || !isHtml(response)) return false;
  const final = new URL(response.url || self.location.origin);
  return !["/login", "/register", "/"].includes(final.pathname);
}

async function storePage(url, response) {
  const cache = await caches.open(PAGES_CACHE);
  await cache.put(pageKey(url), response);
  trim(PAGES_CACHE, MAX_PAGES);
}

async function cachedPage(url) {
  const cache = await caches.open(PAGES_CACHE);
  const exact = await cache.match(pageKey(url), { ignoreVary: true });
  if (exact) return exact;
  // Same page for another day (?date=…): better than nothing? No — figures would be of another day.
  return null;
}

function timeout(ms) {
  return new Promise((_, reject) => setTimeout(() => reject(new Error("timeout")), ms));
}

async function handleNavigation(event) {
  const { request } = event;
  const network = (async () => {
    const preload = await event.preloadResponse;
    return preload || fetch(request);
  })();
  network.catch(() => {}); // handled below; avoid an unhandled rejection after a timeout
  try {
    const response = await Promise.race([network, timeout(NAV_TIMEOUT_MS)]);
    if (keepable(response)) event.waitUntil(storePage(request.url, response.clone()));
    return response;
  } catch {
    // Too slow or no connection: show the last copy now, keep the fresh one if it still arrives.
    event.waitUntil(network.then((r) => (keepable(r) ? storePage(request.url, r.clone()) : null)).catch(() => {}));
    const cached = await cachedPage(request.url);
    if (cached) return cached;
    const offline = await caches.match(OFFLINE_URL);
    return offline || new Response("You are offline.", { status: 503, headers: { "Content-Type": "text/plain" } });
  }
}

/**
 * One cache key per code file, however its URL is written: the router asks for
 * ".../%5BdeptId%5D/..." while the page's data names ".../[deptId]/...".
 */
function staticKey(url) {
  const u = new URL(url, self.location.origin);
  let path = u.pathname;
  try {
    path = decodeURI(path);
  } catch {
    // keep as is
  }
  return `${u.origin}${path}${u.search}`;
}

async function handleStatic(request) {
  const cache = await caches.open(STATIC_CACHE);
  const key = staticKey(request.url);
  const hit = await cache.match(key);
  if (hit) return hit;
  const response = await fetch(request);
  if (response.ok) {
    cache.put(key, response.clone());
    trim(STATIC_CACHE, MAX_STATIC);
  }
  return response;
}

async function handleAsset(event) {
  const cache = await caches.open(ASSETS_CACHE);
  const hit = await cache.match(event.request);
  const refresh = fetch(event.request)
    .then((response) => {
      if (response.ok) cache.put(event.request, response.clone());
      return response;
    })
    .catch(() => null);
  if (hit) {
    event.waitUntil(refresh);
    return hit;
  }
  return (await refresh) || Response.error();
}

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/") || url.pathname === "/sw.js") return;

  // App router data requests: network only (fail fast so the router loads the page instead).
  if (request.headers.get("RSC") === "1" || url.searchParams.has("_rsc")) {
    event.respondWith(fetch(request).catch(() => Response.error()));
    return;
  }
  if (request.mode === "navigate") {
    event.respondWith(handleNavigation(event));
    return;
  }
  if (url.pathname.startsWith("/_next/static/")) {
    event.respondWith(handleStatic(request));
    return;
  }
  if (url.pathname.startsWith("/_next/image") || /\.(?:png|jpe?g|webp|svg|ico|woff2?)$/i.test(url.pathname)) {
    event.respondWith(handleAsset(event));
  }
});

/**
 * The code a page needs: script and style tags (/_next/static/…) and the chunks the router loads
 * later, which the page's embedded data names relative to /_next/ ("static/chunks/…").
 */
function assetsOf(html) {
  // Route groups put parentheses in chunk paths ("app/(main)/…"): they are part of the name.
  const found = html.match(/(?:\/_next\/)?static\/(?:chunks|css|media)\/[^"'\\\s<>]+/g) || [];
  return [...new Set(found.map((a) => (a.startsWith("/_next/") ? a : `/_next/${a}`)))];
}

/** Fonts and images a style sheet needs (url(...) inside it). */
function assetsOfCss(css) {
  const found = [...css.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map((m) => m[1]);
  return found.filter((u) => u.startsWith("/_next/static/"));
}

/** Fetches pages (and their code) now, so they open offline later. */
async function warm(urls) {
  const staticCache = await caches.open(STATIC_CACHE);
  const seen = new Set();
  for (const url of urls.slice(0, 40)) {
    try {
      const response = await fetch(url, { credentials: "same-origin", cache: "no-store", headers: { "x-sf-warm": "1" } });
      if (!keepable(response)) continue;
      const html = await response.clone().text();
      await storePage(new URL(url, self.location.origin).toString(), response);
      // Code the page needs (script and style files, fonts), including the router's lazy chunks.
      const assets = assetsOf(html);
      for (const a of assets) {
        if (seen.has(a)) continue;
        seen.add(a);
        if (await staticCache.match(staticKey(a))) continue;
        const r = await fetch(a).catch(() => null);
        if (!r || !r.ok) continue;
        if (a.includes("/static/css/")) assets.push(...assetsOfCss(await r.clone().text()).filter((u) => !seen.has(u)));
        await staticCache.put(staticKey(a), r);
      }
    } catch {
      // offline or refused: try again at the next warm
    }
  }
  trim(STATIC_CACHE, MAX_STATIC);
}

let warming = null;

/** Tells every open page of the app something (e.g. pages were saved). */
async function broadcast(message) {
  const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
  for (const c of all) c.postMessage(message);
}

/** Paths (with query) of the saved pages. */
async function savedPages() {
  const cache = await caches.open(PAGES_CACHE);
  return (await cache.keys()).map((r) => {
    const u = new URL(r.url);
    return `${u.pathname}${u.search}`;
  });
}

self.addEventListener("message", (event) => {
  const data = event.data || {};
  if (data.type === "warm" && Array.isArray(data.urls)) {
    // One saving round at a time; a request during a round starts another one after it.
    const run = (warming || Promise.resolve()).catch(() => {}).then(() => warm(data.urls)).then(async () => broadcast({ type: "warm-done", pages: await savedPages() }));
    warming = run;
    run
      .finally(() => {
        if (warming === run) warming = null;
      })
      .catch(() => {});
    event.waitUntil(run);
  } else if (data.type === "saved-pages") {
    event.waitUntil(savedPages().then((pages) => event.ports[0]?.postMessage({ pages })));
  } else if (data.type === "purge-pages") {
    event.waitUntil(caches.delete(PAGES_CACHE));
  } else if (data.type === "skip-waiting") {
    self.skipWaiting();
  }
});
