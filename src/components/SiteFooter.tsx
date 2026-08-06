import Link from "next/link";
import StatusDot from "@/components/StatusDot";
import CookieSettingsLink from "@/components/CookieSettingsLink";

/**
 * Every page ends here. Grouped by what someone is trying to do, not by our
 * routing: read about it, learn to build one, or get at their own account.
 *
 * The legal column is deliberately a column and not fine print: "where do I
 * turn analytics off" is a question with an answer, and burying the answer is
 * the same as not having one.
 */

const COLUMNS: { title: string; links: { href: string; label: string }[] }[] = [
  {
    title: "Product",
    links: [
      { href: "/why", label: "Why mozg" },
      { href: "/vs", label: "A brain and a Skill file" },
      { href: "/explore", label: "Catalogue" },
      { href: "/explore?price=free", label: "Free brains (all official)" },
      { href: "/explore?price=paid", label: "Marketplace" },
      { href: "/roadmap", label: "Roadmap — dated and gated" },
    ],
  },
  {
    title: "Guides",
    links: [
      { href: "/make", label: "Make one, in six panels" },
      { href: "/guide", label: "The long version" },
      { href: "/connect", label: "Connect an agent" },
      { href: "/connect#models", label: "Models that work" },
      { href: "/guide#selling", label: "Sell a brain" },
    ],
  },
  {
    title: "Account",
    links: [
      { href: "/brains", label: "Your brains" },
      { href: "/settings", label: "Account" },
      { href: "/settings/balance", label: "Balance" },
      { href: "/settings/tokens", label: "Tokens" },
    ],
  },
  {
    title: "Legal",
    links: [
      { href: "/terms", label: "Terms of Service" },
      { href: "/privacy", label: "Privacy Policy" },
      { href: "/cookies", label: "Cookie Policy" },
      { href: "/status", label: "Status" },
    ],
  },
];

export default function SiteFooter() {
  return (
    <footer style={{ borderTop: "1.5px solid var(--ink)", marginTop: "clamp(4rem, 9vw, 6rem)" }}>
      <div
        className="shell"
        style={{
          paddingBlock: "clamp(2rem, 5vw, 3rem)",
          display: "grid",
          gap: "2rem",
          gridTemplateColumns: "repeat(auto-fit, minmax(170px, 1fr))",
        }}
      >
        <div>
          <Link href="/" className="wordmark" style={{ fontSize: "1.25rem" }}>
            mozg<span>.</span>
          </Link>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: ".9375rem",
              margin: ".5rem 0 0",
              maxWidth: "26ch",
            }}
          >
            Teach it once. Every agent knows.
          </p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={col.title}>
            <p className="eyebrow" style={{ margin: "0 0 .6rem" }}>
              {col.title}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: ".4rem" }}>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    style={{ color: "var(--ink-2)", fontSize: ".9375rem" }}
                  >
                    {l.label}
                  </Link>
                </li>
              ))}
              {/* Withdrawing consent has to be reachable from the same place
                  it was given, and that place is every page's footer. */}
              {col.title === "Legal" && (
                <li>
                  <CookieSettingsLink />
                </li>
              )}
            </ul>
          </nav>
        ))}
      </div>

      <div
        className="shell mono"
        style={{
          paddingBottom: "2rem",
          fontSize: ".75rem",
          color: "var(--ink-3)",
          display: "flex",
          gap: "1.25rem",
          flexWrap: "wrap",
          alignItems: "center",
        }}
      >
        <span>mozg.sh</span>
        <StatusDot />
        <span>Brains are licensed CC BY-NC-SA by default — copying is fine, reselling is not.</span>
        <span style={{ flex: 1 }} />
        <a href="https://github.com/egorfedorov/mozg">github</a>
        <a href="/beta">beta</a>
        <a href="/changelog">changelog</a>
        <a href="/chat">chatmozg</a>
      </div>
    </footer>
  );
}
