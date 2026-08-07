import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator, msg } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { PLANS, PLAN_PRICE_CENTS } from "@/lib/plans";
import { PLATFORM_FEE_PERCENT } from "@/lib/money-math";
import { currentUser } from "@/lib/session";
import { foundingSpotsLeft, FOUNDING_LIMIT } from "@/lib/upgrade";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing — mozg",
  description:
    "Teaching a brain from your own CLI subscription is free, and always will be. A plan buys one thing: our AI doing the reading, so there is no API key to wire up.",
};

/**
 * The one page that answers "what am I paying, and for what" in order of how
 * people actually meet the product: use free things, buy a brain, then maybe
 * pay for a plan because they build their own.
 */

const PLAN_PRICES: Record<string, string> = {
  free: "$0",
  pro: "$25/mo",
  team: "$79/mo",
};

const PLAN_PITCH: Record<string, string> = {
  free:
    msg("Full access to everything already built: the whole catalogue, every agent you connect, learning. One brain of your own, taught without limit from your CLI on the subscription you already pay for or on your own API key — with room to actually work: three thousand agent searches a month and two hundred sources. Plus a paste-a-URL taste of our AI, so you can see the difference before deciding it is worth $25."),
  pro:
    msg("Our AI does the reading. Paste a documentation URL and our models crawl it, extract every page, write the exam, grade it and re-read what changed next week — nothing running on your machine, no key to wire up. $20 of that inference is included every month, which at what a page actually costs us is well over a thousand pages; the other $5 is the servers, the embedder and the exam judge."),
  team:
    msg("The same at scale: $65 of our inference a month, a hundred brains, and enough agent calls for a room full of them. Higher ceilings rather than seats — shared ownership is still being built, and this card will say so until it exists."),
};

export default async function PricingPage() {
  const t = await translator();

  const user = await currentUser();
  const spots = await foundingSpotsLeft();
  const shown = (["free", "pro", "team"] as const).map((k) => ({
    key: k,
    ...PLANS[k],
  }));

  return (
    <>
      <TopBar />
      <Contents active="/pricing" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">{t("Pricing")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5vw, 3.25rem)", margin: ".5rem 0 1rem", maxWidth: "18ch" }}>
          {t("Your agent teaches free. Our AI teaching costs.")}</h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          {t("Two ways to fill a brain — the difference is whose inference reads the material. Everything else is free either way: the code (AGPL), the whole catalogue, connecting agents, reading, learning.")}</p>

        {/* The two ways, as two cards instead of one wall of prose — this is
            the page's whole argument, and it deserves columns, not commas. */}
        <div
          style={{
            display: "grid",
            gap: "1.25rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(300px, 1fr))",
            marginTop: "1.75rem",
            maxWidth: "62rem",
          }}
        >
          <div className="panel" style={{ borderLeft: "4px solid var(--color-riso-green)" }}>
            <p className="eyebrow" style={{ margin: "0 0 .5rem" }}>
              {t("Your CLI teaches · free, always")}</p>
            <p style={{ color: "var(--ink-2)", margin: 0, lineHeight: 1.6 }}>
              {markup(t("Install the plugin, run <0>/mozg:train</0> — the agent on the Claude or Kimi subscription you already pay for reads the material and writes the notes in. Or set your own API key and paste URLs. No plan, no bill from us, no cap on how much you teach."), [
              <code className="mono" key="s0" />,
            ])}</p>
          </div>
          <div className="panel" style={{ borderLeft: "4px solid var(--color-riso-red)" }}>
            <p className="eyebrow" style={{ margin: "0 0 .5rem" }}>
              {t("Our AI teaches · the plan")}</p>
            <p style={{ color: "var(--ink-2)", margin: 0, lineHeight: 1.6 }}>
              {t("Hand over a documentation URL — our models crawl it, extract the notes, sit the exam and re-read what changed while you sleep. A plan states how much of that inference it includes — $20/mo on Pro, $65 on Team — because a number you can check beats a promise you cannot.")}</p>
          </div>
        </div>

        {spots > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: ".75rem 1.25rem",
              flexWrap: "wrap",
              border: "1.5px solid var(--ink)",
              background: "var(--color-riso-yellow)",
              boxShadow: "4px 4px 0 var(--ink)",
              padding: ".85rem 1.25rem",
              marginTop: "1.75rem",
              maxWidth: "62rem",
            }}
          >
            {/* The strongest thing on this page says the resulting price, not a
                percentage: −50% is a claim, $12.50 is a number. */}
            <strong className="mono" style={{ fontSize: ".8125rem", textTransform: "uppercase", letterSpacing: ".08em" }}>
              {t("Founding offer")}</strong>
            <span style={{ fontSize: ".9375rem" }}>
              {markup(t("The first <0/> paying accounts keep half price <1>forever</1> — Pro $<2/>/mo, Team $ <3/>/mo."), [
              FOUNDING_LIMIT,
              <strong key="s1" />,
              (PLAN_PRICE_CENTS.pro / 200).toFixed(2),
              (PLAN_PRICE_CENTS.team / 200).toFixed(2),
            ])}</span>
            <span className="mono" style={{ fontSize: ".8125rem", marginLeft: "auto", whiteSpace: "nowrap" }}>
              {markup(t("<0/> of <1/> left"), [
              spots,
              FOUNDING_LIMIT,
            ])}</span>
          </div>
        )}

        {/* ── plans ─────────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("Plans — for building your own")}</h2>
            <span className="eyebrow">{t("cancel anytime, export everything")}</span>
          </div>

          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            {shown.map((p) => (
              <div key={p.key} style={{ background: "var(--paper-2)", padding: "1.5rem" }}>
                <p className="eyebrow" style={{ margin: 0 }}>
                  {p.key}
                </p>
                <p className="display" style={{ fontSize: "2rem", margin: ".3rem 0 .4rem" }}>
                  {PLAN_PRICES[p.key]}
                </p>
                <p style={{ color: "var(--ink-2)", fontSize: ".9375rem", margin: "0 0 1rem" }}>
                  {t(PLAN_PITCH[p.key])}
                </p>
                <ul
                  className="mono"
                  style={{
                    listStyle: "none",
                    padding: 0,
                    margin: 0,
                    fontSize: ".8125rem",
                    display: "grid",
                    gap: ".45rem",
                    color: "var(--ink-2)",
                  }}
                >
                  <li>
                    {p.brains === 0
                      ? "— building needs Pro"
                      : `${p.brains} brain${p.brains === 1 ? "" : "s"} of your own`}
                  </li>
                  {/* True on every plan, and stated on every plan: the point is
                      that the free column is not a crippled version. What free
                      limits is how many brains and how much of OUR inference,
                      never how much you may teach with your own. */}
                  <li>{t("✓ teach from your CLI — unlimited notes")}</li>
                  <li>
                    {p.monthlyExtractCents >= 1000
                      ? `✓ our AI reads for you — $${(p.monthlyExtractCents / 100).toFixed(0)} of inference a month`
                      : `our AI: $${(p.monthlyExtractCents / 100).toFixed(2)} a month — one trial brain, once`}
                  </li>
                  <li>
                    {p.monthlyExtractCents >= 1000
                      ? "✓ or your own key, and the budget stops applying"
                      : "✓ your own API key — unlimited, you pay the model"}
                  </li>
                  <li>
                    {p.sources === 0
                      ? "catalogue + purchased brains"
                      : `${p.sources.toLocaleString()} sources per brain`}
                  </li>
                  <li>{markup(t("<0/> agent searches / month"), [
                    p.calls.toLocaleString(),
                  ])}</li>
                  <li>
                    {Number.isFinite(p.examSittings)
                      ? `${p.examSittings} exam sittings, then a key or a plan`
                      : "✓ exams re-sat as often as the brain changes"}
                  </li>
                  <li>{p.write ? "✓ agents write lessons back" : "— agents read only"}</li>
                  <li>{p.exports ? "✓ export as CLAUDE.md / Skill" : "— no export"}</li>
                </ul>

                {/* A price with no way to act on it is a poster. Both buttons land
                    where the thing actually happens: the plan panel in settings,
                    which pays from balance and applies founding or a promo code —
                    or the sign-in that has to come first. */}
                <div style={{ marginTop: "1.1rem" }}>
                  {p.key === "free" ? (
                    <Link className="btn btn-ghost" href={user ? "/brains" : "/sign-in?next=/start"}>
                      {user ? "Your brains" : "Start free"}
                    </Link>
                  ) : (
                    <Link
                      className="btn"
                      href={user ? "/settings#plan" : `/sign-in?next=/settings%23plan`}
                    >
                      {markup(t("Subscribe to <0/> <1/>"), [
                      p.key === "pro" ? "Pro" : "Team",
                      spots > 0 ? " · half price" : "",
                    ])}</Link>
                  )}
                </div>
              </div>
            ))}
          </div>

          <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)", marginTop: ".9rem" }}>
            {markup(t("Subscribing pays a month from your balance — top it up with crypto, or ask for an invoice by hand within a day at <0>chatmozg</0>. Card checkout is not wired up yet; the limits and the balance are."), [
            <a href="/chat" key="s0" />,
          ])}</p>
        </section>

        {/* ── catalogue ─────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("The catalogue — free; the marketplace — authors' call")}</h2>
            <span className="eyebrow">{t("official brains cost nothing")}</span>
          </div>

          <div
            style={{
              display: "grid",
              gap: "2rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: "48ch" }}>
              {markup(t("Every official brain is free — the catalogue is the commons. Outside authors publishing their own expertise may charge; a paid brain is bought once, from your balance, and keeps working as its author updates it. <0/>% of the price goes to the author; <1/>% keeps this running."), [
              100 - PLATFORM_FEE_PERCENT,
              PLATFORM_FEE_PERCENT,
            ])}</p>
            <div className="panel">
              <p className="eyebrow" style={{ marginBottom: ".6rem" }}>
                {t("Before you pay, you can check")}</p>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-2)", display: "grid", gap: ".4rem", fontSize: ".9375rem" }}>
                <li>{t("the exam score — measured, not claimed by the author")}</li>
                <li>{t("which questions it passes, from its own exam")}</li>
                <li>{t("every note title — the shop window, never the contents")}</li>
                <li>{t("when it was last updated, and how often")}</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── balance ───────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("Balance — how paying works")}</h2>
            <span className="eyebrow">{t("crypto now · card on the way")}</span>
          </div>
          <div
            style={{
              display: "grid",
              gap: "2rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
              alignItems: "start",
            }}
          >
            <div>
              <p style={{ color: "var(--ink-2)", maxWidth: "48ch", marginTop: 0 }}>
                {t("Purchases come from a balance you top up once — USDT, USDC, BTC and other coins today, cards soon. Selling brains pays into the same balance, and authors withdraw from it. Every movement is listed on one page, nothing hidden.")}</p>
              <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
                <Link className="btn" href={user ? "/settings/topup" : "/sign-in?next=/settings/topup"}>
                  {t("Top up balance")}</Link>
                <Link className="btn btn-ghost" href="/explore?price=paid">
                  {t("Browse the catalogue")}</Link>
              </div>
            </div>
            {/* The money's whole loop in four lines, so the empty right half of
                this section stops looking like a layout accident. */}
            <div className="panel">
              <p className="eyebrow" style={{ marginBottom: ".6rem" }}>
                {t("Where a dollar goes")}</p>
              <ul
                className="mono"
                style={{ listStyle: "none", margin: 0, padding: 0, display: "grid", gap: ".45rem", fontSize: ".8125rem", color: "var(--ink-2)" }}
              >
                <li>{t("top up → balance · crypto, no card needed")}</li>
                <li>{t("buy a brain once → it stays yours, updates included")}</li>
                <li>{markup(t("<0/>% → the author · <1/>% keeps this running"), [
                  100 - PLATFORM_FEE_PERCENT,
                  PLATFORM_FEE_PERCENT,
                ])}</li>
                <li>{t("authors withdraw → same balance, one ledger page")}</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── the honest questions ──────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            {t("The questions people actually ask")}</h2>
          <div className="rows">
            {[
              [
                "Why pay at all, when the model already knows things?",
                "You pay for what the model gets wrong: docs newer than its training, specs precise enough that a paraphrase is a bug, and your own conventions nobody published. A brain's exam score tells you exactly whether that gap is real before you spend anything.",
              ],
              [
                "If teaching from my CLI is free, what does Pro actually buy?",
                "Whose AI does the reading. Teaching from your CLI spends the subscription you already pay Anthropic or Moonshot for: your agent opens the docs, distils the notes and writes them in — we only store and index them, which costs us a self-hosted embedding, so we charge nothing. Pro is our inference doing that work: you paste a documentation URL and our models crawl it, extract every page, write the exam, grade it and re-read what changed next week. Nothing runs on your machine, no API key gets wired up anywhere, and a docs site of five hundred pages is a URL rather than an evening.",
              ],
              [
                "So the free plan is not a crippled version?",
                "No, and it says so on the card above: teaching from your own CLI is unlimited on every plan, including free. What free gives you of our AI is a trial brain — enough to feel the difference between an exam-scored corpus built in an afternoon and one you assembled by hand. The plans differ in how much of our inference you can spend per day, how many brains you keep, and how many agent calls a month you make.",
              ],
              [
                "Can I use my own API key instead of a plan?",
                "Yes — settings → train on your own key, with Anthropic or anything OpenAI-compatible (OpenAI, Kimi, DeepSeek, Qwen, GLM). Then our daily ceiling steps aside entirely, because the spend is yours on your key. A plan is for people who would rather not hold a key at all.",
              ],
              [
                "Does using a brain burn my API tokens?",
                "No. Searching a brain is a database lookup on our side — your agent spends only the handful of tokens it takes to read the few notes it asked for. Money is spent once, when a brain is built, not when it is used.",
              ],
              [
                "What if I stop paying?",
                "Bought brains stay bought. Your own brains export as CLAUDE.md, a Claude Skill or AGENTS.md — files that keep working with no server and no subscription. Leaving is cheap by design; that is why staying has to be worth it.",
              ],
              [
                "Refunds?",
                "A brain can be copied the moment it is readable, so there are no refunds after the first read. Everything a buyer needs to decide — score, passed questions, note titles — is public before paying.",
              ],
            ].map(([q, a]) => (
              <div key={q} className="row">
                <span style={{ minWidth: 0 }}>
                  <strong>{q}</strong>
                  <span className="row-sub" style={{ maxWidth: "70ch" }}>
                    {a}
                  </span>
                </span>
              </div>
            ))}
          </div>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
