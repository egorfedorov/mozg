"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ALL_ON,
  CONSENT_OPEN_EVENT,
  ESSENTIAL_ONLY,
  readConsent,
  writeConsent,
  type Consent,
} from "@/lib/consent";
import { useConsent } from "@/components/useConsent";
import { useT } from "@/lib/t-client";
import { markup } from "@/lib/markup";

/**
 * The cookie bar, and the panel behind "Customize".
 *
 * Three rules it exists to keep:
 *
 *  1. Rejecting is exactly as easy as accepting. "Accept all" next to a link
 *     called "manage preferences" is the dark pattern regulators name by
 *     name — so "Reject optional" is a button of the same size, one press.
 *  2. Nothing optional loads before the answer. Analytics reads the same
 *     cookie this writes and stays unloaded until it says yes, so a visitor
 *     who never answers is never measured.
 *  3. The decision is reversible from any page. The footer's "Cookie
 *     Settings" fires the event this listens for and the panel reopens with
 *     the current choice in it.
 *
 * Rendered for everyone, including signed-out visitors, so it lives in the
 * root layout rather than in one of the two shells.
 */
export default function CookieConsent() {
  // `undefined` until the cookie has been read — first paint must not flash a
  // bar at someone who decided months ago.
  const decided = useConsent();
  const t = useT();
  const [panel, setPanel] = useState(false);
  const [draft, setDraft] = useState<Consent | null>(null);

  useEffect(() => {
    const open = () => {
      setDraft(readConsent() ?? ESSENTIAL_ONLY);
      setPanel(true);
    };
    window.addEventListener(CONSENT_OPEN_EVENT, open);
    return () => window.removeEventListener(CONSENT_OPEN_EVENT, open);
  }, []);

  const save = (c: Consent) => {
    writeConsent(c);
    setPanel(false);
  };

  // Undecided is the only state that shows the bar on its own; after that it
  // takes the footer link to bring the panel back.
  if (decided === undefined) return null;
  if (decided && !panel) return null;

  // What the toggles show: an untouched panel starts from the saved choice, or
  // from all-off for someone who has never answered.
  const current = draft ?? decided ?? ESSENTIAL_ONLY;

  return (
    <div
      role="dialog"
      aria-modal={panel || undefined}
      aria-label={t("Cookie preferences")}
      className="cookie-bar"
    >
      <div className="cookie-card">
        <p className="eyebrow" style={{ margin: 0 }}>
          {t("🍪 Cookie preferences")}
        </p>
        <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0", maxWidth: "58ch" }}>
          {markup(
            t(
              "Essential cookies keep you signed in and remember this choice. Everything else is optional and off until you say otherwise. <0>What each one does</0>.",
            ),
            [<Link href="/cookies" style={{ textDecoration: "underline" }} key="s0" />],
          )}
        </p>

        {panel && (
          <div className="cookie-rows">
            <Toggle
              label={t("Essential")}
              note={t(
                "Sign-in session, this consent record. Without them the site cannot work.",
              )}
              on
              locked
            />
            <Toggle
              label={t("Analytics")}
              note={t("Which pages get read, where people give up. PostHog, aggregate.")}
              on={current.analytics}
              onChange={(v) => setDraft({ ...current, analytics: v })}
            />
            <Toggle
              label={t("Functional")}
              note={t("Remembered choices — dismissed banners, small preferences.")}
              on={current.functional}
              onChange={(v) => setDraft({ ...current, functional: v })}
            />
          </div>
        )}

        <div className="cookie-actions">
          {panel ? (
            <>
              <button type="button" className="btn" onClick={() => save(current)}>
                {t("Save preferences")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => save(ALL_ON)}>
                {t("Accept all")}
              </button>
              {decided && (
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setPanel(false)}
                >
                  {t("Cancel")}
                </button>
              )}
            </>
          ) : (
            <>
              <button type="button" className="btn" onClick={() => save(ALL_ON)}>
                {t("Accept all")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => save(ESSENTIAL_ONLY)}>
                {t("Reject optional")}
              </button>
              <button type="button" className="btn btn-ghost" onClick={() => setPanel(true)}>
                {t("Customize")}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function Toggle({
  label,
  note,
  on,
  locked,
  onChange,
}: {
  label: string;
  note: string;
  on: boolean;
  locked?: boolean;
  onChange?: (v: boolean) => void;
}) {
  // Its own translator rather than three more props: the label and the note
  // come from the caller because they name the specific cookie, but "on" and
  // "off" belong to the switch and nowhere else.
  const t = useT();
  return (
    <label className="cookie-row" data-locked={locked || undefined}>
      <span style={{ minWidth: 0 }}>
        <strong>{label}</strong>
        <span className="row-sub">{note}</span>
      </span>
      <span className="cookie-switch">
        <span className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)" }}>
          {locked ? t("always on") : on ? t("on") : t("off")}
        </span>
        <input
          type="checkbox"
          checked={on}
          disabled={locked}
          onChange={(e) => onChange?.(e.target.checked)}
        />
      </span>
    </label>
  );
}
