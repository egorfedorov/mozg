import Link from "next/link";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import CookieSettingsLink from "@/components/CookieSettingsLink";
import { env } from "@/lib/env";

export const metadata = {
  title: "Cookie Policy — mozg",
  description:
    "Every cookie mozg sets, what it does, how long it lasts, and how to change your mind.",
};

const UPDATED = "6 August 2026";

/**
 * A cookie policy with the actual cookie names in it. Anything vaguer is
 * unverifiable — a reader should be able to open devtools and check us.
 */
const COOKIES: { name: string; group: string; life: string; what: string }[] = [
  {
    name: "__Secure-better-auth.session_token",
    group: "Essential",
    life: "session, up to 30 days",
    what: "Keeps you signed in. Without it every page would ask again.",
  },
  {
    name: "mozg_consent",
    group: "Essential",
    life: "180 days",
    what: "Remembers this very choice, so the banner does not follow you around.",
  },
  {
    name: "ph_* (PostHog)",
    group: "Analytics",
    life: "up to 12 months",
    what:
      "Anonymous product analytics — which pages get read, where people give up. Never set unless you accept analytics.",
  },
];

export default async function CookiePolicyPage() {
  const t = await translator();

  const contact = env.OPERATOR_EMAIL;

  return (
    <>
      <TopBar />
      <Contents active="/cookies" />

      <main className="shell legal" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: "44rem" }}>
        <p className="eyebrow">{t("Legal")}</p>
        <h1 className="display" style={{ fontSize: "clamp(1.9rem, 5vw, 3rem)", margin: ".4rem 0 .75rem" }}>
          {t("Cookie Policy")}</h1>
        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)" }}>
          Last updated {UPDATED}
        </p>

        <p className="lede">
          {t("Two cookies are needed to run the site. Everything else is off until you turn it on, and stays off if you never answer.")}</p>

        <p>
          <CookieSettingsLink />{" "}
          <span style={{ color: "var(--ink-3)" }}>— change your choice, from any page.</span>
        </p>

        <h2 className="h2">{t("The three groups")}</h2>
        <ul>
          <li>
            <strong>Essential</strong> — the session that keeps you signed in, and the record
            of your cookie choice. Not optional, because without them there is no working
            site. No consent needed for these, and none asked.
          </li>
          <li>
            <strong>Analytics</strong> — PostHog, aggregate, off by default. It tells us
            which pages are read and where people give up. Declining costs you nothing.
          </li>
          <li>
            <strong>Functional</strong> — remembered conveniences like a dismissed banner.
            Off by default; the site works either way.
          </li>
        </ul>

        <h2 className="h2">{t("Every cookie, by name")}</h2>
        <div className="rows" style={{ marginTop: ".75rem" }}>
          {COOKIES.map((c) => (
            <div key={c.name} className="row">
              <span style={{ minWidth: 0 }}>
                <strong className="mono" style={{ fontSize: ".875rem" }}>{c.name}</strong>
                <span className="row-sub">{c.what}</span>
                <span className="row-meta">
                  {c.group} · {c.life}
                </span>
              </span>
            </div>
          ))}
        </div>

        <h2 className="h2">{t("What we do not do")}</h2>
        <p>
          No advertising cookies, no third-party trackers riding along with an embed, no
          fingerprinting, and no selling anything to a data broker. If that ever changes it
          will be on the <Link href="/changelog">changelog</Link> before it is on your
          machine.
        </p>

        <h2 className="h2">{t("Blocking them yourself")}</h2>
        <p>
          {t("Every browser can block or delete cookies. Blocking the essential ones will sign you out and keep you out — that is not us being difficult, it is what a session cookie does.")}</p>

        <p style={{ color: "var(--ink-3)", fontSize: ".9375rem", marginTop: "2.5rem" }}>
          Questions: <a href={`mailto:${contact}`}>{contact}</a>. See also the{" "}
          <Link href="/privacy">Privacy Policy</Link> and the{" "}
          <Link href="/terms">Terms of Service</Link>.
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
