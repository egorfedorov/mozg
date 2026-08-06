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
        <button type="button" aria-pressed={!machine} onClick={() => setMachine(false)}>
          <span className="machine-dot" aria-hidden />
          Human
        </button>
        <button type="button" aria-pressed={machine} onClick={() => setMachine(true)}>
          <span className="machine-dot" aria-hidden />
          Machine
        </button>
      </div>
    </>
  );
}
