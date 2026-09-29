"use client";

import { useEffect, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { OfflineContext } from "@/lib/offline/react";
import { getMeta, loadOutbox, setMeta } from "@/lib/offline/outbox";
import { syncEngine } from "@/lib/offline/sync-engine";
import { checkConnectivity, isOnline } from "@/lib/offline/connectivity";

const SW_ENABLED = process.env.NODE_ENV === "production" || process.env.NEXT_PUBLIC_ENABLE_SW === "1";
const WARM_EVERY_MS = 10 * 60 * 1000;

/** Tells the service worker something (no-op without one). */
export async function postToServiceWorker(message) {
  if (typeof navigator === "undefined" || !navigator.serviceWorker) return;
  const reg = await navigator.serviceWorker.getRegistration().catch(() => null);
  (reg?.active || navigator.serviceWorker.controller)?.postMessage(message);
}

async function registerServiceWorker() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return false;
  if (!SW_ENABLED) {
    // Development: never keep an old worker around (it would serve stale code).
    const regs = await navigator.serviceWorker.getRegistrations().catch(() => []);
    await Promise.all(regs.map((r) => r.unregister()));
    return false;
  }
  await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  await navigator.serviceWorker.ready;
  return true;
}

/**
 * Sends a proof file saved on this device; returns its id. A refused file throws (the record is
 * sent without it); no connection or a server error throws a retryable error (sent again later).
 */
async function uploadFile(file, departmentId) {
  const fd = new FormData();
  fd.append("file", file);
  if (departmentId) fd.append("departmentId", departmentId);
  const res = await fetch("/api/attachments", { method: "POST", body: fd, credentials: "same-origin" });
  const body = await res.json().catch(() => ({}));
  if (res.ok) return body.id;
  const error = new Error(body.error || "The file could not be sent.");
  if (res.status >= 500) error.retryable = true;
  if (res.status === 401) error.authRequired = true;
  throw error;
}

function warmedRecently(key) {
  try {
    const at = Number(sessionStorage.getItem(`sf-warm:${key}`) || 0);
    return Date.now() - at < WARM_EVERY_MS;
  } catch {
    return false;
  }
}

function markWarmed(key) {
  try {
    sessionStorage.setItem(`sf-warm:${key}`, String(Date.now()));
  } catch {
    // storage unavailable: warm again next time
  }
}

/**
 * Offline support for the signed-in app:
 *  - opens this person's outbox and starts sending it (lib/offline/sync-engine);
 *  - registers the service worker and keeps the pages of the person's departments saved so they
 *    open without a connection (`warmUrls`);
 *  - refreshes the page when records reach the server, so the figures come from the server again;
 *  - when another person signs in on this computer, removes the previous person's saved pages.
 */
export function OfflineProvider({ userId, userName, timeZone, warmUrls = [], children }) {
  const router = useRouter();
  const refreshTimer = useRef(null);
  const warmTimer = useRef(null);
  const swReady = useRef(false);
  const context = useMemo(() => ({ userId, userName, timeZone, enabled: true }), [userId, userName, timeZone]);
  const warmKey = warmUrls.join("|");

  useEffect(() => {
    let cancelled = false;
    const warm = (force = false) => {
      if (!swReady.current || !isOnline() || !warmUrls.length) return;
      if (!force && warmedRecently(warmKey)) return;
      markWarmed(warmKey);
      postToServiceWorker({ type: "warm", urls: warmUrls });
    };
    const onApplied = () => {
      clearTimeout(refreshTimer.current);
      refreshTimer.current = setTimeout(() => {
        if (document.visibilityState === "visible" && isOnline()) router.refresh();
      }, 300);
      // The saved copies of the pages should include what was just sent.
      clearTimeout(warmTimer.current);
      warmTimer.current = setTimeout(() => warm(true), 20000);
    };
    (async () => {
      try {
        const last = await getMeta("lastUserId");
        if (last && last !== userId) await postToServiceWorker({ type: "purge-pages" });
        await setMeta("lastUserId", userId);
        await loadOutbox(userId);
      } catch {
        // IndexedDB unavailable: the outbox works in memory while this page is open
        await loadOutbox(userId).catch(() => {});
      }
      if (cancelled) return;
      syncEngine?.start({ userId, upload: uploadFile, onApplied });
      checkConnectivity();
      swReady.current = await registerServiceWorker().catch(() => false);
      if (!cancelled) warm();
    })();
    return () => {
      cancelled = true;
      clearTimeout(refreshTimer.current);
      clearTimeout(warmTimer.current);
    };
    // warmUrls is represented by warmKey
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [userId, warmKey, router]);

  return <OfflineContext.Provider value={context}>{children}</OfflineContext.Provider>;
}
