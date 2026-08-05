import Link from "next/link";
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
  team: "$95/mo",
};

const PLAN_PITCH: Record<string, string> = {
  free:
    "Full access to everything already built: the whole catalogue, every agent you connect, learning, exports of what you can read. Plus one brain of your own that you may teach without limit — from your CLI on the Claude or Kimi subscription you already pay for, or on your own API key. And one paste-a-URL trial on our AI, so you can see the difference before deciding it is worth $25.",
  pro:
    "Our AI does the reading. Paste a documentation URL and our models crawl it, extract every page, write the exam, grade it and re-read what changed next week — nothing running on your machine, no key to wire up. $20 of that inference a month is included; the other $5 is the servers and the exam judge.",
  team:
    "The same at team scale: $90 of our inference a month, a hundred brains, fifty thousand agent calls. Bring your own key on any plan and the budget stops applying entirely.",
};

export default async function PricingPage() {
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
        <p className="eyebrow">Pricing</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", margin: ".5rem 0 1rem" }}>
          Your agent teaches free.
          <br />
          Our AI teaching costs.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          Two ways to fill a brain, and the difference is whose inference reads
          the material. <strong>Yours is free, always</strong>: install the
          plugin and run <code>/mozg:train</code>, and the agent on the Claude or
          Kimi subscription you already pay for does the reading and writes the
          notes in — or set your own API key in settings and paste URLs the same
          way a plan does. No plan, no bill from us, no cap on how much you
          teach. <strong>Ours is the plan</strong>: hand over a documentation URL
          and our models crawl it, extract the notes, sit the exam and re-read
          what changed while you are asleep. A plan states how much of that
          inference it includes — $20 a month on Pro, $90 on Team — because a
          number you can check beats a promise you cannot.
        </p>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          Everything else stays free either way: the code (AGPL), the whole
          official catalogue, connecting agents, reading, learning. Marketplace
          brains by outside authors, when priced, are bought once from a{" "}
          <strong>balance</strong> — 95% goes to the author.
        </p>

        {spots > 0 && (
          <p
            className="mono"
            style={{
              display: "inline-block",
              border: "1.5px solid var(--color-riso-red)",
              color: "var(--color-riso-red)",
              padding: ".45rem .8rem",
              fontSize: ".8125rem",
              marginTop: ".75rem",
            }}
          >
            {/* The offer already existed in the code and whispered here. It is
                the strongest thing on this page, so it says the resulting price
                rather than a percentage: −50% is a claim, $12.50 is a number. */}
            Founding offer · the first {FOUNDING_LIMIT} paying accounts keep half
            price <strong>forever</strong> — Pro ${(PLAN_PRICE_CENTS.pro / 200).toFixed(2)}/mo
            instead of ${(PLAN_PRICE_CENTS.pro / 100).toFixed(0)}, Team $
            {(PLAN_PRICE_CENTS.team / 200).toFixed(2)} instead of $
            {(PLAN_PRICE_CENTS.team / 100).toFixed(0)} · {spots} of {FOUNDING_LIMIT} left
          </p>
        )}

        {/* ── plans ─────────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="section-head">
            <h2 className="h2">Plans — for building your own</h2>
            <span className="eyebrow">cancel anytime, export everything</span>
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
                  {PLAN_PITCH[p.key]}
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
                  <li>{p.brains === 0 ? "— building needs Pro" : `${p.brains} brains`}</li>
                  {/* True on every plan, and stated on every plan: the point is
                      that the free column is not a crippled version. What free
                      limits is how many brains and how much of OUR inference,
                      never how much you may teach with your own. */}
                  <li>✓ teach from your CLI — unlimited notes</li>
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
                  <li>{p.calls.toLocaleString()} agent calls / month</li>
                  <li>{p.write ? "✓ agents write lessons back" : "— agents read only"}</li>
                  <li>{p.exports ? "✓ export as CLAUDE.md / Skill" : "— no export"}</li>
                </ul>
              </div>
            ))}
          </div>

          <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)", marginTop: ".9rem" }}>
            Plan billing is being wired up — until then upgrades are done by
            hand within a day: <a href="/chat">chatmozg</a>. The
            limits are live; the invoice is the manual part.
          </p>
        </section>

        {/* ── catalogue ─────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="section-head">
            <h2 className="h2">The catalogue — free; the marketplace — authors&apos; call</h2>
            <span className="eyebrow">official brains cost nothing</span>
          </div>

          <div
            style={{
              display: "grid",
              gap: "2rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: "48ch" }}>
              Every official brain is free — the catalogue is the commons.
              Outside authors publishing their own expertise may charge; a
              paid brain is bought once, from your balance, and keeps working
              as its author updates it. {100 - PLATFORM_FEE_PERCENT}% of the
              price goes to the author; {PLATFORM_FEE_PERCENT}% keeps this
              running.
            </p>
            <div className="panel">
              <p className="eyebrow" style={{ marginBottom: ".6rem" }}>
                Before you pay, you can check
              </p>
              <ul style={{ margin: 0, paddingLeft: "1.1rem", color: "var(--ink-2)", display: "grid", gap: ".4rem", fontSize: ".9375rem" }}>
                <li>the exam score — measured, not claimed by the author</li>
                <li>which questions it passes, from its own exam</li>
                <li>every note title — the shop window, never the contents</li>
                <li>when it was last updated, and how often</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── balance ───────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="section-head">
            <h2 className="h2">Balance — how paying works</h2>
            <span className="eyebrow">crypto now · card on the way</span>
          </div>
          <p style={{ color: "var(--ink-2)", maxWidth: "58ch", marginTop: 0 }}>
            Purchases come from a balance you top up once — USDT, USDC, BTC and
            other coins today, cards soon. Selling brains pays into the same
            balance, and authors withdraw from it. Every movement is listed on
            one page, nothing hidden.
          </p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
            <Link className="btn" href={user ? "/settings/topup" : "/sign-in?next=/settings/topup"}>
              Top up balance
            </Link>
            <Link className="btn btn-ghost" href="/explore?price=paid">
              Browse the catalogue
            </Link>
          </div>
        </section>

        {/* ── the honest questions ──────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            The questions people actually ask
          </h2>
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
