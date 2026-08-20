"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Refresh while assets are still landing, and only then.
 *
 * Thirteen assets are thirteen slow model calls; a page that showed a spinner
 * until all of them finished would hide the twelve that already arrived. And a
 * tab left open after the run finished must not sit polling a queue that
 * emptied hours ago — hence the flag rather than a permanent interval.
 */
export default function WhileDrawing({ active }: { active: boolean }) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [active, router]);

  return null;
}
