"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";

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
  const t = useT();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main
      className="shell"
      style={{ paddingBlock: "clamp(3rem, 10vw, 7rem)", maxWidth: 620 }}
    >
      <p className="eyebrow">{t("Something broke")}</p>
      <h1
        className="h1" style={{ margin: ".5rem 0 1rem" }}
      >
        {t("This page did not load.")}
      </h1>
      <p style={{ color: "var(--ink-2)", marginTop: 0 }}>
        {t(
          "Trying again usually works. If it keeps happening, the database or the embedding service may be down — check that both are running.",
        )}
      </p>

      {error.digest && (
        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
          {markup(t("reference <0/>"), [error.digest])}
        </p>
      )}

      <div style={{ display: "flex", gap: ".75rem", marginTop: "1.75rem", flexWrap: "wrap" }}>
        <button className="btn" onClick={reset}>
          {t("Try again")}
        </button>
        <Link className="btn btn-ghost" href="/brains">
          {t("Your brains")}
        </Link>
      </div>
    </main>
  );
}
