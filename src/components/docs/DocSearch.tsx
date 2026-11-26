"use client";

import { useEffect, useRef, useState } from "react";

export interface SearchPage {
  slug: string;
  title: string;
  group: string;
  headings: { id: string; text: string }[];
}

/**
 * Search over the pages of the documentation, in the page's own language.
 *
 * The index is the titles and the headings, handed in ready-made by the
 * server: nothing is fetched, and nothing is indexed that the reader cannot
 * also see. Accents do not count, so that "explication" finds "explication"
 * typed without them.
 */
export default function DocSearch({
  index,
  base,
  labels,
}: {
  index: SearchPage[];
  /** Where the pages of this language live: `/docs/`, or `/de/docs/`. */
  base: string;
  labels: { search: string; title: string; empty: string; inGroup: string };
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [query, setQuery] = useState("");

  const open = () => {
    setQuery("");
    dialog.current?.showModal();
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setQuery("");
        dialog.current?.showModal();
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, []);

  const fold = (text: string) => text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
  const needle = fold(query.trim());
  const results = !needle
    ? []
    : index
        .flatMap((page) => [
          { page, heading: null as null | { id: string; text: string }, rank: fold(page.title).includes(needle) ? 0 : Number.MAX_SAFE_INTEGER },
          ...page.headings.map((heading) => ({ page, heading, rank: fold(heading.text).includes(needle) ? 1 + (fold(page.title).includes(needle) ? 0 : 2) : Number.MAX_SAFE_INTEGER })),
        ])
        .filter((r) => r.rank < Number.MAX_SAFE_INTEGER)
        .sort((a, b) => a.rank - b.rank)
        .slice(0, 14);

  return (
    <>
      <button type="button" className="docs-search" onClick={open} aria-label={labels.title}>
        <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true">
          <circle cx="6.5" cy="6.5" r="4.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
          <path d="M10 10l4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
        <span>{labels.search}</span>
        <kbd>Ctrl K</kbd>
      </button>
      <dialog
        ref={dialog}
        className="docs-dialog"
        aria-label={labels.title}
        onClick={(event) => {
          // A click on the backdrop is a click on the dialog itself.
          if (event.target === event.currentTarget) dialog.current?.close();
        }}
      >
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={labels.search} aria-label={labels.search} />
        {results.length > 0 && (
          <ul>
            {results.map((r) => (
              <li key={`${r.page.slug}#${r.heading?.id ?? ""}`}>
                {/* The first page has no slug of its own: it is the folder itself. */}
                <a href={r.page.slug ? `${base}${r.page.slug}/` : base} onClick={() => dialog.current?.close()}>
                  <span className="docs-hit-page">
                    {r.heading ? r.page.title : r.page.group}
                  </span>
                  {r.heading ? r.heading.text : r.page.title}
                </a>
              </li>
            ))}
          </ul>
        )}
        {needle && results.length === 0 && <p className="docs-dialog-empty">{labels.empty}</p>}
      </dialog>
    </>
  );
}
