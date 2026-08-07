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
 *
 * On a phone the same strip was a trap: the groups wrapped onto two rows, and
 * a dropdown that has to live inside its own flex cell opened as a column half
 * the screen wide, under whichever label happened to share its row. So the
 * phone gets its own shape — one Menu bar, one sheet, every page in it at full
 * width. Same GROUPS, rendered twice; each viewport hides the other.
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
      { href: "/about", label: "The manifesto", note: "what this is for, and who by" },
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
      { href: "/packs", label: "Packs", note: "a trade's brains, sold together" },
      { href: "https://gallery.mozg.sh", label: "Style gallery", note: "buy the way someone works", external: true },
      { href: "/styles", label: "Sell your style", note: "the answer to scraping that pays you" },
      { href: "/audit", label: "Audit a knowledge base", note: "exam-as-a-service, dated" },
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
      { href: "/changes", label: "What the brains learned", note: "knowledge deltas, verified by re-sits" },
      { href: "/roadmap", label: "Roadmap", note: "what is next, with its gate" },
    ],
  },
];

function PageLink({ page, active }: { page: Page; active?: string }) {
  return (
    <Link
      href={page.href}
      className="nav-item"
      data-active={page.href === active}
      {...(page.external ? { target: "_blank", rel: "noreferrer" } : {})}
    >
      <span className="nav-item-label">
        {page.label}
        {page.external ? " ↗" : ""}
      </span>
      <span className="nav-item-note">{page.note}</span>
    </Link>
  );
}

const START = { href: "/start", label: "Start here", note: "~10 min to a thinking agent" };
const CATALOGUE = { href: "/explore", label: "Catalogue", note: "ready brains, free to add" };

function StartIcon() {
  return (
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
  );
}

/**
 * The phone menu. One bar that says where you are, one sheet that holds
 * everything — no second tap to open a group, because a sheet has the height a
 * dropdown never had. Still a <details>: no JavaScript, closes on navigation
 * because the key carries the active page.
 */
function Sheet({ active }: { active?: string }) {
  const here =
    [START, CATALOGUE].find((p) => p.href === active)?.label ??
    GROUPS.find((g) => g.pages.some((p) => p.href === active))?.label;

  return (
    <details className="nav-sheet" key={active ?? ""}>
      <summary className="nav-sheet-bar">
        <span className="nav-sheet-burger" aria-hidden>
          <span />
          <span />
          <span />
        </span>
        <span className="nav-sheet-title">Menu</span>
        {here ? <span className="nav-sheet-where">{here}</span> : null}
      </summary>

      <div className="nav-sheet-body">
        <Link href={START.href} className="nav-sheet-start" data-active={START.href === active}>
          <StartIcon />
          <span>
            <span className="nav-start-label">{START.label}</span>
            <span className="nav-start-note">{START.note}</span>
          </span>
        </Link>

        <PageLink page={CATALOGUE} active={active} />

        {GROUPS.map((g) => (
          <section key={g.label} className="nav-sheet-group">
            <h2 className="nav-sheet-label">
              {g.label}
              <span className="nav-sheet-summary">{g.summary}</span>
            </h2>
            {g.pages.map((p) => (
              <PageLink key={p.href} page={p} active={active} />
            ))}
          </section>
        ))}
      </div>
    </details>
  );
}

export default function Contents({ active }: { active?: string }) {
  return (
    <nav className="contents" aria-label="Pages">
      <Sheet active={active} />
      <div className="shell contents-inner">
        {/* Out of the dropdown and into the bar. Of everything in this nav, one
            link is what a first-time visitor is looking for, and it was two
            clicks and a hover behind a group label. Its own colour, its own
            arrow, first in the row — the rest of the strip stays quiet so this
            one can be loud. */}
        <Link href={START.href} className="nav-start" data-active={START.href === active}>
          <StartIcon />
          <span>
            <span className="nav-start-label">{START.label}</span>
            <span className="nav-start-note">{START.note}</span>
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
                  <PageLink key={p.href} page={p} active={active} />
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
                  href={CATALOGUE.href}
                  className="nav-flat"
                  data-active={CATALOGUE.href === active}
                >
                  <span className="nav-label">{CATALOGUE.label}</span>
                  <span className="nav-summary-note">{CATALOGUE.note}</span>
                </Link>,
              ]
            : [group];
        })}
      </div>
    </nav>
  );
}
