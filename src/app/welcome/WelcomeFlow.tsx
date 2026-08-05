"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

/**
 * The onboarding, as three staged screens instead of one long page:
 * video → what-it-is → your first steps. Skippable at every stage, because
 * an onboarding you cannot leave is a hostage situation. Being here at all
 * plants the cookie that stops /brains sending anyone back.
 */

export interface StepState {
  n: string;
  title: string;
  body: string;
  href: string;
  ctaLabel: string;
  done: boolean;
}

const DOT = { width: 10, height: 10, border: "1.5px solid var(--ink)" } as const;

export default function WelcomeFlow({
  signedIn,
  steps,
}: {
  signedIn: boolean;
  steps: StepState[];
}) {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    // Seen once is seen: /brains stops redirecting here.
    document.cookie = "mozg-welcomed=1; path=/; max-age=31536000";
  }, []);

  const doneCount = steps.filter((s) => s.done).length;
  const next = () => setStage((s) => Math.min(s + 1, 2));

  return (
    <div style={{ maxWidth: "56rem", margin: "0 auto", padding: "clamp(1rem, 4vw, 2.5rem)" }}>
      <header style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "2rem" }}>
        <Link href="/" className="wordmark" style={{ fontSize: "1.25rem" }}>
          mozg<span>.</span>
        </Link>
        <div style={{ display: "flex", gap: ".45rem", alignItems: "center" }}>
          {[0, 1, 2].map((i) => (
            <button
              key={i}
              aria-label={`Step ${i + 1}`}
              onClick={() => setStage(i)}
              style={{ ...DOT, background: i <= stage ? "var(--ink)" : "var(--paper)", cursor: "pointer", padding: 0 }}
            />
          ))}
        </div>
        <Link className="mono linkish" style={{ fontSize: ".8125rem", color: "var(--ink-3)" }} href={signedIn ? "/brains" : "/"}>
          skip all →
        </Link>
      </header>

      {stage === 0 && (
        <section>
          <p className="eyebrow">Welcome · 28 seconds</p>
          <h1 className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".5rem 0 1.25rem" }}>
            The whole idea, first.
          </h1>
          <video
            autoPlay
            muted
            playsInline
            controls
            poster="/brand/intro-poster.jpg"
            onEnded={next}
            style={{ width: "100%", display: "block", border: "1.5px solid var(--ink)", boxShadow: "6px 6px 0 var(--ink)" }}
          >
            <source src="/brand/intro-720.mp4" type="video/mp4" />
          </video>
          <div style={{ display: "flex", gap: ".75rem", marginTop: "1.25rem", alignItems: "center" }}>
            <button className="btn" onClick={next}>
              Continue →
            </button>
            <button className="btn btn-ghost" onClick={next}>
              Skip the video
            </button>
          </div>
        </section>
      )}

      {stage === 1 && (
        <section>
          <p className="eyebrow">What this is</p>
          <h1 className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".5rem 0 1rem" }}>
            Teach it once.
            <br />
            Every agent knows.
          </h1>
          <p className="lede" style={{ maxWidth: "58ch" }}>
            mozg turns what you know — docs, screenshots, hard-won conventions
            — into a <strong>brain</strong>: a searchable knowledge base every
            AI agent you use reads over MCP.
          </p>
          <ul style={{ margin: "1.25rem 0 0", paddingLeft: "1.1rem", color: "var(--ink-2)", display: "grid", gap: ".6rem", maxWidth: "58ch", lineHeight: 1.55 }}>
            <li>
              <strong style={{ color: "var(--ink)" }}>Graded, not claimed</strong> — every brain sits an
              exam on itself; the score you see comes from the grader.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>One brain, every agent</strong> — Claude Code, Codex,
              Cursor: teach here, all of them know.
            </li>
            <li>
              <strong style={{ color: "var(--ink)" }}>It learns from use</strong> — unanswered questions
              join its exam, corrections come back as notes.
            </li>
          </ul>
          <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem" }}>
            <button className="btn" onClick={next}>
              Got it — my first steps →
            </button>
          </div>
        </section>
      )}

      {stage === 2 && (
        <section>
          <p className="eyebrow">
            {signedIn ? `${doneCount} of ${steps.length} done — live, they tick themselves` : "four steps, no card"}
          </p>
          <h1 className="display" style={{ fontSize: "clamp(1.8rem, 5vw, 3rem)", margin: ".5rem 0 1.25rem" }}>
            Your first ten minutes.
          </h1>
          <div className="rows">
            {steps.map((s) => (
              <div key={s.n} className="row">
                <span style={{ minWidth: 0 }}>
                  <strong>
                    <span className="mono" style={{ color: s.done ? "var(--color-riso-green)" : "var(--color-riso-red)", marginRight: ".6rem" }}>
                      {s.done ? "✓" : s.n}
                    </span>
                    {s.title}
                  </strong>
                  <span className="row-sub">{s.body}</span>
                </span>
                <span className="row-side">
                  {s.done ? (
                    <span className="mono" style={{ fontSize: ".75rem", color: "var(--color-riso-green)" }}>
                      done
                    </span>
                  ) : (
                    <Link className="btn btn-ghost" style={{ padding: ".4rem .8rem" }} href={signedIn ? s.href : "/sign-in?next=/welcome"}>
                      {signedIn ? s.ctaLabel : "Sign in"}
                    </Link>
                  )}
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: "flex", gap: ".75rem", marginTop: "1.5rem", flexWrap: "wrap" }}>
            {signedIn ? (
              <Link className="btn" href={steps.find((s) => !s.done)?.href ?? "/brains"}>
                {doneCount === steps.length ? "To your brains →" : "Start with the first open step →"}
              </Link>
            ) : (
              <Link className="btn" href="/sign-in?next=/welcome">
                Start free — no card
              </Link>
            )}
            <Link className="btn btn-ghost" href="/start">
              Prefer the written path (~10 min)
            </Link>
          </div>
        </section>
      )}
    </div>
  );
}
