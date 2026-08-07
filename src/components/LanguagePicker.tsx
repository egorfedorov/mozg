"use client";

import { useEffect, useRef, useState } from "react";
import { LOCALES, writeLocale } from "@/lib/locales";

/**
 * The language menu.
 *
 * A details/summary would have been fewer lines, but this has to close on
 * Escape and on a click anywhere else, and it has to reload the page after
 * choosing — the translation is rendered on the server, so the choice is a
 * cookie plus a refresh rather than client state.
 *
 * Every language is written in its own script. A picker that says "Japanese"
 * in English is a picker for people who can already read the site.
 */
export default function LanguagePicker({ current }: { current: string }) {
  const [open, setOpen] = useState(false);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!box.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  function choose(code: string) {
    writeLocale(code);
    // The text is rendered on the server, so the choice needs a round trip —
    // there is no client state to flip.
    window.location.reload();
  }

  return (
    <div ref={box} className="lang">
      <button
        type="button"
        className="lang-button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Change language"
        title="Change language"
        onClick={() => setOpen((v) => !v)}
      >
        <LanguageIcon />
      </button>

      {open && (
        <div className="lang-menu" role="menu">
          {LOCALES.map((l) => (
            <button
              key={l.code}
              type="button"
              role="menuitem"
              lang={l.code}
              dir={l.rtl ? "rtl" : undefined}
              data-on={l.code === current}
              onClick={() => choose(l.code)}
            >
              {l.native}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * The glyph everyone else uses for this: a letterform beside a character from
 * another script. Drawn rather than imported, on the same 1.5px ink stroke as
 * every border on the site.
 */
function LanguageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <path d="M3 5.5h9M7.5 5.5V3.5M10 5.5c0 3.6-2.6 6.4-6 7.6M5 9c1.1 2 2.9 3.4 5.2 4.2" />
      <path d="M13 20.5l3.9-9.5h.7l3.9 9.5M14.6 17.4h5.1" />
    </svg>
  );
}
