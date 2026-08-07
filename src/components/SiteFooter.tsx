import { markup } from "@/lib/markup";
import { translator, msg } from "@/lib/t";
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
    title: msg("Product"),
    links: [
      { href: "/about", label: msg("The manifesto") },
      { href: "/why", label: msg("Why mozg") },
      { href: "/vs", label: msg("A brain and a Skill file") },
      { href: "/explore", label: msg("Catalogue") },
      { href: "https://gallery.mozg.sh", label: msg("Style gallery") },
      { href: "/explore?price=free", label: msg("Free brains (all official)") },
      { href: "/explore?price=paid", label: msg("Marketplace") },
      { href: "/roadmap", label: msg("Roadmap — dated and gated") },
    ],
  },
  {
    title: msg("Guides"),
    links: [
      { href: "/make", label: msg("Make one, in six panels") },
      { href: "/guide", label: msg("The long version") },
      { href: "/connect", label: msg("Connect an agent") },
      { href: "/connect#models", label: msg("Models that work") },
      { href: "/guide#selling", label: msg("Sell a brain") },
    ],
  },
  {
    title: msg("Account"),
    links: [
      { href: "/brains", label: msg("Your brains") },
      { href: "/settings", label: msg("Account") },
      { href: "/settings/balance", label: msg("Balance") },
      { href: "/settings/tokens", label: msg("Tokens") },
    ],
  },
  {
    title: msg("Legal"),
    links: [
      { href: "/terms", label: msg("Terms of Service") },
      { href: "/privacy", label: msg("Privacy Policy") },
      { href: "/cookies", label: msg("Cookie Policy") },
      { href: "/status", label: msg("Status") },
    ],
  },
];

export default async function SiteFooter() {
  const t = await translator();

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
            {markup(t("mozg<0>.</0>"), [
            <span key="s0" />,
          ])}</Link>
          <p
            style={{
              color: "var(--ink-2)",
              fontSize: ".9375rem",
              margin: ".5rem 0 0",
              maxWidth: "26ch",
            }}
          >
            {t("Teach it once. Every agent knows.")}</p>
        </div>

        {COLUMNS.map((col) => (
          <nav key={col.title} aria-label={t(col.title)}>
            <p className="eyebrow" style={{ margin: "0 0 .6rem" }}>
              {t(col.title)}
            </p>
            <ul style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: ".4rem" }}>
              {col.links.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    style={{ color: "var(--ink-2)", fontSize: ".9375rem" }}
                  >
                    {t(l.label)}
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
        <span>{t("mozg.sh")}</span>
        <StatusDot />
        <span>{t("Brains are licensed CC BY-NC-SA by default — copying is fine, reselling is not.")}</span>
        <span style={{ flex: 1 }} />
        <a href="/about">{t("manifesto")}</a>
        <a href="https://github.com/egorfedorov/mozg">{t("github")}</a>
        <a href="/beta">{t("beta")}</a>
        <a href="/changelog">{t("changelog")}</a>
        <a href="/chat">{t("chatmozg")}</a>
      </div>
    </footer>
  );
}
