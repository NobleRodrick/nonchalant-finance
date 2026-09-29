"use client";

/**
 * The page side of the service worker (public/sw.js): registration, messages, and which pages
 * are saved on this computer for offline use.
 */
export const SERVICE_WORKER_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";

const supported = () => typeof navigator !== "undefined" && "serviceWorker" in navigator;

/** Registers the worker (production builds). In development any old worker is removed instead. */
export async function registerServiceWorker() {
  if (!supported()) return false;
  if (!SERVICE_WORKER_ENABLED) {
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(regs.map((r) => r.unregister()));
    return false;
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return true;
}

async function activeWorker() {
  if (!supported()) return null;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  return reg?.active || navigator.serviceWorker.controller || null;
}

/** Sends a message (no answer expected). */
export async function postToServiceWorker(message) {
  (await activeWorker())?.postMessage(message);
}

/** Sends a message and waits for the worker's answer (null without a worker or after `ms`). */
export async function askServiceWorker(message, ms = 5000) {
  const worker = await activeWorker();
  if (!worker || typeof MessageChannel === "undefined") return null;
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    const timer = setTimeout(() => resolve(null), ms);
    channel.port1.onmessage = (e) => {
      clearTimeout(timer);
      resolve(e.data);
    };
    worker.postMessage(message, [channel.port2]);
  });
}

/** Paths (with query) of the pages saved on this computer. */
export async function savedPages() {
  const answer = await askServiceWorker({ type: "saved-pages" });
  return Array.isArray(answer?.pages) ? answer.pages : [];
}

/** Asks the worker to save `urls` now (it tells the pages when it is done: "warm-done"). */
export function savePages(urls) {
  return postToServiceWorker({ type: "warm", urls });
}

/** Called with messages the worker broadcasts to the open pages. Returns an unsubscribe. */
export function onServiceWorkerMessage(listener) {
  if (!supported()) return () => {};
  const handler = (e) => listener(e.data || {});
  navigator.serviceWorker.addEventListener("message", handler);
  return () => navigator.serviceWorker.removeEventListener("message", handler);
}
