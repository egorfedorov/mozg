"use client";

import { useState } from "react";
import { useTucked } from "./useTucked";
import { useT } from "@/lib/t-client";

/**
 * Dismissable, and it stays dismissed — a banner that returns on every page
 * is an ad, not an ask.
 *
 * Rendered on the server and hidden before paint by the inline script in
 * StarBanner: deciding in an effect instead would either flash the bar at
 * people who dismissed it, or shift the whole page down once hydration
 * lands. The markup ships either way; the script only flags <html>, so what
 * hydration finds is always what the server sent.
 */
export default function StarBannerClient({ stars, repo }: { stars: number | null; repo: string }) {
  const [shown, setShown] = useState(true);
  const tucked = useTucked();
  const t = useT();
  if (!shown) return null;

  return (
    <div
      id="star-banner"
      style={{
        background: "var(--ink)",
        color: "var(--paper)",
        borderBottom: "1.5px solid var(--ink)",
        // Scrolled pages hide it whole — a half-clipped bar above the sticky
        // topbar read as something broken covering the page.
        visibility: tucked ? "hidden" : "visible",
      }}
    >
      <div
        className="shell"
        style={{
          display: "flex",
          alignItems: "center",
          gap: ".75rem",
          paddingBlock: ".5rem",
          fontSize: ".8125rem",
          flexWrap: "wrap",
        }}
      >
        <span className="mono" style={{ opacity: 0.75 }}>
          {t("mozg is open source")}
        </span>
        <span style={{ opacity: 0.55 }}>·</span>
        <span>{t("Brains get smarter with every person who uses them.")}</span>
        <a
          href={`https://github.com/${repo}`}
          target="_blank"
          rel="noreferrer"
          className="mono"
          style={{
            marginLeft: "auto",
            display: "inline-flex",
            alignItems: "center",
            gap: ".4rem",
            border: "1.5px solid var(--paper)",
            color: "var(--paper)",
            padding: ".25rem .6rem",
            textDecoration: "none",
          }}
        >
          <svg width="13" height="13" viewBox="0 0 16 16" fill="currentColor" aria-hidden>
            <path d="M8 .25l2.32 4.7 5.18.75-3.75 3.66.89 5.16L8 12.08l-4.64 2.44.89-5.16L.5 5.7l5.18-.75L8 .25z" />
          </svg>
          {t("Star")}
          {stars !== null ? ` ${stars.toLocaleString()}` : ""}
        </a>
        <button
          onClick={() => {
            try {
              localStorage.setItem("star-banner-dismissed", "1");
            } catch {
              // Private mode: dismiss for this page load only.
            }
            setShown(false);
          }}
          aria-label={t("Dismiss")}
          style={{
            background: "none",
            border: 0,
            color: "var(--paper)",
            opacity: 0.6,
            cursor: "pointer",
            font: "inherit",
            padding: ".25rem",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
