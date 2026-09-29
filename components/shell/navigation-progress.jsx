"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const START_EVENT = "sf:navigation-start";

/** Call before a programmatic router.push() so the bar shows at once. */
export function startNavigationProgress() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event(START_EVENT));
}

function isInternalNavigation(event) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  const a = event.target instanceof Element ? event.target.closest("a[href]") : null;
  if (!a || a.target === "_blank" || a.hasAttribute("download")) return false;
  const url = new URL(a.href, window.location.href);
  if (url.origin !== window.location.origin) return false;
  const here = window.location;
  if (url.pathname === here.pathname && url.search === here.search) return false; // same page or a #hash
  return true;
}

function Bar() {
  const pathname = usePathname();
  const search = useSearchParams();
  const route = `${pathname}?${search}`;
  const routeRef = useRef(route);
  const safety = useRef(null);
  // The route that was on screen when a navigation started (null: nothing loading).
  const [from, setFrom] = useState(null);
  const phase = from === null ? "idle" : from === route ? "running" : "finishing";

  useEffect(() => {
    routeRef.current = route;
  }, [route]);

  useEffect(() => {
    const start = () => {
      setFrom(routeRef.current);
      clearTimeout(safety.current);
      safety.current = setTimeout(() => setFrom(null), 15000); // never stuck
    };
    const onClick = (e) => {
      if (isInternalNavigation(e)) start();
    };
    document.addEventListener("click", onClick, true);
    window.addEventListener(START_EVENT, start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener(START_EVENT, start);
      clearTimeout(safety.current);
    };
  }, []);

  // The new route is on screen: complete the bar, then hide it.
  useEffect(() => {
    if (phase !== "finishing") return undefined;
    const t = setTimeout(() => setFrom(null), 350);
    return () => clearTimeout(t);
  }, [phase]);

  if (phase === "idle") return null;
  return (
    <div aria-hidden="true" className="pointer-events-none fixed inset-x-0 top-0 z-[100] h-0.5 print:hidden" data-testid="navigation-progress">
      <div
        className={phase === "running" ? "h-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.7)] sf-progress-run" : "h-full w-full bg-emerald-500 opacity-0 transition-opacity duration-300"}
      />
    </div>
  );
}

/** A thin bar at the top of the window from the click until the next page is on screen. */
export function NavigationProgress() {
  return (
    <Suspense fallback={null}>
      <Bar />
    </Suspense>
  );
}
