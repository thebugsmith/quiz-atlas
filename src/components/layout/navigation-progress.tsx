"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

/**
 * A thin bar at the top while a navigation is in flight.
 *
 * App Router has no global "navigation started" event, so a same-origin link click is the
 * signal. The bar is driven by a DOM class rather than React state: it must appear
 * immediately and disappear when the pathname settles, without rendering the tree twice.
 * A short delay avoids a flash on instant, prefetched transitions.
 */
export function NavigationProgress() {
  const pathname = usePathname();
  const bar = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const stop = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      bar.current?.classList.remove("nav-progress-active");
    };

    const start = () => {
      if (timer.current) return;
      timer.current = setTimeout(() => {
        bar.current?.classList.add("nav-progress-active");
      }, 120);
    };

    const onClick = (event: MouseEvent) => {
      if (event.defaultPrevented || event.button !== 0) return;
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const anchor = (event.target as Element | null)?.closest("a");
      if (!anchor || (anchor.target && anchor.target !== "_self")) return;
      if (anchor.hasAttribute("download")) return;
      const url = new URL(anchor.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search)
        return;
      start();
    };

    document.addEventListener("click", onClick, true);
    window.addEventListener("popstate", start);
    return () => {
      document.removeEventListener("click", onClick, true);
      window.removeEventListener("popstate", start);
      stop();
    };
  }, []);

  useEffect(() => {
    bar.current?.classList.remove("nav-progress-active");
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, [pathname]);

  return (
    <div
      ref={bar}
      aria-hidden="true"
      className="nav-progress-bar bg-primary fixed inset-x-0 top-0 z-[60] h-0.5 origin-left"
    />
  );
}
