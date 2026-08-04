import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query } from "@/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Beta — mozg",
  description:
    "mozg is in open beta: what that means, what already works, what is still rough, and how breaking it makes it better.",
};

/**
 * The page the beta badge points at. Honest in both directions: real numbers
 * about what works, a real list of what is rough, and a real ask — break it,
 * tell us, tell others. A beta page that only says "expect bugs" is a
 * disclaimer; this one is an invitation.
 */
export default async function BetaPage() {
  // Live numbers, not marketing copy — the same honesty the exam enforces.
  const [stats] = await query<{ brains: number; notes: number; calls: number }>(
    `select
       (select count(*)::int from brains where visibility = 'public') as brains,
       (select coalesce(sum(note_count), 0)::int from brains where visibility = 'public') as notes,
       (select count(*)::int from calls where created_at > now() - interval '7 days') as calls`,
  );

  return (
    <>
      <TopBar />
      <Contents active="/beta" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">Open beta</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", margin: ".5rem 0 1rem" }}>
          It works.
          <br />
          Now help us find where it doesn&apos;t.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          mozg is young and honest about it. The core loop — one link in, a
          trained and exam-scored brain out, connected to your agents over MCP —
          runs in production every day. The edges are still being sanded, and
          the fastest sandpaper is you hitting them.
        </p>

        {/* ── the honest state ──────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <div
            style={{
              display: "grid",
              gap: "1px",
              background: "var(--rule)",
              border: "1.5px solid var(--ink)",
              gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))",
            }}
          >
            <div style={{ background: "var(--paper-2)", padding: "1.5rem" }}>
              <p className="eyebrow" style={{ margin: 0, color: "var(--color-riso-green)" }}>
                Solid — used daily
              </p>
              <ul style={{ margin: ".75rem 0 0", paddingLeft: "1.1rem", color: "var(--ink-2)", fontSize: ".9375rem", display: "grid", gap: ".4rem" }}>
                <li>teach-from-one-link: GitHub, llms.txt, sitemap, link walk</li>
                <li>the exam: measured scores, majority-vote judging</li>
                <li>MCP for Claude Code, Codex, Cursor and friends</li>
                <li>marketplace with 5 free queries into any paid brain</li>
                <li>exports that outlive the subscription</li>
              </ul>
            </div>
            <div style={{ background: "var(--paper-2)", padding: "1.5rem" }}>
              <p className="eyebrow" style={{ margin: 0, color: "var(--color-riso-orange)" }}>
                Rough — known, being sanded
              </p>
              <ul style={{ margin: ".75rem 0 0", paddingLeft: "1.1rem", color: "var(--ink-2)", fontSize: ".9375rem", display: "grid", gap: ".4rem" }}>
                <li>card payments — crypto works, cards are mocked</li>
                <li>JS-only docs sites need their GitHub repo link</li>
                <li>exam scores move as young brains keep learning</li>
                <li>OAuth for MCP — today it is a bearer token</li>
              </ul>
            </div>
            <div style={{ background: "var(--paper-2)", padding: "1.5rem" }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                Right now
              </p>
              <ul className="mono" style={{ listStyle: "none", margin: ".75rem 0 0", padding: 0, fontSize: ".8125rem", color: "var(--ink-2)", display: "grid", gap: ".45rem" }}>
                <li>{stats.brains} public brains</li>
                <li>{stats.notes.toLocaleString()} notes inside them</li>
                <li>{stats.calls.toLocaleString()} agent calls this week</li>
                <li>uptime watched every 5 minutes</li>
                <li>backups in two places, restore-tested</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── the ask ───────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            Three ways to make this better
          </h2>

          <div className="rows">
            <div className="row">
              <span style={{ minWidth: 0 }}>
                <strong>Break it, then tell us.</strong>
                <span className="row-sub" style={{ maxWidth: "70ch" }}>
                  Feed it a docs site that confuses it. Ask a brain something it
                  scored well on and got wrong anyway. Find the button that does
                  nothing. Every report goes to a human the same day:{" "}
                  <a href="/chat" style={{ textDecoration: "underline" }}>chatmozg</a>{" "}
                  or{" "}
                  <a
                    href="https://github.com/egorfedorov/mozg-plugin/issues"
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ textDecoration: "underline" }}
                  >
                    GitHub issues
                  </a>
                  . A bug with steps to reproduce it is a gift — we answer it
                  like one.
                </span>
              </span>
            </div>
            <div className="row">
              <span style={{ minWidth: 0 }}>
                <strong>Tell one person who fights their agent&apos;s memory.</strong>
                <span className="row-sub" style={{ maxWidth: "70ch" }}>
                  You know exactly who — the one re-explaining their stack to a
                  model every morning. Send them a brain from the{" "}
                  <Link href="/explore" style={{ textDecoration: "underline" }}>
                    catalogue
                  </Link>
                  ; the free ones need no account to look at, and five real
                  queries into any paid one are free. Word of mouth is the whole
                  marketing department right now.
                </span>
              </span>
            </div>
            <div className="row">
              <span style={{ minWidth: 0 }}>
                <strong>Tell us what a brain should exist for.</strong>
                <span className="row-sub" style={{ maxWidth: "70ch" }}>
                  A doc site your agents keep misquoting, a spec you keep
                  re-pasting, a field with no good brain yet — name it and we
                  will likely build it within days. The best brains in the
                  catalogue started as one sentence in the chat.
                </span>
              </span>
            </div>
          </div>
        </section>

        {/* ── the thank-you ─────────────────────────────────────────────── */}
        <section
          className="panel"
          style={{
            marginTop: "clamp(2.5rem, 6vw, 4rem)",
            borderLeft: "4px solid var(--color-riso-red)",
          }}
        >
          <p className="eyebrow">Beta testers are remembered</p>
          <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0", maxWidth: "62ch" }}>
            Report a real bug or a real gap during the beta — one we act on —
            and your account gets a year of Pro, free, when plans go live. Not
            as a promo trick: the people who helped sand the edges shouldn&apos;t
            pay for the polished thing. Say so in{" "}
            <a href="/chat" style={{ textDecoration: "underline" }}>
              chatmozg
            </a>{" "}
            and it is noted the same day.
          </p>
        </section>

        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "2rem" }}>
          <Link className="btn" href="/brains">
            Try it — teach a brain from one link
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            Browse the catalogue
          </Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
