import Link from "next/link";

/**
 * The contents strip.
 *
 * Six public pages do not fit in one bar, and hiding half of them on a phone
 * left a visitor with "explore" and a sign-in button — no way to reach the
 * pages that explain what the thing is. So the bar keeps the actions and this
 * keeps the reading, the way a zine puts its contents under the masthead
 * rather than squeezing them into it.
 *
 * It scrolls sideways on a narrow screen instead of wrapping or vanishing:
 * every item stays reachable at every width.
 */

const PAGES: { href: string; label: string; note: string }[] = [
  { href: "/why", label: "Why", note: "the problem this solves" },
  { href: "/vs", label: "Brain or file", note: "and when a file wins" },
  { href: "/vs-skills", label: "Skills vs brain", note: "the confident wrong answer" },
  { href: "/make", label: "Make one", note: "six panels" },
  { href: "/guide", label: "The long guide", note: "every detail" },
  { href: "/connect", label: "Connect", note: "your client, one command" },
  { href: "/explore", label: "Catalogue", note: "brains to take" },
  { href: "/pricing", label: "Pricing", note: "what costs money, what never will" },
  { href: "/beta", label: "Beta", note: "help us sand the edges" },
  { href: "/changelog", label: "Changelog", note: "shipped, dated, felt" },
];

export default function Contents({ active }: { active?: string }) {
  return (
    <nav className="contents" aria-label="Pages">
      <div className="shell contents-inner">
        {PAGES.map((p) => (
          <Link
            key={p.href}
            href={p.href}
            className="contents-item"
            data-active={p.href === active}
          >
            <span className="contents-label">{p.label}</span>
            <span className="contents-note">{p.note}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
