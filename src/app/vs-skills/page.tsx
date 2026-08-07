import Link from "next/link";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import AskedTwice from "@/components/AskedTwice";

export const metadata = {
  title: "The confident wrong answer — mozg",
  description:
    "Skills and context files make agents feel knowledgeable. The pain: stale answers delivered with confidence, tokens burned on unread text, knowledge nobody can measure. What a brain does differently.",
};

/**
 * The pain page. Every section is one error people actually hit with skills
 * and context files, drawn, then the mechanism that removes it. It stays
 * honest at the end about where skills legitimately win — credibility is the
 * whole persuasion budget.
 */
export default async function VsSkillsPage() {
  const t = await translator();

  return (
    <>
      <TopBar />
      <Contents active="/vs-skills" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">{t("Skills & context files vs a brain")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}>
          The most expensive answer
          <br />
          is the confident wrong one.
        </h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          {t("You gave your agent skills, CLAUDE.md files, a folder of carefully written knowledge. It reads them and answers with total confidence — and three months later half of those answers are quietly wrong. Here is exactly where that pain comes from, error by error.")}</p>

        {/* ── error 1: the token tax ────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>{t("Error № 1")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("You pay for every word, every session — needed or not.")}</h2>
          <svg viewBox="0 0 720 200" style={{ width: "100%", maxWidth: 720, display: "block", border: "1.5px solid var(--ink)", background: "var(--paper-2)" }} aria-label="A file dumps whole into context; a brain returns three notes">
            <rect x="30" y="30" width="120" height="140" fill="none" stroke="#14161a" strokeWidth="2" />
            {Array.from({ length: 9 }).map((_, i) => (
              <line key={i} x1="42" y1={46 + i * 14} x2="138" y2={46 + i * 14} stroke="#14161a" strokeWidth="2" opacity="0.35" />
            ))}
            <path d="M 160 100 L 240 100" stroke="#f15060" strokeWidth="3" markerEnd="url(#a1)" />
            <rect x="250" y="20" width="90" height="160" fill="#f15060" opacity="0.18" stroke="#f15060" strokeWidth="2" />
            <text x="295" y="105" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#14161a">{t("context")}</text>
            <text x="90" y="190" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("the whole file, every session")}</text>
            <circle cx="470" cy="100" r="46" fill="#f15060" />
            <circle cx="478" cy="92" r="46" fill="#14161a" opacity="0.12" />
            <path d="M 525 100 L 600 100" stroke="#3ec300" strokeWidth="3" />
            <rect x="610" y="70" width="80" height="16" fill="none" stroke="#14161a" strokeWidth="1.5" />
            <rect x="610" y="92" width="80" height="16" fill="none" stroke="#14161a" strokeWidth="1.5" />
            <rect x="610" y="114" width="80" height="16" fill="none" stroke="#14161a" strokeWidth="1.5" />
            <text x="470" y="190" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("brain — only the 3 notes the task needed")}</text>
            <defs>
              <marker id="a1" markerWidth="8" markerHeight="8" refX="6" refY="4" orient="auto">
                <path d="M0,0 L8,4 L0,8 z" fill="#f15060" />
              </marker>
            </defs>
          </svg>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: "1rem" }}>
            A skill or context file loads front to back into the window whether
            today&apos;s task needs one line of it or none — and the folder only
            grows. Past a point it physically cannot fit, so people start
            deleting knowledge to make room, which is exactly backwards.
            <strong> A brain is searched:</strong> the agent asks, gets the
            three notes that answer, and the other seven hundred cost nothing.
            Knowledge scales; the bill does not.
          </p>
        </section>

        {/* ── error 2: silent rot ───────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>{t("Error № 2")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("The docs changed on Tuesday. Your agent finds out never.")}</h2>
          <svg viewBox="0 0 720 170" style={{ width: "100%", maxWidth: 720, display: "block", border: "1.5px solid var(--ink)", background: "var(--paper-2)" }} aria-label="A file stays flat while docs change; a brain re-reads and re-examines">
            <path d="M 40 60 L 320 60" stroke="#14161a" strokeWidth="2" strokeDasharray="6 5" />
            <text x="180" y="45" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("file: same bytes, month after month")}</text>
            <path d="M 40 130 C 120 128, 140 100, 200 104 C 260 108, 280 80, 340 78" stroke="#3ec300" strokeWidth="3" fill="none" />
            <text x="180" y="160" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("brain: re-read, re-examined, corrected")}</text>
            <g>
              <rect x="420" y="30" width="260" height="110" fill="none" stroke="#14161a" strokeWidth="2" />
              <text x="550" y="55" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#14161a">{t("the API changed on Tuesday")}</text>
              <text x="550" y="80" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#f15060">{t("file: kept teaching the old shape")}</text>
              <text x="550" y="105" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#3ec300">{t("brain: re-read it Tuesday night,")}</text>
              <text x="550" y="122" textAnchor="middle" fontSize="12" fontFamily="monospace" fill="#3ec300">{t("re-sat its exam, score moved")}</text>
            </g>
          </svg>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: "1rem" }}>
            Nothing in a file tells you it went stale — it keeps answering
            in yesterday&apos;s shapes, confidently, and you find out from a broken
            build. A brain re-reads its sources on a schedule, supersedes what
            changed, re-sits an exam generated from its stated goal — and any
            agent using it mid-task can <em>flag a note</em> the moment reality
            disagrees. Files decay silently; a brain files a complaint.
          </p>
        </section>

        {/* ── error 3: unmeasurable knowledge ───────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>{t("Error № 3")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("Nobody can answer \"what does it actually know?\"")}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
            {t("Ask whether your knowledge folder covers the error codes of one endpoint and the honest answer is a shrug and a grep — so agents improvise, and improvisation reads exactly like knowledge until it ships. A brain answers with a number: an exam built from its goal, re-sat after every change, with the failures naming exactly which material is missing. Not a vibe — a score you can watch move.")}</p>
          <div className="scorecard" style={{ maxWidth: 480, marginTop: "1.25rem" }}>
            <div className="score-head">
              <div>
                <p className="eyebrow" style={{ marginBottom: ".35rem" }}>{t("a folder of files")}</p>
                <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>coverage</span>
              </div>
              <div className="score-big">?<sup>%</sup></div>
            </div>
            <div className="score-head" style={{ borderTop: "1.5px solid var(--ink)" }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: ".35rem" }}>{t("the same knowledge, as a brain")}</p>
                <span className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-2)" }}>measured, re-sat after every change</span>
              </div>
              <div className="score-big">92<sup>%</sup></div>
            </div>
          </div>
        </section>

        {/* ── error 4: copies drift ─────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>{t("Error № 4")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("Every teammate has a copy. Every copy is different.")}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
            {t("Hand someone a file and you have forked your knowledge: their copy and yours drift from that day on, and a correction lands in one of them. A brain is one URL — every agent on the team reads the same living thing, a fix approved once reaches every reader instantly, and it plugs into Claude Code, Codex, Cursor and whatever ships next month, because MCP is the socket.")}</p>
        </section>

        {/* ── error 5: lessons evaporate ────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>{t("Error № 5")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("You corrected the agent yesterday. It forgot by this morning.")}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
            The hardest-won knowledge — the pitfall that cost an afternoon, the
            convention you explained for the fifth time — lives and dies inside
            one conversation. With a brain, the agent <em>writes the lesson
            back</em>: you approve it once, and every future session of every
            agent starts already knowing it. Corrections compound instead of
            evaporating.
          </p>
        </section>

        {/* ── the honest part ───────────────────────────────────────────── */}
        {/* ── error 6: it cannot propose what you did not ask for ───────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>{t("Error № 6")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("A file answers the question you knew how to ask.")}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch" }}>
            {t("This is the error nobody notices, because nothing looks wrong. You describe what you want in the words you have; the agent does exactly that and nothing more. The thing a professional would have proposed — the convention with a name you have never heard — never comes up, because neither of you knew it was missing.")}</p>
          <AskedTwice
            ask={"\u201cWhen two scatters land, the spin should feel more exciting. I do not know how these games do that \u2014 make it good.\u201d"}
            without={
              "A screen shake and a louder sound after the reels stop. Reasonable, generic, and aimed at the wrong moment: the tension in a slot lives before the outcome, not after it. The one moment the request was about stays empty."
            }
            withBrain={
              "It searches and comes back with the name of the thing: anticipation. \u201cWith two scatters visible, the last reel slows and its anticipation animation plays until it stops \u2014 that is where the tension is. Your studio brain says anticipation fires from the third reel on and never on a guaranteed loss, and the platform wants it emitted as its own event so the frontend can play it mid-spin.\u201d Then it builds that."
            }
            accent="var(--color-riso-green)"
          />
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: "1rem" }}>
            The person asking had never heard the word and got what a veteran
            would have specified. A skill could have carried that convention too —
            if somebody had thought to write it down, and if it were still true
            this month. The brain was <em>asked</em>, and it can tell you when it
            does not know.{" "}
            <Link href="/stories#shipping-a-game" className="linkish">
              The full story, and the others
            </Link>
            .
          </p>
        </section>

        <section
          className="panel"
          style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", borderLeft: "4px solid var(--color-riso-orange)" }}
        >
          <p className="eyebrow">{t("Where skills genuinely win")}</p>
          <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0", maxWidth: "62ch" }}>
            A skill that <em>runs things</em> — shell scripts, deploy gates,
            asset pipelines — is a tool, and a brain does not replace tools.
            The honest rule: <strong>procedures with code stay skills;
            knowledge becomes a brain.</strong> If your skill is mostly prose
            about how something works, it is a brain wearing the wrong
            container — and paying the token tax for it.
          </p>
        </section>

        {/* ── the table ─────────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <div className="rows">
            {[
              ["Cost per session", "whole file in context, every time", "three notes, only when asked"],
              ["When docs change", "silently wrong", "re-read, re-examined, score moves"],
              ["Coverage", "unknowable", "a number, with the gaps named"],
              ["Corrections", "die with the conversation", "written back, approved once, kept forever"],
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
            {t("columns: — · as a file · as a brain")}</p>
        </section>

        <section style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "2.5rem" }}>
          <Link className="btn" href="/brains">
            Turn your knowledge folder into a brain
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
