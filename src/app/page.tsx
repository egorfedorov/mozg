import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import { msg } from "@/lib/msg";
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

const USES: {
  field: string;
  tint: string;
  title: string;
  body: string;
  /** Set on the one card that is a sibling product rather than a use case. */
  href?: string;
  cta?: string;
}[] = [
  {
    field: msg("Design systems"),
    tint: "violet",
    title: msg("Our components, not Tailwind's"),
    body: msg("Exact spacing, the states you actually ship, and the three rules everyone breaks."),
  },
  {
    field: msg("Backend & APIs"),
    tint: "blue",
    title: msg("The integration as it really runs"),
    body: msg("Your retries, your idempotency keys, the webhook order — not the vendor's happy path."),
  },
  {
    field: msg("Game development"),
    tint: "red",
    title: msg("Engine conventions and math"),
    body: msg("How a mechanic is wired, what the pipeline expects, which numbers are load-bearing."),
  },
  {
    field: msg("Product & process"),
    tint: "orange",
    title: msg("What nobody wrote down"),
    body: msg("Naming, review rules, the deploy sequence — the folklore a new agent never gets."),
  },
  {
    field: msg("ichi · a sibling project"),
    tint: "green",
    title: msg("A brain gives your agent knowledge. ichi gives it a temper."),
    body: msg("Same idea, other half: a persistent character that rides with your agent over MCP. It remembers how it was treated, takes offence, grows attached — and keeps the standards you laid down."),
    href: "https://ichi.mozg.sh",
    cta: msg("Meet ichi →"),
  },
];

export default async function Home() {
  const t = await translator();

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

  // The learning claim, receipted: public brains whose LAST exam sitting
  // passed questions the sitting before could not. Real diffs from the
  // grader, not copy — an empty list hides the rows rather than faking one.
  const learning = await query<{
    title: string;
    slug: string;
    handle: string;
    gained: number;
  }>(
    `with runs as (
       select r.brain_id, r.id,
              row_number() over (partition by r.brain_id order by r.started_at desc) as rn
         from check_runs r
         join brains b on b.id = r.brain_id
        where r.status = 'done' and r.kind = 'full' and b.visibility = 'public'
     )
     select b.title, b.slug, u.handle, d.gained
       from (
         select r1.brain_id,
                count(*) filter (where cur.passed and prev.passed is distinct from true)::int as gained
           from runs r1
           join check_results cur on cur.run_id = r1.id and r1.rn = 1
           join runs r2 on r2.brain_id = r1.brain_id and r2.rn = 2
           left join check_results prev
             on prev.run_id = r2.id and prev.check_id = cur.check_id
          group by r1.brain_id
       ) d
       join brains b on b.id = d.brain_id
       join "user" u on u.id = b.owner_id
      where d.gained > 0 and u.handle is not null
      order by d.gained desc
      limit 3`,
  );

  return (
    <>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "WebApplication",
            name: "mozg",
            url: "https://mozg.sh",
            applicationCategory: "DeveloperApplication",
            description:
              "Turn documentation into an exam-scored knowledge base AI coding " +
              "agents query over MCP. Brains learn from use: unanswered " +
              "questions become exam questions, corrections become reviewed notes.",
            offers: { "@type": "Offer", price: "0", priceCurrency: "USD" },
          }),
        }}
      />
      <SketchDefs />
      <TopBar />
      <Contents />

      <main className="shell" style={{ paddingBlock: "clamp(3rem, 9vw, 6rem)" }}>
        {/* Hero. The most characteristic thing in this product's world is a
            terminal transcript, so that is the hero — not a headline over a
            gradient. */}
        <p className="eyebrow">{t("Model Context Protocol · Claude Code · Codex · Cursor")}</p>

        {/* The one heading larger than the scale: it is the hero, and the
            scale exists so that this exception reads as deliberate. */}
        <h1
          className="display"
          style={{ fontSize: "clamp(2.6rem, 8.5vw, 5.5rem)", margin: ".75rem 0 1rem" }}
        >
          {markup(t("Teach it once. <0/> Every agent knows."), [
          <br key="s0" />,
        ])}</h1>

        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            maxWidth: "46ch",
            color: "var(--ink-2)",
            margin: "0 0 2.25rem",
          }}
        >
          {t("Drop in screenshots and files. mozg turns them into a searchable brain your coding agents read over MCP — and tells you how much it still doesn't know.")}</p>

        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", alignItems: "center", marginBottom: "3.5rem" }}>
          {user ? (
            <Link className="btn" href="/brains">{t("Open your brains")}</Link>
          ) : (
            <Link className="btn" href="/start">
              {t("Start here — 10 minutes to a thinking agent")}</Link>
          )}
          <Link className="btn btn-ghost" href="/explore">
            {t("Browse public brains")}</Link>
          {!user && (
            <span className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)" }}>
              {t("free · no card · the guided path")}</span>
          )}
          <a
            className="mono"
            href="https://github.com/egorfedorov/mozg"
            style={{ fontSize: ".75rem", color: "var(--ink-2)", textDecoration: "underline" }}
          >
            {t("open source · AGPL · star it on GitHub")}</a>
        </div>

        <div className="term" aria-label="Example session">
          <div className="term-bar">
            <span className="term-dot" />
            <span className="term-dot" />
            <span className="term-dot" />
            <span style={{ marginLeft: ".5rem" }}>{t("claude code")}</span>
          </div>
          <div>
            {markup(t("<0>$</0> claude mcp add --transport http mozg https://mozg.sh/mcp"), [
            <span className="c" key="s0" />,
          ])}</div>
          <div className="t">{t("✓ connected · 3 brains available")}</div>
          <div style={{ height: ".9rem" }} />
          <div>
            {markup(t("<0>&gt;</0> build the pricing page — make it match our design system"), [
            <span className="u" key="s0" />,
          ])}</div>
          <div style={{ height: ".9rem" }} />
          <div className="k">
            {markup(t("brain_search(brain: \"design\", query: \"card, spacing, price type\")"), [
          ])}</div>
          <div className="c"> {t("→ 6 notes · 128 ms")}</div>
          <div style={{ height: ".9rem" }} />
          <div> {t("Cards: 1px #E4E4E7 border, no shadow at rest, 8px radius, 24px pad.")}</div>
          <div> {t("Section gap is 32px — 24px is the inner scale, never between sections.")}</div>
          <div> {t("Price is 40/44 with tabular-nums. Primary CTA fills only on mobile.")}</div>
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
          <span className="eyebrow">{t("Reads in")}</span>
          {CLIENT_NAMES.map((name) => (
            <span key={name} className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
              {name}
            </span>
          ))}
          <Link className="mono" href="/connect" style={{ fontSize: ".8125rem" }}>
            {t("all of them →")}</Link>
        </div>

        <section style={{ marginTop: "clamp(3rem, 8vw, 4.5rem)" }}>
          <p className="eyebrow">{t("What actually happens")}</p>
          <h2 className="h1" style={{ margin: ".5rem 0 1.5rem" }}>
            {markup(t("Nothing is stuffed <0/> into the context."), [
            <br key="s0" />,
          ])}</h2>
          <Pipeline />
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            {t("A page is read once into notes that keep the exact values. The agent searches those and takes the handful it needs — which is why a brain can hold seven hundred notes and still cost a paragraph to use.")}</p>
        </section>

        {/* The pitch is abstract until you see what goes in one. */}
        <section style={{ marginTop: "clamp(4rem, 10vw, 6rem)" }}>
          <p className="eyebrow">{t("What people put in one")}</p>
          <h2
            className="h1" style={{ margin: ".6rem 0 1.5rem" }}
          >
            {t("The things you explain twice a week.")}</h2>

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
                  {t(u.field)}
                </p>
                <h3 className="h3" style={{ margin: ".4rem 0 .5rem" }}>
                  {t(u.title)}
                </h3>
                <p style={{ color: "var(--ink-2)", margin: 0, fontSize: ".9375rem" }}>{t(u.body)}</p>
                {u.href && (
                  <a
                    href={u.href}
                    className="mono"
                    style={{
                      display: "inline-block",
                      marginTop: ".75rem",
                      fontSize: ".8125rem",
                      color: "var(--ink)",
                      textDecoration: "underline",
                      textDecorationColor: `var(--color-riso-${u.tint})`,
                      textDecorationThickness: "2px",
                      textUnderlineOffset: "4px",
                    }}
                  >
                    {t(u.cta ?? "Open")}
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>

        {/* The differentiator gets its own beat. */}
        <section style={{ marginTop: "clamp(4rem, 10vw, 7rem)" }}>
          <p className="eyebrow">{t("What nobody else does")}</p>
          <h2
            className="h1" style={{ margin: ".6rem 0 1.5rem" }}
          >
            {t("Every brain sits an exam.")}</h2>

          <div
            style={{
              display: "grid",
              gap: "2rem",
              gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
              alignItems: "start",
            }}
          >
            <p style={{ fontSize: "1.0625rem", color: "var(--ink-2)", maxWidth: "44ch" }}>
              {markup(t("You write what the brain is <0>for</0>. mozg turns that into control questions and runs them after every upload. So you get a number you can trust — and a list of exactly which material is missing, instead of guessing why your agent still gives bad answers."), [
              <em key="s0" />,
            ])}</p>

            <div className="scorecard">
              <div className="score-head">
                <div>
                  <p className="eyebrow" style={{ marginBottom: ".35rem" }}>
                    {t("Brain · Design system")}</p>
                  <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>
                    {t("32 checks · 4 categories")}</span>
                </div>
                <div className="score-big">
                  84<sup>%</sup>
                </div>
              </div>

              <div className="score-row" data-state="pass">
                <span className="sig">✓</span>
                <span>{t("Colour, borders and elevation")}</span>
                <span className="count">12 / 12</span>
              </div>
              <div className="score-row" data-state="pass">
                <span className="sig">✓</span>
                <span>{t("Type scale and spacing")}</span>
                <span className="count">8 / 8</span>
              </div>
              <div className="score-row" data-state="partial">
                <span className="sig">▲</span>
                <span>
                  {markup(t("Motion and transitions <0>missing · no screen recordings yet</0>"), [
                  <span className="score-gap" key="s0" />,
                ])}</span>
                <span className="count">3 / 7</span>
              </div>
              <div className="score-row" data-state="fail">
                <span className="sig">✕</span>
                <span>
                  {markup(t("Empty and error states <0>missing · no source covers this</0>"), [
                  <span className="score-gap" key="s0" />,
                ])}</span>
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
            <p className="eyebrow">{t("One brain, every agent")}</p>
            <p style={{ marginTop: ".5rem", color: "var(--ink-2)" }}>
              {t("Claude learns it on Monday, Codex knows it on Tuesday. Built-in agent memory stays locked to one vendor; a brain does not.")}</p>
          </div>
          <div>
            <p className="eyebrow">{t("Agents write back")}</p>
            <p style={{ marginTop: ".5rem", color: "var(--ink-2)" }}>
              {t("An agent that works out a convention saves it. On a brain you only read it arrives as a proposal for its owner — pending, attributed, answering nobody until they take it. Contribution that cannot corrupt.")}</p>
          </div>
          <div>
            <p className="eyebrow">{t("Yours to take")}</p>
            <p style={{ marginTop: ".5rem", color: "var(--ink-2)" }}>
              {t("Export any brain as CLAUDE.md, a Claude Skill or AGENTS.md. It keeps working if you stop paying us.")}</p>
          </div>
        </section>

        <section style={{ marginTop: "clamp(4rem, 9vw, 6rem)" }}>
          <p className="eyebrow">{t("Why not just write a file")}</p>
          <h2 className="h1" style={{ margin: ".5rem 0 1.5rem" }}>
            {markup(t("Because of what <0/> happens next."), [
            <br key="s0" />,
          ])}</h2>
          <Divergence />
          <p className="lede" style={{ marginTop: "1.25rem" }}>
            {markup(t("A file is the same three months later. A brain has been re-read, corrected by the agents using it, and measured against what it claims to know. <0>The honest comparison, including when a file wins</0> ."), [
            <Link href="/vs" style={{ textDecoration: "underline" }} key="s0" />,
          ])}</p>
        </section>

        <section style={{ marginTop: "clamp(4rem, 9vw, 6rem)" }}>
          <p className="eyebrow">{t("The collective mind")}</p>
          <h2 className="h1" style={{ margin: ".5rem 0 1rem" }}>
            {markup(t("Every question anyone asks <0/> makes it smarter."), [
            <br key="s0" />,
          ])}</h2>
          <p className="lede" style={{ maxWidth: "58ch" }}>
            {markup(t("When any agent asks a brain something it can't answer, that question joins the brain's exam — and the next re-read chases it. Corrections arrive as reviewed, attributed notes. Every version is kept, with a score. The tenth user gets a better brain than the first. <0>How the loop works</0> ."), [
            <Link href="/collective" style={{ textDecoration: "underline" }} key="s0" />,
          ])}</p>

          {learning.length > 0 && (
            <div className="rows" style={{ marginTop: "1.5rem", maxWidth: "44rem" }}>
              {learning.map((l) => (
                <Link key={l.slug} className="row" href={`/b/${l.handle}/${l.slug}`}>
                  <span style={{ minWidth: 0 }}>
                    <strong>{l.title}</strong>
                    <span className="row-meta">{t("between its last two exam sittings")}</span>
                  </span>
                  <span className="row-side mono" style={{ color: "var(--color-riso-green)" }}>
                    {markup(t("+<0/> newly passed"), [
                    l.gained,
                  ])}</span>
                </Link>
              ))}
              <p className="mono" style={{ fontSize: ".6875rem", color: "var(--ink-3)", margin: 0, padding: ".5rem 1.25rem" }}>
                {t("live from the grader — these numbers change as the brains re-sit")}</p>
            </div>
          )}
        </section>

        {/* The lead magnet: the same knowledge, for the human. Free course,
            no card — the cheapest honest way in. */}
        <section
          style={{
            marginTop: "clamp(3rem, 8vw, 4.5rem)",
            border: "1.5px solid var(--ink)",
            background: "var(--paper-2)",
            padding: "clamp(1.25rem, 4vw, 2rem)",
            display: "flex",
            gap: "1.5rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {markup(t("Free course · learn<0>.</0>"), [
              <span style={{ color: "var(--color-riso-green)" }} key="s0" />,
            ])}</p>
            <h2 className="h2" style={{ margin: ".4rem 0 .5rem" }}>
              {t("Learn prompt engineering from the brain your agent uses.")}</h2>
            <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: "58ch" }}>
              {t("Anthropic's prompt-engineering material as a spaced-repetition course: read, recall, quiz — with the brain's own exam as the final. Free, no card, and your agent can query the same brain while you study it.")}</p>
          </div>
          <Link className="btn" href="https://learn.mozg.sh/mozg/prompt-engineering">
            {t("Start the course")}</Link>
        </section>

        {/* The second service, given the same shape as learn's block: the
            landing page had no idea the gallery existed, and a whole branch of
            the product was reachable only from a footer link. */}
        <section
          className="panel"
          style={{
            marginTop: "clamp(3rem, 7vw, 4.5rem)",
            display: "flex",
            gap: "1.5rem",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <div style={{ flex: 1, minWidth: 260 }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {markup(t("For artists · gallery<0>.</0>"), [
              <span style={{ color: "var(--color-riso-red)" }} key="s0" />,
            ])}</p>
            <h2 className="h2" style={{ margin: ".4rem 0 .5rem" }}>
              {t("Your style, licensed — not scraped.")}</h2>
            <p style={{ color: "var(--ink-2)", margin: 0, maxWidth: "58ch" }}>
              {markup(t("A style brain holds the way you work: palette with values, line weight, how shading is made, the hard nevers. Buyers' agents follow it over MCP, or they generate right in the gallery — and you are paid <0>on every image</0>, not once when a crawler passed through. Unlike a fine-tune on someone's disk, access can be revoked."), [
              <strong key="s0" />,
            ])}</p>
          </div>
          <Link className="btn" href="https://gallery.mozg.sh">
            {t("Open the gallery")}</Link>
        </section>

        {/* The whole pitch again, as 28 seconds of motion. Code-rendered
            (Remotion), so the type stays razor sharp; muted autoplay makes it
            a living poster, the controls carry the sound for whoever asks. */}
        <section style={{ marginTop: "clamp(4rem, 9vw, 6rem)" }}>
          <p className="eyebrow">{t("The whole idea · 28 seconds")}</p>
          <video
            autoPlay
            muted
            loop
            playsInline
            controls
            poster="/brand/intro-poster.jpg"
            style={{
              width: "100%",
              display: "block",
              marginTop: "1rem",
              border: "1.5px solid var(--ink)",
              boxShadow: "6px 6px 0 var(--ink)",
            }}
          >
            <source src="/brand/intro-720.mp4" type="video/mp4" />
          </video>
        </section>

        <div style={{ margin: "clamp(3rem, 8vw, 4.5rem) 0 2.5rem" }}>
          <Scribble />
        </div>

        {/* Where to go next, in the order someone actually needs it. */}
        <section>
          <p className="eyebrow">{t("Start here")}</p>
          <h2
            className="display"
            style={{ fontSize: "clamp(1.6rem, 4vw, 2.25rem)", margin: ".4rem 0 1.5rem" }}
          >
            {t("One guided path, then you're running.")}</h2>

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
              href="/start"
              step="00"
              title="Start here"
              blurb="The whole journey on one page: why this exists, connect an agent, prove it works, build your own — with the screens you'll see."
            />
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
                {t("In the catalogue now")}</h2>
              <Link className="mono" href="/explore" style={{ fontSize: ".8125rem" }}>
                {t("all brains →")}</Link>
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
                    {t(topicLabel(b.topic))} · {b.owner_handle}
                  </span>
                  <h3 className="card-title">{b.title}</h3>
                  <p className="card-goal">{b.goal ?? "No goal set."}</p>
                  <div className="card-foot">
                    <span style={{ opacity: 0.8 }}>
                      {markup(t("<0/> · <1/> notes"), [
                      b.price_cents ? formatCents(b.price_cents) : "Free",
                      b.note_count,
                    ])}</span>
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

        {/* Open source, in one strip: the three facts that make trying it
            a no-brainer. Money details live on /pricing for those who ask. */}
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
            ["Open source", "AGPL-3.0", "the whole product on GitHub — run it yourself with your own keys, everything works"],
            ["The catalogue", "free, all of it", "every official brain costs nothing: Next.js, Expo, Svelte 5, Stake Engine, the MCP spec"],
            ["Your own brains", "your key or ours", "train on your own API key for free, or let our cloud spend so you don't think about it"],
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
          <a
            href="https://github.com/egorfedorov/mozg"
            style={{
              background: "var(--paper-2)",
              padding: "1.25rem",
              display: "grid",
              alignContent: "center",
            }}
          >
            <span className="h3">{t("Star it on GitHub →")}</span>
            <span style={{ color: "var(--ink-2)", fontSize: ".875rem", marginTop: ".35rem" }}>
              {t("AGPL · self-host · contribute a catalogue pack")}</span>
          </a>
        </section>

        {/* Who is behind this, and what they think it is for. A landing page
            argues features; one person saying why they built it is the thing a
            feature list cannot do, and it belongs here rather than three clicks
            into the footer. */}
        <section className="lp-manifesto">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/about/portrait.webp"
            alt="Egor Fedorov"
            width={132}
            height={176}
            loading="lazy"
          />
          <div style={{ minWidth: 0 }}>
            <p className="eyebrow" style={{ margin: 0 }}>
              {t("The manifesto")}</p>
            <p className="lp-manifesto-quote">
              {t("Everything we know is being poured into one memory that belongs to nobody. I am building the opposite.")}</p>
            <p style={{ color: "var(--ink-2)", margin: ".6rem 0 1rem", maxWidth: "54ch" }}>
              {t("Why knowledge should keep its author, why a thing that claims to know should sit an exam, and what a language spoken by 450,000 people has to do with any of it.")}</p>
            <Link className="btn btn-ghost" href="/about">
              {t("Read it")}</Link>
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: ".9rem 0 0" }}>
              {t("Egor Fedorov · Uraanghay Saqa · Sakha Republic")}</p>
          </div>
        </section>

        {/* One clear way out of the page. */}
        <section
          className="panel"
          style={{
            marginTop: "clamp(2rem, 5vw, 3rem)",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
            borderWidth: "2px",
          }}
        >
          <div style={{ flex: "1 1 32ch" }}>
            <h2 className="h2" style={{ margin: 0 }}>
              {t("Stop explaining the same thing.")}</h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              {t("Open source, and the whole catalogue is free — connect your agents in a minute. Build your own on our inference, or bring your own API key and pay nobody.")}</p>
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
