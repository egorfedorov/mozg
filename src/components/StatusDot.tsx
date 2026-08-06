"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const WORD = {
  ok: "All systems operational",
  degraded: "Partially degraded",
  down: "Major outage",
} as const;

/**
 * The live health light in the footer.
 *
 * A client fetch rather than a server read on purpose: the footer renders on
 * every page including the cached marketing ones, and making all of them
 * dynamic to draw one dot would be a strange trade. It asks once on mount and
 * stays quiet after that — a footer is not a dashboard.
 *
 * Until the answer arrives it shows nothing at all. A grey "checking…" that
 * flashes on every page load is worse than a dot that simply appears, and a
 * green default while the request is in flight would be a lie with good odds.
 */
export default function StatusDot() {
  const [state, setState] = useState<keyof typeof WORD | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/health", { cache: "no-store" })
      // A 503 still answers with the JSON body, and that body is the whole
      // point — `fetch` only rejects when the network does.
      .then((r) => r.json())
      .then((j) => {
        if (!alive) return;
        setState(j.status === "ok" ? "ok" : isDown(j) ? "down" : "degraded");
      })
      .catch(() => alive && setState("down"));
    return () => {
      alive = false;
    };
  }, []);

  if (!state) return null;

  return (
    <Link
      href="/status"
      className="mono"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: ".45rem",
        fontSize: ".6875rem",
        letterSpacing: ".08em",
        textTransform: "uppercase",
        color: "var(--ink-2)",
        textDecoration: "none",
      }}
    >
      <span className="dot" data-state={state === "ok" ? undefined : state === "down" ? "down" : "idle"} />
      {WORD[state]}
    </Link>
  );
}

/** Down is "a dependency stopped answering" — the same line /api/health draws. */
function isDown(body: { checks?: Record<string, string> }): boolean {
  const checks = body.checks ?? {};
  return checks.database === "down" || checks.queue === "down";
}
