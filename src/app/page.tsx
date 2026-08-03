import Link from "next/link";
import TopBar from "@/components/TopBar";
import { currentUser } from "@/lib/session";

// Renders per-session (the header shows who you are), so it must not be
// prerendered into a single cached copy.
export const dynamic = "force-dynamic";

export default async function Home() {
  const user = await currentUser();

  return (
    <>
      <TopBar />

      <main className="shell" style={{ paddingBlock: "clamp(3rem, 9vw, 6rem)" }}>
        {/* Hero. The most characteristic thing in this product's world is a
            terminal transcript, so that is the hero — not a headline over a
            gradient. */}
        <p className="eyebrow">Model Context Protocol · Claude Code · Codex · Cursor</p>

        <h1
          className="display"
          style={{ fontSize: "clamp(2.6rem, 8.5vw, 5.5rem)", margin: ".75rem 0 1rem" }}
        >
          Teach it once.
          <br />
          Every agent knows.
        </h1>

        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            maxWidth: "46ch",
            color: "var(--ink-2)",
            margin: "0 0 2.25rem",
          }}
        >
          Drop in screenshots and files. mozg turns them into a searchable brain
          your coding agents read over MCP — and tells you how much it still
          doesn&apos;t know.
        </p>

        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "3.5rem" }}>
          <Link className="btn" href={user ? "/brains" : "/sign-in"}>
            {user ? "Open your brains" : "Build a brain"}
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            Browse public brains
          </Link>
        </div>

        <div className="term" aria-label="Example session">
          <div className="term-bar">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span style={{ marginLeft: ".5rem" }}>claude code</span>
          </div>
          <div>
            <span className="c">$</span> claude mcp add --transport http mozg
            https://api.mozg.dev/mcp
          </div>
          <div className="t">✓ connected · 3 brains available</div>
          <div style={{ height: ".9rem" }} />
          <div>
            <span className="u">&gt;</span> build the pricing page — make it match our
            design system
          </div>
          <div style={{ height: ".9rem" }} />
          <div className="k">
            {" "}
            brain_search(brain: &quot;design&quot;, query: &quot;card, spacing, price
            type&quot;)
          </div>
          <div className="c"> → 6 notes · 128 ms</div>
          <div style={{ height: ".9rem" }} />
          <div> Cards: 1px #E4E4E7 border, no shadow at rest, 8px radius, 24px pad.</div>
          <div> Section gap is 32px — 24px is the inner scale, never between sections.</div>
          <div> Price is 40/44 with tabular-nums. Primary CTA fills only on mobile.</div>
        </div>

        {/* The differentiator gets its own beat. */}
        <section style={{ marginTop: "clamp(4rem, 10vw, 7rem)" }}>
          <p className="eyebrow">What nobody else does</p>
          <h2
            className="display"
            style={{ fontSize: "clamp(1.9rem, 4.5vw, 3rem)", margin: ".6rem 0 1.5rem" }}
          >
            Every brain sits an exam.
          </h2>

          <div
            style={{
              display: "grid",
              gap: "2rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              alignItems: "start",
            }}
          >
            <p style={{ fontSize: "1.0625rem", color: "var(--ink-2)", maxWidth: "44ch" }}>
              You write what the brain is <em>for</em>. mozg turns that into control
              questions and runs them after every upload. So you get a number you can
              trust — and a list of exactly which material is missing, instead of
              guessing why your agent still gives bad answers.
            </p>

            <div className="scorecard">
              <div className="score-head">
                <div>
                  <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                    Brain · Design system
                  </p>
                  <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                    32 checks · 4 categories
                  </span>
                </div>
                <div className="score-big">
                  84<sup>%</sup>
                </div>
              </div>

              <div className="score-row" data-state="pass">
                <span className="sig">✓</span>
                <span>Colour, borders and elevation</span>
                <span className="count">12 / 12</span>
              </div>
              <div className="score-row" data-state="pass">
                <span className="sig">✓</span>
                <span>Type scale and spacing</span>
                <span className="count">8 / 8</span>
              </div>
              <div className="score-row" data-state="partial">
                <span className="sig">▲</span>
                <span>
                  Motion and transitions
                  <span className="score-gap">missing · no screen recordings yet</span>
                </span>
                <span className="count">3 / 7</span>
              </div>
              <div className="score-row" data-state="fail">
                <span className="sig">✕</span>
                <span>
                  Empty and error states
                  <span className="score-gap">missing · no source covers this</span>
                </span>
                <span className="count">0 / 5</span>
              </div>
            </div>
          </div>
        </section>

        <hr className="rule" style={{ margin: "clamp(4rem, 9vw, 6rem) 0 2.5rem" }} />

        <section
          style={{
            display: "grid",
            gap: "2rem",
            gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
          }}
        >
          <div>
            <p className="eyebrow">One brain, every agent</p>
            <p style={{ marginTop: ".5rem", color: "var(--ink-2)" }}>
              Claude learns it on Monday, Codex knows it on Tuesday. Built-in agent
              memory stays locked to one vendor; a brain does not.
            </p>
          </div>
          <div>
            <p className="eyebrow">Agents write back</p>
            <p style={{ marginTop: ".5rem", color: "var(--ink-2)" }}>
              An agent that works out a convention saves it. You approve it in a review
              queue, so the brain gets sharper instead of noisier.
            </p>
          </div>
          <div>
            <p className="eyebrow">Yours to take</p>
            <p style={{ marginTop: ".5rem", color: "var(--ink-2)" }}>
              Export any brain as CLAUDE.md, a Claude Skill or AGENTS.md. It keeps
              working if you stop paying us.
            </p>
          </div>
        </section>

        <footer
          className="mono"
          style={{
            marginTop: "clamp(4rem, 9vw, 6rem)",
            paddingTop: "1.5rem",
            borderTop: "1px solid var(--rule)",
            fontSize: ".75rem",
            color: "var(--ink-3)",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
          }}
        >
          <span>mozg</span>
          <Link href="/explore">explore</Link>
          <Link href="/sign-in">sign in</Link>
        </footer>
      </main>
    </>
  );
}
