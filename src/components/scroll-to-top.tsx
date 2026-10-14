"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

// Next.js does not scroll to the top when a page streams in behind Suspense,
// or when a link points to the page that is already open. This makes every
// in-site link without a #hash open the page at the top. Back and forward
// keep the scroll position that the browser restores.
export function ScrollToTop() {
  const pathname = usePathname();
  const pending = useRef(false);

  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = (event.target as Element | null)?.closest?.("a");
      if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) return;
      const url = new URL(link.href, window.location.href);
      if (url.origin !== window.location.origin || url.hash) return;
      if (url.pathname === window.location.pathname && url.search === window.location.search) {
        window.scrollTo({ top: 0, behavior: "smooth" });
      } else {
        pending.current = true;
      }
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, []);

  useEffect(() => {
    if (!pending.current) return;
    pending.current = false;
    window.scrollTo({ top: 0, behavior: "instant" });
  }, [pathname]);

  return null;
}
