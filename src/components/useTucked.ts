"use client";

import { useEffect, useState } from "react";

/**
 * True once the page has scrolled off the very top. The banners use it to
 * vanish instead of lingering as a clipped sliver above the sticky topbar —
 * visibility, not display, so nothing below shifts mid-scroll.
 */
export function useTucked(threshold = 8): boolean {
  const [tucked, setTucked] = useState(false);
  useEffect(() => {
    const on = () => setTucked(window.scrollY > threshold);
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, [threshold]);
  return tucked;
}
