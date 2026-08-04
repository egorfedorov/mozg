import Link from "next/link";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";

export const metadata = {
  title: "Skills vs a brain — mozg",
  description:
    "A skill is a file your agent reads. A brain is knowledge that is searched, measured, refreshed and corrected. The long, honest comparison — including where skills win.",
};

/**
 * The long read. Its credibility rests on one true story: we shipped slot
 * games on a folder of fifty skills, moved the knowledge into brains, and
 * archived sixteen of our own. Every claim below survived that migration.
 * And it stays honest about the losing case — skills with scripts are tools,
 * and a brain does not replace a tool.
 */
export default function VsSkillsPage() {
  return (
    <>
      <TopBar />
      <Contents active="/vs-skills" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">Skills vs a brain</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}>
          We had fifty skills.
          <br />
          We archived sixteen of them.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          Our own studio ships slot games with AI agents, and for a year the
          know-how lived in a folder of Claude Code skills. This page is what we
          learned moving it into brains — including the part where skills win.
        </p>

        {/* ── the context problem, drawn ────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            1. A skill is eaten whole. A brain is sipped.
          </h2>
          <svg viewBox="0 0 720 200" style={{ width: "100%", maxWidth: 720, display: "block", border: "1.5px solid var(--ink)", background: "var(--paper-2)" }} aria-label="A skill dumps its whole file into context; a brain returns three notes">
            {/* left: skill dump */}
            <rect x="30" y="30" width="120" height="140" fill="none" stroke="#14161a" strokeWidth="2" />
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={i} x1="42" y1={46 + i * 14} x2="138" y2={46 + i * 14} stroke="#14161a" strokeWidth="2" opacity="0.35" />
            ))}
            <path d="M 160 100 L 240 100" stroke="#f15060" strokeWidth="3" markerEnd="url(#a1)" />
            <rect x="250" y="20" width="90" height="160" fill="#f15060" opacity="0.18" stroke="#f15060" strokeWidth="2" />
            <text x="295" y="105" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#14161a">context</text>
            <text x="90" y="190" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">SKILL.md — all of it, every session</text>
            {/* right: brain sip */}
            <circle cx="470" cy="100" r="46" fill="#f15060" />
            <circle cx="478" cy="92" r="46" fill="#14161a" opacity="0.12" />
            <path d="M 525 100 L 600 100" stroke="#3ec300" strokeWidth="3" />
            <rect x="610" y="70" width="80" height="16" fill="none" stroke="#14161a" strokeWidth="1.5" />
            <rect x="610" y="92" width="80" height="16" fill="none" stroke="#14161a" strokeWidth="1.5" />
            <rect x="610" y="114" width="80" height="16" fill="none" stroke="#14161a" strokeWidth="1.5" />
            <text x="470" y="190" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">brain — the 3 notes the task needed</text>
            <defs>
              <marker id="a1" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#f15060" />
              </marker>
            </defs>
          </svg>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: "1rem" }}>
            A skill loads front-to-back into the context window whether today&apos;s
            task needs one line of it or none. Our fifty-skill folder was ~1.7&nbsp;MB;
            agents paid for the relevant slice <em>and</em> everything around it,
            every single session. A brain is searched: the agent asks a question,
            gets the three notes that answer it, and the other seven hundred cost
            nothing. Same knowledge, a fraction of the tokens — and it scales past
            the point where a skill folder physically cannot.
          </p>
        </section>

        {/* ── the decay problem ─────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            2. A skill rots politely. A brain complains.
          </h2>
          <svg viewBox="0 0 720 170" style={{ width: "100%", maxWidth: 720, display: "block", border: "1.5px solid var(--ink)", background: "var(--paper-2)" }} aria-label="A skill's line stays flat while docs change; a brain re-reads and re-examines">
            <path d="M 40 60 L 320 60" stroke="#14161a" strokeWidth="2" strokeDasharray="6 5" />
            <text x="180" y="45" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">skill: same bytes, month after month</text>
            <path d="M 40 130 C 120 128, 140 100, 200 104 C 260 108, 280 80, 340 78" stroke="#3ec300" strokeWidth="3" fill="none" />
            <text x="180" y="160" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">brain: re-read, re-examined, corrected</text>
            <g>
              <rect x="420" y="30" width="260" height="110" fill="none" stroke="#14161a" strokeWidth="2" />
              <text x="550" y="55" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#14161a">docs changed on Tuesday</text>
              <text x="550" y="80" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#f15060">skill: nobody noticed</text>
              <text x="550" y="105" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#3ec300">brain: re-read it Tuesday night,</text>
              <text x="550" y="122" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#3ec300">re-sat its exam, score moved</text>
            </g>
          </svg>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: "1rem" }}>
            The platform we build slot games on rewrote part of its docs; our
            skills kept teaching agents the old shapes for weeks, confidently.
            Nothing in a file tells you it went stale. A brain re-reads its
            sources on a schedule, supersedes what changed, re-sits an exam
            generated from its goal — and agents using it mid-task can flag a
            note the moment reality disagrees. A skill decays silently; a brain
            files a complaint.
          </p>
        </section>

        {/* ── the measurement problem ───────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            3. Nobody knows what a skill knows.
          </h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
            Ask &quot;does our skill folder cover bet-replay error codes?&quot; and the
            honest answer is a shrug and a grep. A brain answers with a number:
            it sits an exam built from its stated goal, and the failures name
            exactly which material is missing. When we moved our RGS knowledge
            into a brain, the exam immediately exposed gaps our skills had been
            silently papering over — questions agents had surely been improvising
            answers to for months.
          </p>
          <div className="scorecard" style={{ maxWidth: 480, marginTop: "1.25rem" }}>
            <div className="score-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: ".35rem" }}>skill folder</p>
                <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>coverage</span>
              </div>
              <div className="score-big">?<sup>%</sup></div>
            </div>
            <div className="score-head" style={{ borderTop: "1.5px solid var(--ink)" }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: ".35rem" }}>the same knowledge, as a brain</p>
                <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>measured, re-sat after every change</span>
              </div>
              <div className="score-big">72<sup>%</sup></div>
            </div>
          </div>
        </section>

        {/* ── sharing ───────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: "1rem" }}>
            4. A skill is copied. A brain is connected.
          </h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
            Hand a teammate a skill and you have forked it: their copy and yours
            drift from that day on, and a fix lands in one of them. A brain is
            one URL — everyone&apos;s agents read the same living thing, corrections
            reach every reader the moment they are approved, and it works in
            Claude Code, Codex, Cursor and whatever ships next month, because
            MCP is the plug. Skills are also unsellable; a brain has a
            storefront, an exam score on the door, and five free queries for
            any buyer&apos;s agent to taste it.
          </p>
        </section>

        {/* ── the honest part ───────────────────────────────────────────── */}
        <section
          className="panel"
          style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", borderLeft: "4px solid var(--color-riso-orange)" }}
        >
          <p className="eyebrow">Where skills win — and we kept ours</p>
          <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0", maxWidth: "62ch" }}>
            A skill that <em>runs things</em> — shell scripts, publish gates,
            asset pipelines — is a tool, and a brain does not replace tools. We
            archived our sixteen knowledge-only skills and kept every one that
            executes. The honest rule: <strong>procedures with code stay
            skills; knowledge becomes a brain.</strong> If your skill is mostly
            prose about how something works, it is a brain wearing the wrong
            container.
          </p>
        </section>

        {/* ── the table ─────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <div className="rows">
            {[
              ["Cost per session", "whole file in context, every time", "three notes, only when asked"],
              ["When docs change", "silently wrong", "re-read, re-examined, score moves"],
              ["Coverage", "unknowable", "a number, with the gaps named"],
              ["Corrections", "edit a file, redistribute", "approved once, live for every reader"],
              ["Team", "copies that drift", "one URL, one truth"],
              ["Selling it", "not a thing", "storefront, exam score, 95% to you"],
              ["Running scripts", "✓ skills win", "not a brain's job — keep the skill"],
            ].map(([what, skill, brain]) => (
              <div key={what} className="row">
                <span style={{ minWidth: 0, display: "grid", gridTemplateColumns: "1fr 1.2fr 1.2fr", gap: "1rem", width: "100%" }}>
                  <strong style={{ fontSize: ".9375rem" }}>{what}</strong>
                  <span style={{ color: "var(--ink-2)", fontSize: ".9375rem" }}>{skill}</span>
                  <span style={{ fontSize: ".9375rem" }}>{brain}</span>
                </span>
              </div>
            ))}
          </div>
          <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: ".5rem" }}>
            columns: — · as a skill · as a brain
          </p>
        </section>

        <section style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "2.5rem" }}>
          <Link className="btn" href="/brains">
            Turn a skill folder into a brain
          </Link>
          <Link className="btn btn-ghost" href="/vs">
            The gentler comparison: brain vs a file
          </Link>
          <Link className="btn btn-ghost" href="/explore">
            See measured brains
          </Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
