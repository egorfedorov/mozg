import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { PLANS } from "@/lib/plans";
import { PLATFORM_FEE_PERCENT } from "@/lib/money-math";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Pricing — mozg",
  description:
    "What is free, what costs money, and where the money goes: plans for building brains, one-time purchases from the catalogue, and a balance topped up with crypto.",
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
  free: "Read the catalogue, buy brains, connect your agents. Building is the paid act.",
  pro: "For one person who builds brains and works with agents daily.",
  team: "For a team feeding shared brains and many agents.",
};

export default async function PricingPage() {
  const user = await currentUser();
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
          Three things cost money.
          <br />
          Everything else doesn&apos;t.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          Reading brains with your agents is free and stays free — searching a
          brain spends no tokens and no credits. You pay for a <strong>plan</strong>{" "}
          when you build brains of your own, for a <strong>brain from the
          catalogue</strong> once if it saves you building one, and you top up a{" "}
          <strong>balance</strong> to do the buying.
        </p>

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
            hand within a day: <a href="mailto:hi@mozg.sh">hi@mozg.sh</a>. The
            limits are live; the invoice is the manual part.
          </p>
        </section>

        {/* ── catalogue ─────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div className="section-head">
            <h2 className="h2">Brains from the catalogue — pay once</h2>
            <span className="eyebrow">free ones stay free</span>
          </div>

          <div
            style={{
              display: "grid",
              gap: "2rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))",
            }}
          >
            <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: "48ch" }}>
              A paid brain is bought once, from your balance, and keeps working
              as its author updates it — you are buying the upkeep, not a
              snapshot. Before paying you see its exam score, the questions it
              passes, and every note title. {100 - PLATFORM_FEE_PERCENT}% of the
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
              See paid brains
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
