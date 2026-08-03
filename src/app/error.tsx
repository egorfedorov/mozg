"use client";

import { useEffect } from "react";
import Link from "next/link";

/**
 * Errors state what happened and what to do. No apology, no "Oops" — the same
 * rule the design brain in the demo states, applied to ourselves.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      className="shell"
      style={{ paddingBlock: "clamp(3rem, 10vw, 7rem)", maxWidth: 620 }}
    >
      <p className="eyebrow">Something broke</p>
      <h1
        className="h1" style={{ margin: ".5rem 0 1rem" }}
      >
        This page did not load.
      </h1>
      <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
        Trying again usually works. If it keeps happening, the database or the
        embedding service may be down — check that both are running.
      </p>

      {error.digest && (
        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
          reference {error.digest}
        </p>
      )}

      <div style={{ display: "flex", gap: ".75rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
        <button className="btn" onClick={reset}>
          Try again
        </button>
        <Link className="btn btn-ghost" href="/brains">
          Your brains
        </Link>
      </div>
    </main>
  );
}
