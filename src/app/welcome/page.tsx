import Link from "next/link";
import TopBar from "@/components/TopBar";
import Contents from "@/components/Contents";
import SiteFooter from "@/components/SiteFooter";
import { SketchDefs, Pipeline } from "@/components/Sketch";
import { currentUser } from "@/lib/session";
import { query } from "@/db";

export const dynamic = "force-dynamic";
export const metadata = {
  title: "Welcome — mozg in one minute",
  description:
    "What mozg is, how a brain learns, and your first four steps — with live checkmarks.",
};

/**
 * The onboarding page: the whole service in one screen, for someone with
 * zero context. Four plain sentences, one drawing, and a checklist whose
 * boxes tick themselves as the real account does the real things — progress
 * you can see beats a tour you have to sit through.
 */

const STEPS: {
  n: string;
  title: string;
  body: string;
  cta: { href: string; label: string };
  /** Which live stat proves this step done. */
  key: "brains" | "sources" | "tokens" | "calls";
}[] = [
  {
    n: "01",
    title: "Make a brain",
    body: "A brain is a container for one subject — your product, your stack, your rules. Empty at birth, like all of us.",
    cta: { href: "/brains/new", label: "New brain" },
    key: "brains",
  },
  {
    n: "02",
    title: "Feed it something you know",
    body: "Paste a docs link, drop screenshots or files. mozg reads them and distills notes — then sits an exam on itself, so the score is graded, not claimed.",
    cta: { href: "/brains", label: "Add a source" },
    key: "sources",
  },
  {
    n: "03",
    title: "Connect your agent, once",
    body: "One command in your CLI (Claude Code, Codex, Cursor — anything that speaks MCP). A token is the only setup there is.",
    cta: { href: "/connect", label: "Connect an agent" },
    key: "tokens",
  },
  {
    n: "04",
    title: "Ask — and watch it learn",
    body: "Every agent you have now answers from the same brain. Questions it can't answer join its exam; corrections come back as notes. It gets smarter from use.",
    cta: { href: "/mind", label: "Your mind" },
    key: "calls",
  },
];

export default async function WelcomePage() {
  const user = await currentUser();

  const done = user
    ? await query<{ brains: number; sources: number; tokens: number; calls: number }>(
        `select
           (select count(*)::int from brains where owner_id = $1) as brains,
           (select count(*)::int from sources s join brains b on b.id = s.brain_id
             where b.owner_id = $1) as sources,
           (select count(*)::int from mcp_tokens
             where user_id = $1 and revoked_at is null) as tokens,
           (select count(*)::int from calls where caller_id = $1) as calls`,
        [user.id],
      ).then((r) => r[0])
    : null;

  const ticked = (key: (typeof STEPS)[number]["key"]) => Boolean(done && done[key] > 0);
  const doneCount = STEPS.filter((s) => ticked(s.key)).length;

  return (
    <>
      <TopBar />
      <Contents active="/welcome" />
      <SketchDefs />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">Welcome · the whole thing in one minute</p>
        <h1 className="display" style={{ fontSize: "clamp(2.2rem, 6vw, 4rem)", margin: ".5rem 0 1rem" }}>
          Teach it once.
          <br />
          Every agent knows.
        </h1>
        <p className="lede" style={{ maxWidth: "60ch" }}>
          mozg turns what you know — docs, screenshots, hard-won conventions —
          into a <strong>brain</strong>: a searchable, exam-scored knowledge
          base every AI agent you use reads over MCP. Teach it here, and
          Claude Code, Codex and Cursor all know it. Forever, and it keeps
          getting smarter.
        </p>

        {/* 28 seconds, code-rendered (Remotion) so the type stays razor sharp.
            Muted + loop like a living poster; controls for whoever wants them. */}
        <video
          controls
          muted
          playsInline
          preload="metadata"
          poster="/brand/intro-poster.jpg"
          style={{
            width: "100%",
            maxWidth: "56rem",
            display: "block",
            margin: "2.5rem 0",
            border: "1.5px solid var(--ink)",
            boxShadow: "6px 6px 0 var(--ink)",
          }}
        >
          <source src="/brand/intro-720.mp4" type="video/mp4" />
        </video>

        <div style={{ margin: "2.5rem 0" }}>
          <Pipeline />
        </div>

        <section style={{ marginTop: "3rem" }}>
          <div className="section-head">
            <h2 className="h2">Your first ten minutes</h2>
            <span className="eyebrow">
              {user ? `${doneCount} of ${STEPS.length} done — live` : "four steps, no card"}
            </span>
          </div>

          <div className="rows" style={{ maxWidth: "52rem" }}>
            {STEPS.map((s) => {
              const isDone = ticked(s.key);
              return (
                <div key={s.n} className="row" data-tint={isDone ? "green" : undefined}>
                  <span style={{ minWidth: 0 }}>
                    <strong>
                      <span className="mono" style={{ color: isDone ? "var(--color-riso-green)" : "var(--color-riso-red)", marginRight: ".6rem" }}>
                        {isDone ? "✓" : s.n}
                      </span>
                      {s.title}
                    </strong>
                    <span className="row-sub">{s.body}</span>
                  </span>
                  <span className="row-side">
                    {isDone ? (
                      <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-green)" }}>
                        done
                      </span>
                    ) : (
                      <Link className="btn btn-ghost" style={{ padding: ".4rem .8rem" }} href={user ? s.cta.href : "/sign-in?next=/welcome"}>
                        {user ? s.cta.label : "Sign in"}
                      </Link>
                    )}
                  </span>
                </div>
              );
            })}
          </div>

          {user && doneCount === STEPS.length && (
            <p className="lede" style={{ marginTop: "1rem" }}>
              All four — you are running. The shelf of what you have earned is
              at{" "}
              <Link href="/achievements" style={{ textDecoration: "underline" }}>
                /achievements
              </Link>
              .
            </p>
          )}
        </section>

        <section style={{ marginTop: "3.5rem", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          {!user && (
            <Link className="btn" href="/sign-in?next=/welcome">
              Start free — no card
            </Link>
          )}
          <Link className="btn btn-ghost" href="/start">
            The guided path (~10 min)
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            Or take a ready brain from the catalogue
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
