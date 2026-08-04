import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { SketchDefs, Pipeline, Divergence, Scribble } from "@/components/Sketch";
import { currentUser } from "@/lib/session";
import { query } from "@/db";
import type { Brain } from "@/db/types";
import { tintFor } from "@/lib/brains";
import { topicLabel } from "@/lib/topics";
import { formatCents } from "@/lib/money-math";

// Renders per-session (the header shows who you are), so it must not be
// prerendered into a single cached copy.
export const dynamic = "force-dynamic";

/** Kept short and true: every one of these is configured on /connect. */
const CLIENT_NAMES = ["Claude Code", "Codex", "Cursor", "Cline", "Kimi CLI", "Qwen Code", "VS Code"];

const USES: { field: string; tint: string; title: string; body: string }[] = [
  {
    field: "Design systems",
    tint: "violet",
    title: "Our components, not Tailwind's",
    body: "Exact spacing, the states you actually ship, and the three rules everyone breaks.",
  },
  {
    field: "Backend & APIs",
    tint: "blue",
    title: "The integration as it really runs",
    body: "Your retries, your idempotency keys, the webhook order — not the vendor's happy path.",
  },
  {
    field: "Game development",
    tint: "red",
    title: "Engine conventions and math",
    body: "How a mechanic is wired, what the pipeline expects, which numbers are load-bearing.",
  },
  {
    field: "Product & process",
    tint: "orange",
    title: "What nobody wrote down",
    body: "Naming, review rules, the deploy sequence — the folklore a new agent never gets.",
  },
];

export default async function Home() {
  const user = await currentUser();

  // Real brains, not mockups. An empty catalogue simply hides the section
  // rather than showing three placeholders that promise something untrue.
  const featured = await query<
    Brain & { owner_handle: string }
  >(
    `select b.*, u.handle as owner_handle
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and u.handle is not null
        and b.parent_id is null
      order by b.score desc nulls last, b.updated_at desc
      limit 3`,
  );

  return (
    <>
      <SketchDefs />
      <TopBar />
      <Contents />

      <main className="shell" style={{ paddingBlock: "clamp(3rem, 9vw, 6rem)" }}>
        {/* Hero. The most characteristic thing in this product's world is a
            terminal transcript, so that is the hero — not a headline over a
            gradient. */}
        <p className="eyebrow">Model Context Protocol · Claude Code · Codex · Cursor</p>

        {/* The one heading larger than the scale: it is the hero, and the
            scale exists so that this exception reads as deliberate. */}
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
            https://mozg.sh/mcp
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

        {/* Breadth, stated as a fact rather than as a wall of logos we do not
            have permission to use. */}
        <div
          style={{
            marginTop: "1.25rem",
            paddingTop: "1rem",
            borderTop: "1px solid var(--rule)",
            display: "flex",
            gap: "1.25rem",
            flexWrap: "wrap",
            alignItems: "baseline",
          }}
        >
          <span className="eyebrow">Reads in</span>
          {CLIENT_NAMES.map((name) => (
            <span key={name} className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
              {name}
            </span>
          ))}
          <Link className="mono" href="/connect" style={{ fontSize: ".8125rem" }}>
            all of them →
          </Link>
        </div>

        {/* The mark, thinking. Muted, looping, decorative — the page must
            read identically with the video ignored, so it gets no copy of its
            own beyond a caption. */}
        <section style={{ marginTop: "clamp(3rem, 8vw, 4.5rem)" }}>
          <video
            src="/promo.mp4"
            autoPlay
            muted
            loop
            playsInline
            preload="metadata"
            aria-label="mozg — documents flow into a brain, answers flow out to agents"
            style={{
              width: "100%",
              display: "block",
              border: "1.5px solid var(--ink)",
              background: "var(--paper-2)",
            }}
          />
          <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".5rem" }}>
            material in · answers out · that is the whole product
          </p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 8vw, 4.5rem)" }}>
          <p className="eyebrow">What actually happens</p>
          <h2 className="h1" style={{ margin: ".5rem 0 1.5rem" }}>
            Nothing is stuffed
            <br />
            into the context.
          </h2>
          <Pipeline />
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            A page is read once into notes that keep the exact values. The agent
            searches those and takes the handful it needs — which is why a brain
            can hold seven hundred notes and still cost a paragraph to use.
          </p>
        </section>

        {/* The pitch is abstract until you see what goes in one. */}
        <section style={{ marginTop: "clamp(4rem, 10vw, 6rem)" }}>
          <p className="eyebrow">What people put in one</p>
          <h2
            className="h1" style={{ margin: ".6rem 0 1.5rem" }}
          >
            The things you explain twice a week.
          </h2>

          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))",
            }}
          >
            {USES.map((u) => (
              <div key={u.title} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
                <p className="eyebrow" style={{ margin: 0, color: `var(--color-riso-${u.tint})` }}>
                  {u.field}
                </p>
                <h3 className="h3" style={{ margin: ".4rem 0 .5rem" }}>
                  {u.title}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{u.body}</p>
              </div>
            ))}
          </div>
        </section>

        {/* The differentiator gets its own beat. */}
        <section style={{ marginTop: "clamp(4rem, 10vw, 7rem)" }}>
          <p className="eyebrow">What nobody else does</p>
          <h2
            className="h1" style={{ margin: ".6rem 0 1.5rem" }}
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

        <section style={{ marginTop: "clamp(4rem, 9vw, 6rem)" }}>
          <p className="eyebrow">Why not just write a file</p>
          <h2 className="h1" style={{ margin: ".5rem 0 1.5rem" }}>
            Because of what
            <br />
            happens next.
          </h2>
          <Divergence />
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            A file is the same three months later. A brain has been re-read,
            corrected by the agents using it, and measured against what it claims
            to know.{" "}
            <Link href="/vs" style={{ textDecoration: "underline" }}>
              The honest comparison, including when a file wins
            </Link>
            .
          </p>
        </section>

        <div style={{ margin: "clamp(3rem, 8vw, 4.5rem) 0 2.5rem" }}>
          <Scribble />
        </div>

        {/* Where to go next, in the order someone actually needs it. */}
        <section>
          <p className="eyebrow">Start here</p>
          <h2
            className="display"
            style={{ fontSize: "clamp(1.6rem, 4vw, 2.25rem)", margin: ".4rem 0 1.5rem" }}
          >
            Four pages, then you&apos;re running.
          </h2>

          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            <GuideCard
              href="/vs"
              step="01"
              title="Why not just a file?"
              blurb="Both are text an agent reads. The difference is what happens to them over three months."
            />
            <GuideCard
              href="/make"
              step="02"
              title="Make one, in six panels"
              blurb="Pick one job, write the goal as an outcome, feed the real thing, read the failures."
            />
            <GuideCard
              href="/connect"
              step="03"
              title="Connect your agent"
              blurb="Copy-paste setup for Claude Code, Codex, Cursor, Kimi, DeepSeek, GLM and Qwen."
            />
            <GuideCard
              href="/explore"
              step="04"
              title="Or take one that exists"
              blurb="A catalogue of brains other people built, by field, free and paid."
            />
          </div>
        </section>

        {featured.length > 0 && (
          <section style={{ marginTop: "clamp(3rem, 8vw, 4.5rem)" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "baseline",
                marginBottom: "1rem",
                flexWrap: "wrap",
                gap: ".5rem",
              }}
            >
              <h2 className="h2">
                In the catalogue now
              </h2>
              <Link className="mono" href="/explore" style={{ fontSize: ".8125rem" }}>
                all brains →
              </Link>
            </div>

            <div className="grid-brains">
              {featured.map((b) => (
                <Link
                  key={b.id}
                  href={`/b/${b.owner_handle}/${b.slug}`}
                  className="card"
                  data-tint={tintFor(b)}
                >
                  <span className="eyebrow" style={{ color: "inherit", opacity: 0.75 }}>
                    {topicLabel(b.topic)} · {b.owner_handle}
                  </span>
                  <h3 className="card-title">{b.title}</h3>
                  <p className="card-goal">{b.goal ?? "No goal set."}</p>
                  <div className="card-foot">
                    <span style={{ opacity: 0.8 }}>
                      {b.price_cents ? formatCents(b.price_cents) : "Free"} · {b.note_count} notes
                    </span>
                    {b.score !== null && (
                      <span className="card-score">
                        {b.score}
                        <sup>%</sup>
                      </span>
                    )}
                  </div>
                </Link>
              ))}
            </div>
          </section>
        )}

        {/* Money, in one strip: the question every visitor has and most
            landing pages hide. The details live on /pricing. */}
        <section
          style={{
            marginTop: "clamp(3rem, 8vw, 4.5rem)",
            display: "grid",
            gap: "1px",
            background: "var(--rule)",
            border: "1.5px solid var(--ink)",
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          {[
            ["Using brains", "free, always", "searching spends no tokens and no credits — money is spent once, when a brain is built"],
            ["Building your own", "free to start", "one brain on the free plan; $15/mo when you need twenty"],
            ["Catalogue brains", "$0–29, once", "you see the exam score and the questions it passes before paying; 95% goes to the author"],
          ].map(([t, price, d]) => (
            <div key={t} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                {t}
              </p>
              <p className="display" style={{ fontSize: "1.4rem", margin: ".3rem 0 .35rem" }}>
                {price}
              </p>
              <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".875rem" }}>{d}</p>
            </div>
          ))}
          <Link
            href="/pricing"
            style={{
              background: "var(--paper-2)",
              padding: "1.25rem",
              display: "grid",
              alignContent: "center",
            }}
          >
            <span className="h3">The whole story →</span>
            <span style={{ color: "var(--ink-2)", fontSize: ".875rem", marginTop: ".35rem" }}>
              plans, purchases, balance, refunds
            </span>
          </Link>
        </section>

        {/* One clear way out of the page. */}
        <section
          className="panel"
          style={{
            marginTop: "clamp(3.5rem, 9vw, 5rem)",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
            borderWidth: "2px",
          }}
        >
          <div style={{ flex: "1 1 32ch" }}>
            <h2 className="h2" style={{ margin: 0 }}>
              Stop explaining the same thing.
            </h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              The free plan holds one brain, fifty sources and three hundred agent
              calls a month — enough to find out whether this works for you.
            </p>
          </div>
          <Link className="btn" href={user ? "/brains" : "/sign-in"}>
            {user ? "Open your brains" : "Build a brain"}
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

function GuideCard({
  href,
  step,
  title,
  blurb,
}: {
  href: string;
  step: string;
  title: string;
  blurb: string;
}) {
  return (
    <Link href={href} style={{ background: "var(--paper-2)", padding: "1.25rem" }}>
      {/* Numbered because this really is a sequence — read, build, connect. */}
      <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
        {step}
      </span>
      <h3 className="h3" style={{ margin: ".35rem 0 .5rem" }}>
        {title}
      </h3>
      <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{blurb}</p>
    </Link>
  );
}
