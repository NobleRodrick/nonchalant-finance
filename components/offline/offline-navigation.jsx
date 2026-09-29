"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { internalNavigationTarget, navigationSettled, watchNavigation } from "@/lib/navigation";
import { isOnline } from "@/lib/offline/connectivity";

/**
 * Offline, a click on a link of the app loads the page itself (not the app router, which needs the
 * server): the service worker answers at once with the copy saved on this computer, or explains
 * that the page was never opened here. Online, links work as usual, but a move that does not
 * arrive while the server does not answer (a connection that hangs) switches to the same normal
 * page load (lib/navigation → watchNavigation).
 */
export function OfflineNavigation() {
  const pathname = usePathname();
  useEffect(() => {
    navigationSettled();
  }, [pathname]);

  useEffect(() => {
    const onClick = (e) => {
      const url = internalNavigationTarget(e);
      if (!url) return;
      if (isOnline()) {
        watchNavigation(url.toString());
        return;
      }
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
