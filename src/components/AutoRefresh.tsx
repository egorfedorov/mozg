"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * Re-fetch the server component while background work is in flight.
 *
 * Without this a user uploads a folder and watches "queued" forever, with no
 * way to tell a slow worker from a dead one. Polling stops the moment nothing
 * is pending, so an idle page costs nothing.
 */
export default function AutoRefresh({
  active,
  intervalMs = 3000,
  label,
}: {
  active: boolean;
  intervalMs?: number;
  /** Shown while polling, so the page does not look frozen. */
  label?: string;
}) {
  const router = useRouter();

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => router.refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [active, intervalMs, router]);

  if (!active || !label) return null;

  return (
    <span
      className="mono"
      style={{
        fontSize: ".75rem",
        color: "var(--ink-2)",
        display: "inline-flex",
        alignItems: "center",
        gap: ".4rem",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          borderRadius: "50%",
          background: "var(--color-riso-orange)",
          animation: "pulse 1.4s ease-in-out infinite",
        }}
      />
      {label}
    </span>
  );
}
