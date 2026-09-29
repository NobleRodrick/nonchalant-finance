"use client";

import { useEffect } from "react";
import { internalNavigationTarget } from "@/lib/navigation";
import { isOnline } from "@/lib/offline/connectivity";

/**
 * Offline, a click on a link of the app loads the page itself (not the app router, which needs the
 * server): the service worker answers at once with the copy saved on this computer, or explains
 * that the page was never opened here. Online, links work as usual.
 */
export function OfflineNavigation() {
  useEffect(() => {
    const onClick = (e) => {
      if (isOnline()) return;
      const url = internalNavigationTarget(e);
      if (!url) return;
      e.preventDefault();
      e.stopPropagation(); // the router's own handler (on the app root) must not run
      window.location.assign(url.toString());
    };
    // Capture phase on the document: runs before the router's handler.
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);
  return null;
}
