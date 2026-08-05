import Link from "next/link";

/**
 * The contents strip.
 *
 * Eleven public pages in one flat row was a wall: every label the same weight,
 * every one carrying a subtitle, and the last two scrolled off the edge where
 * nobody found them. A reader could not tell "Why" from "Connect" in
 * importance, so they read none of it.
 *
 * Four groups instead, each one a question a visitor actually has. The group
 * labels are all that shows at rest; the pages appear when a group is opened.
 * Built on <details>, which means it works with no JavaScript, on touch, and
 * from the keyboard — the three things a hover-only dropdown gets wrong.
 *
 * The subtitles stay, but inside the panel where there is room to read them
 * rather than in a bar that has to stay one line tall.
 */

interface Page {
  href: string;
  label: string;
  note: string;
  external?: boolean;
}

const GROUPS: { label: string; summary: string; pages: Page[] }[] = [
  {
    label: "Start",
    summary: "get an agent thinking",
    pages: [
      // First, because the person who needs it does not know the words the other
      // pages use — including the word in the group label above it.
      { href: "/basics", label: "Never heard of MCP?", note: "start from zero, no jargon" },
      { href: "/connect", label: "Connect a client", note: "your CLI, one command" },
      { href: "/make", label: "Make a brain", note: "six panels" },
      { href: "/guide", label: "The long guide", note: "every detail, in order" },
    ],
  },
  {
    label: "About",
    summary: "what this is, and why",
    pages: [
      { href: "/why", label: "Why it exists", note: "the problem this solves" },
      { href: "/vs", label: "Brain or file", note: "and when a file wins" },
      { href: "/vs-skills", label: "Skills vs brain", note: "the confident wrong answer" },
      { href: "/collective", label: "The collective mind", note: "every user makes it smarter" },
    ],
  },
  {
    label: "Uses",
    summary: "what people do with it",
    pages: [
      { href: "/stories", label: "How people use it", note: "an artist, a company, a game studio" },
      { href: "/styles", label: "Style brains", note: "sell your style, not fight the scrapers" },
      { href: "/explore", label: "Catalogue", note: "brains to take, free" },
      { href: "https://learn.mozg.sh", label: "Learn as a human", note: "the same brain, as a course", external: true },
    ],
  },
  {
    // Not "Money". Nobody clicks a tab called Money, and the page behind it is
    // mostly an argument that most of this is free — the label should say that.
    label: "The deal",
    summary: "free, paid, and what's new",
    pages: [
      { href: "/pricing", label: "Pricing", note: "your inference is free, ours is the plan" },
      { href: "/changelog", label: "News & changelog", note: "what shipped, dated" },
      { href: "/roadmap", label: "Roadmap", note: "what is next, with its gate" },
    ],
  },
];

export default function Contents({ active }: { active?: string }) {
  return (
    <nav className="contents" aria-label="Pages">
      <div className="shell contents-inner">
        {/* Out of the dropdown and into the bar. Of everything in this nav, one
            link is what a first-time visitor is looking for, and it was two
            clicks and a hover behind a group label. Its own colour, its own
            arrow, first in the row — the rest of the strip stays quiet so this
            one can be loud. */}
        <Link href="/start" className="nav-start" data-active={"/start" === active}>
          <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden className="nav-start-icon">
            <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
            <path
              d="M9 8l6 4-6 4z"
              fill="currentColor"
              stroke="currentColor"
              strokeWidth="1"
              strokeLinejoin="round"
            />
          </svg>
          <span>
            <span className="nav-start-label">Start here</span>
            <span className="nav-start-note">~10 min to a thinking agent</span>
          </span>
        </Link>

        {GROUPS.flatMap((g) => {
          const here = g.pages.some((p) => p.href === active);
          const group = (
            // `name` makes the four a radio set: opening one closes the others,
            // browser-side, with no state to keep. `key` includes the active page
            // so a navigation re-mounts the group and it collapses again.
            <details
              key={`${g.label}-${active ?? ""}`}
              name="mozg-nav"
              className="nav-group"
              data-here={here}
            >
              <summary className="nav-summary">
                <span className="nav-label">{g.label}</span>
                <span className="nav-summary-note">{g.summary}</span>
              </summary>
              <div className="nav-panel">
                {g.pages.map((p) => (
                  <Link
                    key={p.href}
                    href={p.href}
                    className="nav-item"
                    data-active={p.href === active}
                    {...(p.external ? { target: "_blank", rel: "noreferrer" } : {})}
                  >
                    <span className="nav-item-label">
                      {p.label}
                      {p.external ? " ↗" : ""}
                    </span>
                    <span className="nav-item-note">{p.note}</span>
                  </Link>
                ))}
              </div>
            </details>
          );
          // Flat siblings, no wrapper: a wrapping <span> made every group the
          // :last-child of its own box and the dividers between them vanished.
          // The catalogue rides in right after Start — the one destination
          // with something to take home was two clicks deep inside "Uses".
          return g.label === "Start"
            ? [
                group,
                <Link
                  key="catalogue-flat"
                  href="/explore"
                  className="nav-flat"
                  data-active={"/explore" === active}
                >
                  <span className="nav-label">Catalogue</span>
                  <span className="nav-summary-note">ready brains, free to add</span>
                </Link>,
              ]
            : [group];
        })}
      </div>
    </nav>
  );
}
