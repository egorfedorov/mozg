"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useT } from "@/lib/t-client";

interface Asset {
  id: string;
  role: string;
  label: string;
  prompt: string;
  status: string;
  error: string | null;
  storage_key: string | null;
}

/**
 * The set, as it arrives.
 *
 * Thirteen assets are thirteen slow model calls, so the page has to show work
 * landing rather than a spinner over an empty grid. It refreshes only while
 * something is still running: a tab left open after the pack finished must not
 * sit polling a queue that emptied hours ago.
 */
export default function PackGrid({ assets }: { assets: Asset[] }) {
  const t = useT();
  const router = useRouter();
  const working = assets.some((a) => a.status === "queued" || a.status === "running");

  useEffect(() => {
    if (!working) return;
    const timer = setInterval(() => router.refresh(), 4000);
    return () => clearInterval(timer);
  }, [working, router]);

  return (
    <ul
      style={{
        listStyle: "none",
        padding: 0,
        display: "grid",
        gap: "1rem",
        gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
      }}
    >
      {assets.map((a) => (
        <li key={a.id} className="card" style={{ padding: ".75rem", display: "grid", gap: ".5rem" }}>
          <div
            style={{
              aspectRatio: "1 / 1",
              display: "grid",
              placeItems: "center",
              // The checkerboard is not decoration: it is the only way to see
              // at a glance whether a symbol actually came back transparent.
              backgroundImage:
                "linear-gradient(45deg, var(--paper-2) 25%, transparent 25%, transparent 75%, var(--paper-2) 75%), linear-gradient(45deg, var(--paper-2) 25%, transparent 25%, transparent 75%, var(--paper-2) 75%)",
              backgroundSize: "16px 16px",
              backgroundPosition: "0 0, 8px 8px",
            }}
          >
            {a.status === "done" && a.storage_key ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`/api/generations/${a.id}/image`}
                alt={a.label}
                style={{ maxWidth: "100%", maxHeight: "100%", display: "block" }}
              />
            ) : a.status === "failed" ? (
              <span className="muted" style={{ fontSize: ".8em", padding: ".5rem", textAlign: "center" }}>
                {t("failed — refunded")}
              </span>
            ) : (
              <span className="muted" style={{ fontSize: ".8em" }}>
                {a.status === "running" ? t("drawing…") : t("queued")}
              </span>
            )}
          </div>

          <div style={{ display: "flex", justifyContent: "space-between", gap: ".5rem", alignItems: "baseline" }}>
            <strong style={{ fontSize: ".9em" }}>{a.label}</strong>
            {a.status === "done" ? (
              <a href={`/api/generations/${a.id}/image`} download={`${a.label}.png`} style={{ fontSize: ".8em" }}>
                {t("save")}
              </a>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
