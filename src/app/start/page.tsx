import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { SketchDefs, Pipeline } from "@/components/Sketch";

export const metadata = {
  title: "Start here — mozg, from zero to a thinking agent",
  description:
    "The whole path, step by step: what mozg is and why it exists, connecting your first brain to Claude Code / Codex / Cursor, proving it works, and building a brain of your own from one link.",
};

/**
 * The onboarding walk. One page that takes a stranger from "what is this"
 * to an agent that answers from a measured brain — every step shows the
 * actual interface it talks about, drawn in the house style rather than
 * pasted as screenshots, so it never rots when a page changes.
 */

function Step({
  n,
  title,
  why,
  children,
}: {
  n: string;
  title: string;
  why: string;
  children: React.ReactNode;
}) {
  return (
    <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", display: "flex", gap: "1.25rem" }}>
      <div
        aria-hidden
        style={{
          flexShrink: 0,
          width: 44,
          height: 44,
          border: "2px solid var(--ink)",
          background: "var(--color-riso-red)",
          color: "var(--paper)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontWeight: 800,
          fontSize: "1.1rem",
          boxShadow: "3px 3px 0 var(--ink)",
        }}
      >
        {n}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2 className="h2" style={{ margin: "0 0 .35rem" }}>{title}</h2>
        <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", margin: "0 0 1rem" }}>
          why: {why}
        </p>
        {children}
      </div>
    </section>
  );
}

function Term({ lines }: { lines: React.ReactNode[] }) {
  return (
    <div className="term" style={{ marginTop: ".75rem" }}>
      <div className="term-bar">
        <span className="term-dot" />
        <span className="term-dot" />
        <span className="term-dot" />
        <span style={{ marginLeft: ".5rem" }}>terminal</span>
      </div>
      {lines.map((l, i) => (
        <div key={i}>{l}</div>
      ))}
    </div>
  );
}

export default function StartPage() {
  return (
    <>
      <SketchDefs />
      <TopBar />
      <Contents active="/start" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">Start here · ~10 minutes to a thinking agent</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}>
          From zero to an agent
          <br />
          that actually knows.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          This page is the whole journey: what mozg is and why it exists, then
          every step — take a brain, connect your agent, prove it works, build
          your own. Each step shows the screen you&apos;ll be looking at.
        </p>

        {/* ── the why, before any buttons ─────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow">First, the problem</p>
          <h2 className="h1" style={{ margin: ".5rem 0 1rem" }}>
            Your agent answers from memory.
            <br />
            Memory has a date on it.
          </h2>
          <p className="lede" style={{ maxWidth: "62ch" }}>
            Models are trained months ago; your stack moved last week. So the
            agent answers about the old version — with the same confidence
            either way. The usual fix is pasting docs into context files,
            which are expensive (you pay for every word, every session), rot
            silently, and can&apos;t tell you what they actually cover.
          </p>
          <p className="lede" style={{ maxWidth: "62ch" }}>
            mozg does three things differently: knowledge lives in a{" "}
            <strong>brain</strong> the agent searches over MCP (only the notes
            a task needs enter the context), every brain{" "}
            <strong>sits an exam</strong> so &ldquo;trained 92%&rdquo; is a
            measured fact with the failures listed, and brains{" "}
            <strong>learn from use</strong> — a question nobody could answer
            becomes an exam question automatically.
          </p>
          <div style={{ marginTop: "1.5rem" }}>
            <Pipeline />
          </div>
        </section>

        <Step n="1" title="Make an account" why="the free tier is real: read the catalogue, connect agents, one trial brain — no card.">
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch" }}>
            <Link href="/sign-in" style={{ textDecoration: "underline" }}>mozg.sh/sign-in</Link>{" "}
            — email, Google or GitHub. You land in your workspace: a left rail
            with your brains, balance and tokens.
          </p>
        </Step>

        <Step n="2" title="Take a brain from the catalogue" why="someone already built and examined the brain for your stack — starting from a proven one beats building blind.">
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch" }}>
            Open the{" "}
            <Link href="/explore" style={{ textDecoration: "underline" }}>catalogue</Link>{" "}
            and pick your stack — Next.js App Router, Expo, Svelte 5, Tailwind
            v4, the MCP spec. Every card shows the same three honest numbers:
          </p>
          <div style={{ marginTop: ".75rem", border: "1.5px solid var(--ink)", background: "var(--paper-2)", maxWidth: 460, padding: "1rem 1.25rem", boxShadow: "4px 4px 0 var(--ink)" }}>
            <p className="eyebrow" style={{ margin: 0 }}>web · mozg</p>
            <p style={{ fontWeight: 800, fontSize: "1.2rem", margin: ".25rem 0" }}>Next.js App Router</p>
            <p className="mono" style={{ fontSize: ".8125rem", margin: 0 }}>
              <span style={{ color: "var(--color-riso-green)" }}>trained 84%</span>
              {" · 1,213 notes · free"}
            </p>
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: ".5rem 0 0" }}>
              still learning: middleware edge cases · turbopack config
            </p>
          </div>
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginTop: ".75rem" }}>
            That <strong>&ldquo;still learning&rdquo;</strong> line is the point of the whole
            product: the brain tells you where <em>not</em> to trust it before
            you ask. Hit <strong>Add to my brains</strong> — free ones join your shelf
            instantly, families arrive whole.
          </p>
        </Step>

        <Step n="3" title="Connect your agent" why="one command; after it, every agent session can search your shelf without you pasting anything.">
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch" }}>
            Grab a token at{" "}
            <Link href="/settings/tokens" style={{ textDecoration: "underline" }}>settings → tokens</Link>,
            then in your terminal:
          </p>
          <Term
            lines={[
              <span key="1"><span className="c">$</span> claude mcp add --transport http mozg https://mozg.sh/mcp \</span>,
              <span key="2">{"    "}--header &quot;Authorization: Bearer mzg_your_token&quot;</span>,
              <span key="3" className="t">✓ connected · 4 brains available</span>,
            ]}
          />
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginTop: ".75rem" }}>
            Codex, Cursor, Cline, Kimi, Qwen, VS Code — exact copy-paste for
            each lives on{" "}
            <Link href="/connect" style={{ textDecoration: "underline" }}>/connect</Link>.
            Claude Code users can install the plugin instead — it also nudges
            the agent to check the brain before answering.
          </p>
        </Step>

        <Step n="4" title="Prove it works" why="never trust wiring you haven't seen carry current.">
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch" }}>
            Ask your agent something spec-level from the brain you added:
          </p>
          <Term
            lines={[
              <span key="1"><span className="u">&gt;</span> what does a route handler have to export for streaming?</span>,
              <span key="2" style={{ height: ".6rem", display: "block" }} />,
              <span key="3" className="k">  brain_search(brain: &quot;mozg/nextjs&quot;, query: &quot;route handler streaming&quot;)</span>,
              <span key="4" className="c">  → 4 notes · 96 ms</span>,
              <span key="5" style={{ height: ".6rem", display: "block" }} />,
              <span key="6">  Export an async GET returning a Response with a ReadableStream…</span>,
            ]}
          />
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginTop: ".75rem" }}>
            The tell: the agent <em>cites the brain</em> instead of reciting.
            Searching costs zero context tokens — retrieval runs on our side,
            only the notes it picked enter your session.
          </p>
        </Step>

        <Step n="5" title="Build your own — from one link" why="your project's real knowledge isn't in any public doc; the trial brain shows the whole loop before you pay anything.">
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch" }}>
            <Link href="/brains/new" style={{ textDecoration: "underline" }}>New brain</Link>{" "}
            → paste one documentation URL. The crawler finds every page
            (GitHub repo, llms.txt, sitemap, or a link walk), reads them into
            searchable notes, drafts a goal — and then the important part
            happens:
          </p>
          <div style={{ marginTop: ".75rem", border: "1.5px solid var(--ink)", background: "var(--paper-2)", maxWidth: 460, padding: "1rem 1.25rem" }}>
            <p className="eyebrow" style={{ margin: "0 0 .5rem" }}>exam · sat automatically</p>
            <p className="mono" style={{ fontSize: ".9375rem", margin: 0 }}>
              <span style={{ color: "var(--color-riso-green)" }}>✓ 19 passed</span>
              {"  ·  "}
              <span style={{ color: "var(--color-riso-red)" }}>✕ 7 failed</span>
              {"  ·  trained 73%"}
            </p>
            <div style={{ height: 8, border: "1px solid var(--ink)", background: "var(--paper)", margin: ".6rem 0" }}>
              <div style={{ height: "100%", width: "73%", background: "var(--color-riso-green)" }} />
            </div>
            <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", margin: 0 }}>
              failed: webhook retry order · rate limit headers · sandbox auth…
            </p>
          </div>
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginTop: ".75rem" }}>
            The failures are not a bug report — they are a shopping list. Feed
            those topics (more pages, a PDF, or just tell the brain in the
            teach flow) and re-sit. Free accounts get one trial brain, 30
            pages, one exam sitting — the full loop, honestly sized. Your
            brain is <strong>private</strong>: only you and your agents can
            reach it, unless you ask for the catalogue (that goes through
            review).
          </p>
        </Step>

        <Step n="6" title="Let it get smarter — and learn it yourself" why="a brain is not a file: it improves from use, and you can study the same material your agent queries.">
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch" }}>
            From here everything is automatic: searches that find nothing
            become exam questions, corrections your agents file arrive for
            your review, re-reads keep sources current, and{" "}
            <Link href="/mind" style={{ textDecoration: "underline" }}>/mind</Link>{" "}
            shows everything your agents can know on one screen. And the same
            notes double as a human course —{" "}
            <a href="https://learn.mozg.sh" style={{ textDecoration: "underline" }}>learn.mozg.sh</a>:
            read, recall, quiz, streaks, a certificate at 80%, and a scoreboard
            against your own agent&apos;s exam score.
          </p>
        </Step>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/sign-in">Start — step 1</Link>
          <Link className="btn btn-ghost" href="/explore">Browse the catalogue first</Link>
          <Link className="btn btn-ghost" href="/guide">The long guide, when you want depth</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
