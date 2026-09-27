"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

function newKey() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID().replace(/-/g, "");
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
}

/**
 * Idempotency key for one form submission: the same key is re-sent on retries and double
 * clicks, so the money is recorded once. Call `renew()` after a successful submission.
 */
export function useIdempotencyKey() {
  const [key, setKey] = useState(newKey);
  const renew = useCallback(() => setKey(newKey()), []);
  return [key, renew];
}

/** Runs a server action ({ success, data, error }) and shows a toast. Returns data or null. */
export async function runWithToast(promise, { success, error } = {}) {
  try {
    const res = await promise;
    if (res?.success) {
      if (res.data?.duplicate) toast.info("Already recorded: this entry was received earlier.");
      else if (success) toast.success(typeof success === "function" ? success(res.data) : success);
      return res.data ?? true;
    }
    toast.error(res?.error || error || "Something went wrong.");
    return null;
  } catch (e) {
    toast.error(e?.message || error || "Something went wrong.");
    return null;
  }
}

/**
 * Keeps a page's figures current while it is visible: refreshes the server data every
 * `seconds` (another cashier may be selling) and when the tab becomes visible again.
 */
export function useLiveRefresh(seconds = 20) {
  const router = useRouter();
  useEffect(() => {
    let timer = null;
    const tick = () => {
      if (document.visibilityState === "visible") router.refresh();
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(tick, seconds * 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        router.refresh();
        start();
      } else clearInterval(timer);
    };
    start();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router, seconds]);
}

/** Whole-number input parsing ("" stays ""). */
export function wholeNumber(value) {
  if (value === "" || value === null || value === undefined) return "";
  const n = Number(String(value).replace(/\s/g, ""));
  return Number.isFinite(n) ? Math.trunc(n) : "";
}
