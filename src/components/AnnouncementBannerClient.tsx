"use client";

import { useState } from "react";
import type { Announcement } from "@/lib/announcements";
import { useTucked } from "./useTucked";
import { useT } from "@/lib/t-client";
import { msg } from "@/lib/msg";
import { markup } from "@/lib/markup";

/**
 * Maintenance is loud, news is not. A degraded queue has to interrupt — it
 * explains why someone's brain looks stuck — while a shipped feature earns one
 * quiet line. Same bar, two voices; nothing here blinks or animates, because a
 * status bar that moves reads as an ad.
 */
const TONE: Record<Announcement["kind"], { bg: string; fg: string; label: string }> = {
  maintenance: { bg: "var(--color-riso-red)", fg: "var(--paper)", label: msg("maintenance") },
  news: { bg: "var(--color-riso-green)", fg: "var(--ink)", label: msg("new") },
  notice: { bg: "var(--ink-2)", fg: "var(--paper)", label: msg("notice") },
};

export default function AnnouncementBannerClient({
  announcement,
}: {
  announcement: Announcement;
}) {
  const [shown, setShown] = useState(true);
  const tucked = useTucked();
  const t = useT();
  if (!shown) return null;

  const tone = TONE[announcement.kind];
  const firstLine = announcement.body.trim().split("\n")[0];

  return (
    <div
      id="mozg-notice"
      style={{
        background: tone.bg,
        color: tone.fg,
        borderBottom: "1.5px solid var(--ink)",
        // Same rule as the star bar: whole or gone, never a clipped sliver.
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
        <span
          className="mono"
          style={{ textTransform: "uppercase", letterSpacing: ".08em", opacity: 0.8 }}
        >
          {t(tone.label)}
        </span>
        <span style={{ opacity: 0.55 }}>·</span>
        <strong style={{ fontWeight: 600 }}>{announcement.title}</strong>
        {/* One line, clamped. A news body written as a paragraph made this bar
            three lines tall and pushed the page's own headline off the screen —
            the detail belongs on /changelog, which the link at the end goes to. */}
        {firstLine && (
          <span
            style={{
              opacity: 0.9,
              minWidth: 0,
              flex: "1 1 12rem",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {firstLine}
          </span>
        )}
        {announcement.ends_at && announcement.kind === "maintenance" && (
          <span className="mono" style={{ opacity: 0.75 }}>
            {markup(t("until <0/> UTC"), [
              new Date(announcement.ends_at).toISOString().slice(11, 16),
            ])}
          </span>
        )}
        <a
          href="/changelog"
          className="mono"
          style={{ marginLeft: "auto", color: tone.fg, textDecoration: "underline" }}
        >
          {t("all news →")}
        </a>
        <button
          onClick={() => {
            try {
              localStorage.setItem(`mozg-notice-${announcement.id}`, "1");
            } catch {
              // Private mode: dismiss for this page load only.
            }
            setShown(false);
          }}
          aria-label={t("Dismiss")}
          style={{
            background: "none",
            border: 0,
            color: tone.fg,
            opacity: 0.7,
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
