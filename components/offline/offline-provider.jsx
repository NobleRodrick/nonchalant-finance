"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { OfflineContext, OfflinePagesContext } from "@/lib/offline/react";
import { getMeta, getSnapshot, loadOutbox, setMeta } from "@/lib/offline/outbox";
import { syncEngine } from "@/lib/offline/sync-engine";
import { checkConnectivity, isOnline, subscribeConnectivity } from "@/lib/offline/connectivity";
import { STATUS } from "@/lib/offline/status";
import { onServiceWorkerMessage, postToServiceWorker, registerServiceWorker, savedPages, savePages } from "@/lib/offline/service-worker";
import { OfflineNavigation } from "./offline-navigation";

export { postToServiceWorker };

const RESAVE_EVERY_MS = 10 * 60 * 1000;
const RESAVE_AFTER_SEND_MS = 20000;

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

/** Refreshes the page's server figures soon (grouped: several triggers, one refresh). */
function useRefreshSoon() {
  const router = useRouter();
  const timer = useRef(null);
  useEffect(() => () => clearTimeout(timer.current), []);
  return useCallback(() => {
    clearTimeout(timer.current);
    timer.current = setTimeout(() => {
      if (document.visibilityState === "visible" && isOnline()) router.refresh();
    }, 300);
  }, [router]);
}

/**
 * The pages of this person saved on this computer (service worker): saves them as soon as the
 * worker runs, when some are missing, every 10 minutes, after records were sent and when the
 * connection comes back. Returns what the sync panel shows.
 */
function useSavedPages(urls) {
  const key = urls.join("|");
  const [enabled, setEnabled] = useState(false);
  const [saved, setSaved] = useState([]);
  const [saving, setSaving] = useState(false);
  const lastSave = useRef(0);
  const resaveTimer = useRef(null);

  const saveNow = useCallback(() => {
    if (!enabled || !isOnline() || !urls.length) return;
    lastSave.current = Date.now();
    setSaving(true);
    savePages(urls);
    // urls is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key]);

  // Register the worker, then follow what it saved.
  useEffect(() => {
    let alive = true;
    registerServiceWorker()
      .then((ok) => alive && setEnabled(ok))
      .catch(() => {});
    const off = onServiceWorkerMessage((msg) => {
      if (msg.type === "warm-done") {
        setSaving(false);
        if (Array.isArray(msg.pages)) setSaved(msg.pages);
      }
    });
    return () => {
      alive = false;
      off();
    };
  }, []);

  // First save as soon as possible (pages missing), then every 10 minutes while the app is open.
  useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    savedPages().then((pages) => {
      if (!alive) return;
      setSaved(pages);
      if (urls.some((u) => !pages.includes(u))) saveNow();
    });
    const every = setInterval(() => Date.now() - lastSave.current >= RESAVE_EVERY_MS && saveNow(), 60000);
    return () => {
      alive = false;
      clearInterval(every);
    };
    // urls is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, saveNow]);

  useEffect(() => () => clearTimeout(resaveTimer.current), []);
  const saveSoon = useCallback(() => {
    clearTimeout(resaveTimer.current);
    resaveTimer.current = setTimeout(saveNow, RESAVE_AFTER_SEND_MS);
  }, [saveNow]);

  const pages = useMemo(() => {
    const missing = urls.filter((u) => !saved.includes(u));
    return { enabled, total: urls.length, ready: urls.length - missing.length, missing, saving, saveNow };
    // urls is represented by key
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, key, saved, saving, saveNow]);
  return { pages, saveNow, saveSoon };
}

/** This person's outbox and the sync engine (sending, refresh after sending). */
function useOutbox(userId, { onSent }) {
  const onSentRef = useRef(onSent);
  useEffect(() => {
    onSentRef.current = onSent;
  }, [onSent]);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Another person signs in on this computer: the previous person's saved pages go.
        const last = await getMeta("lastUserId");
        if (last && last !== userId) await postToServiceWorker({ type: "purge-pages" });
        await setMeta("lastUserId", userId);
        await loadOutbox(userId);
      } catch {
        // IndexedDB unavailable: the outbox works in memory while this page is open
        await loadOutbox(userId).catch(() => {});
      }
      if (cancelled) return;
      syncEngine?.start({ userId, upload: uploadFile, onApplied: (ops) => onSentRef.current?.(ops) });
      checkConnectivity();
    })();
    return () => {
      cancelled = true;
    };
  }, [userId]);
}

/**
 * When the connection comes back: send what waits, save the pages again, refresh the figures,
 * and say so.
 */
function useReconnect({ userId, onBack }) {
  const onBackRef = useRef(onBack);
  useEffect(() => {
    onBackRef.current = onBack;
  }, [onBack]);
  useEffect(
    () =>
      subscribeConnectivity(async (online) => {
        if (!online || !syncEngine) return;
        const waiting = getSnapshot().filter((op) => op.userId === userId && (op.status === STATUS.PENDING || op.status === STATUS.SENDING)).map((op) => op.key);
        await syncEngine.flush();
        const sent = getSnapshot().filter((op) => waiting.includes(op.key) && op.status === STATUS.APPLIED).length;
        const refused = getSnapshot().filter((op) => waiting.includes(op.key) && op.status === STATUS.REJECTED).length;
        onBackRef.current?.();
        if (!waiting.length) toast.success("Back online.");
        else if (refused) toast.warning(`Back online: ${sent} record(s) sent, ${refused} need attention (see the top bar).`);
        else if (sent) toast.success(`Back online: ${sent} record(s) sent.`);
        else toast.info("Back online. Sending what was recorded…");
      }),
    [userId]
  );
}

/**
 * Offline support for the signed-in app: the outbox and its sending, the pages saved for offline
 * use, links that keep working without a connection, and the automatic refresh when the
 * connection comes back (see docs/OFFLINE_AND_PERFORMANCE.md).
 */
export function OfflineProvider({ userId, userName, timeZone, warmUrls = [], children }) {
  const refreshSoon = useRefreshSoon();
  const { pages, saveNow, saveSoon } = useSavedPages(warmUrls);
  const onSent = useCallback(() => {
    refreshSoon();
    saveSoon(); // the saved copies should include what was just sent
  }, [refreshSoon, saveSoon]);
  const onBack = useCallback(() => {
    refreshSoon();
    saveNow();
  }, [refreshSoon, saveNow]);
  useOutbox(userId, { onSent });
  useReconnect({ userId, onBack });

  const context = useMemo(() => ({ userId, userName, timeZone, enabled: true }), [userId, userName, timeZone]);
  return (
    <OfflineContext.Provider value={context}>
      <OfflinePagesContext.Provider value={pages}>
        <OfflineNavigation />
        {children}
      </OfflinePagesContext.Provider>
    </OfflineContext.Provider>
  );
}
