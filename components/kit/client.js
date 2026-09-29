"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { isNetworkError, isOnline, reportNetworkFailure } from "@/lib/offline/connectivity";

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
    if (isNetworkError(e)) {
      reportNetworkFailure();
      toast.error("No connection. This needs the internet: try again when the connection is back.");
      return null;
    }
    toast.error(e?.message || error || "Something went wrong.");
    return null;
  }
}

/**
 * Keeps a page's figures current while it is visible and connected: refreshes the server data
 * every `seconds` (the Boss may request cash or return a report) and when the tab becomes
 * visible again. Never while offline (the page shows its saved figures + this device's records).
 */
export function useLiveRefresh(seconds = 60) {
  const router = useRouter();
  useEffect(() => {
    let timer = null;
    const tick = () => {
      if (document.visibilityState === "visible" && isOnline()) router.refresh();
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(tick, seconds * 1000);
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        if (isOnline()) router.refresh();
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
