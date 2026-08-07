import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
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
  const t = await translator();

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
        <p className="eyebrow">{t("Open beta")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6vw, 3.5rem)", margin: ".5rem 0 1rem" }}>
          {markup(t("It works. <0/> Now help us find where it doesn't."), [
          <br key="s0" />,
        ])}</h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          {t("mozg is young and honest about it. The core loop — one link in, a trained and exam-scored brain out, connected to your agents over MCP — runs in production every day. The edges are still being sanded, and the fastest sandpaper is you hitting them.")}</p>

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
                {t("Solid — used daily")}</p>
              <ul style={{ margin: ".75rem 0 0", paddingLeft: "1.1rem", color: "var(--ink-2)", fontSize: ".9375rem", display: "grid", gap: ".4rem" }}>
                <li>{t("teach-from-one-link: GitHub, llms.txt, sitemap, link walk")}</li>
                <li>{t("the exam: measured scores, majority-vote judging")}</li>
                <li>{t("MCP for Claude Code, Codex, Cursor and friends")}</li>
                <li>{t("marketplace with 5 free queries into any paid brain")}</li>
                <li>{t("exports that outlive the subscription")}</li>
              </ul>
            </div>
            <div style={{ background: "var(--paper-2)", padding: "1.5rem" }}>
              <p className="eyebrow" style={{ margin: 0, color: "var(--color-riso-orange)" }}>
                {t("Rough — known, being sanded")}</p>
              <ul style={{ margin: ".75rem 0 0", paddingLeft: "1.1rem", color: "var(--ink-2)", fontSize: ".9375rem", display: "grid", gap: ".4rem" }}>
                <li>{t("card payments — crypto works, cards are mocked")}</li>
                <li>{t("JS-only docs sites need their GitHub repo link")}</li>
                <li>{t("exam scores move as young brains keep learning")}</li>
                <li>{t("OAuth for MCP — today it is a bearer token")}</li>
              </ul>
            </div>
            <div style={{ background: "var(--paper-2)", padding: "1.5rem" }}>
              <p className="eyebrow" style={{ margin: 0 }}>
                {t("Right now")}</p>
              <ul className="mono" style={{ listStyle: "none", margin: ".75rem 0 0", padding: 0, fontSize: ".8125rem", color: "var(--ink-2)", display: "grid", gap: ".45rem" }}>
                <li>{markup(t("<0/> public brains"), [
                  stats.brains,
                ])}</li>
                <li>{markup(t("<0/> notes inside them"), [
                  stats.notes.toLocaleString(),
                ])}</li>
                <li>{markup(t("<0/> agent calls this week"), [
                  stats.calls.toLocaleString(),
                ])}</li>
                <li>{t("uptime watched every 5 minutes")}</li>
                <li>{t("backups in two places, restore-tested")}</li>
              </ul>
            </div>
          </div>
        </section>

        {/* ── the ask ───────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(2.5rem, 6vw, 4rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            {t("Three ways to make this better")}</h2>

          <div className="rows">
            <div className="row">
              <span style={{ minWidth: 0 }}>
                <strong>{t("Break it, then tell us.")}</strong>
                <span className="row-sub" style={{ maxWidth: "70ch" }}>
                  {markup(t("Feed it a docs site that confuses it. Ask a brain something it scored well on and got wrong anyway. Find the button that does nothing. Every report goes to a human the same day: <0>chatmozg</0> or <1>GitHub issues</1> . A bug with steps to reproduce it is a gift — we answer it like one."), [
                  <a href="/chat" style={{ textDecoration: "underline" }} key="s0" />,
                  <a href="https://github.com/egorfedorov/mozg-plugin/issues"
                    target="_blank"
                    rel="noreferrer noopener"
                    style={{ textDecoration: "underline" }} key="s1" />,
                ])}</span>
              </span>
            </div>
            <div className="row">
              <span style={{ minWidth: 0 }}>
                <strong>{t("Tell one person who fights their agent's memory.")}</strong>
                <span className="row-sub" style={{ maxWidth: "70ch" }}>
                  {markup(t("You know exactly who — the one re-explaining their stack to a model every morning. Send them a brain from the <0>catalogue</0> ; the free ones need no account to look at, and five real queries into any paid one are free. Word of mouth is the whole marketing department right now."), [
                  <Link href="/explore" style={{ textDecoration: "underline" }} key="s0" />,
                ])}</span>
              </span>
            </div>
            <div className="row">
              <span style={{ minWidth: 0 }}>
                <strong>{t("Tell us what a brain should exist for.")}</strong>
                <span className="row-sub" style={{ maxWidth: "70ch" }}>
                  {t("A doc site your agents keep misquoting, a spec you keep re-pasting, a field with no good brain yet — name it and we will likely build it within days. The best brains in the catalogue started as one sentence in the chat.")}</span>
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
          <p className="eyebrow">{t("Beta testers are remembered")}</p>
          <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0", maxWidth: "62ch" }}>
            {markup(t("Report a real bug or a real gap during the beta — one we act on — and your account gets a year of Pro, free, when plans go live. Not as a promo trick: the people who helped sand the edges shouldn't pay for the polished thing. Say so in <0>chatmozg</0> and it is noted the same day."), [
            <a href="/chat" style={{ textDecoration: "underline" }} key="s0" />,
          ])}</p>
        </section>

        <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "2rem" }}>
          <Link className="btn" href="/brains">
            {t("Try it — teach a brain from one link")}</Link>
          <Link className="btn btn-ghost" href="/explore">
            {t("Browse the catalogue")}</Link>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
