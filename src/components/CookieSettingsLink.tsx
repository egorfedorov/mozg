"use client";

import { CONSENT_OPEN_EVENT } from "@/lib/consent";
import { useT } from "@/lib/t-client";

/**
 * "Cookie Settings" in the footer. A button styled as a link because that is
 * what it is — it reopens the preferences panel wherever you are, which is the
 * whole reason consent counts as withdrawable.
 */
export default function CookieSettingsLink() {
  const t = useT();
  return (
    <button
      type="button"
      onClick={() => window.dispatchEvent(new Event(CONSENT_OPEN_EVENT))}
      style={{
        background: "none",
        border: 0,
        padding: 0,
        font: "inherit",
        color: "var(--ink-2)",
        fontSize: ".9375rem",
        cursor: "pointer",
        textAlign: "left",
      }}
    >
      {t("Cookie settings")}
    </button>
  );
}
