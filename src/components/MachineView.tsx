"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { PAGES, CURRENT_PAGE_MARKER, hasMachineView } from "@/lib/pages";

/**
 * Human / Machine.
 *
 * The same page in the two registers its two audiences read in: the designed
 * one, and a flat fact sheet an agent can lift whole. The sheet ships in the
 * markup of every public page whether or not anyone flips the switch — that is
 * the half a crawler sees — and the switch is for the person who wants to look
 * at what their agent is looking at.
 *
 * The sheet covers the page rather than replacing it, so switching back lands
 * on the same paragraph. Nothing is remembered between pages: there are no
 * links inside the sheet, so the only way to navigate is to switch back first,
 * and a preference that cannot outlive the page it is set on is not worth
 * storing.
 */
export default function MachineView({ doc }: { doc: string }) {
  const path = usePathname();
  const [machine, setMachine] = useState(false);

  useEffect(() => {
    if (!machine) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMachine(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [machine]);

  if (!hasMachineView(path)) return null;

  // What this page is, in our words rather than scraped from the title — the
  // catalogue in lib/pages.ts already says it, and a brain page says it best
  // by its own address.
  const what = PAGES.find((p) => p.path === path)?.what;
  const current = [
    "# current-page",
    `path  ${path}`,
    ...(what ? [`what  ${what}`] : []),
  ].join("\n");

  return (
    <>
      <div className="machine-sheet" hidden={!machine}>
        <pre>{doc.replace(CURRENT_PAGE_MARKER, current)}</pre>
      </div>

      <div className="machine-switch" role="group" aria-label="How to read this page">
        <button
          type="button"
          aria-pressed={!machine}
          aria-label="Human — the designed page"
          title="Human — the designed page"
          onClick={() => setMachine(false)}
        >
          <HumanIcon />
          <span className="machine-label">Human</span>
        </button>
        <button
          type="button"
          aria-pressed={machine}
          aria-label="Machine — the fact sheet an agent reads"
          title="Machine — the fact sheet an agent reads"
          onClick={() => setMachine(true)}
        >
          <MachineIcon />
          <span className="machine-label">Machine</span>
        </button>
      </div>
    </>
  );
}

/* The two icons carry the whole switch on a phone, where the labels are gone,
   so they have to differ in silhouette and not only in detail: a round head
   against a square screen. Drawn on the same 1.5px ink stroke as every border
   on the site rather than imported, which keeps them in the print style and
   costs no bytes. */

function HumanIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <circle cx="12" cy="8" r="4" />
      <path d="M4.5 21c0-4.1 3.4-6.5 7.5-6.5s7.5 2.4 7.5 6.5" />
    </svg>
  );
}

function MachineIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden focusable="false">
      <rect x="2.5" y="4.5" width="19" height="15" />
      <path d="M6.5 10l2.5 2-2.5 2M12 14h5" />
    </svg>
  );
}
