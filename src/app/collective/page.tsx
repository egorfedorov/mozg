import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { searchCollective } from "@/lib/search";
import { TOPICS, isTopic, topicLabel } from "@/lib/topics";

export const metadata = {
  title: "The collective mind — mozg",
  description:
    "Every agent that uses a brain makes it smarter: unanswered questions become exam questions, corrections become reviewed notes, and every version is kept. How collective knowledge actually works on mozg.",
};

/**
 * The collective-mind longread. Every mechanism described here is shipped and
 * measurable — the page's persuasion budget is the same as /vs-skills: no
 * claim an exam score or a database row can't back.
 *
 * It opens with the working half: one search box over every public brain.
 * The pitch below claims knowledge compounds; the box lets a skeptic check
 * what it has compounded into so far.
 */
export default async function CollectivePage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; topic?: string }>;
}) {
  const t = await translator();

  const { q: rawQ, topic: rawTopic } = await searchParams;
  const q = (rawQ ?? "").trim().slice(0, 200);
  const topic = isTopic(rawTopic) ? rawTopic : null;
  // Below three characters the hybrid search is noise, not an answer — the
  // API says the same with a 400.
  const results = q.length >= 3 ? await searchCollective(q, { topic }) : null;

  return (
    <>
      <TopBar />
      <Contents active="/collective" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">{t("The collective mind")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 6.5vw, 4rem)", margin: ".5rem 0 1rem" }}>
          {markup(t("Every question anyone asks <0/> makes it smarter."), [
          <br key="s0" />,
        ])}</h1>
        <p className="lede" style={{ maxWidth: "58ch" }}>
          {t("A file you write alone stays exactly as smart as you were the day you wrote it. A brain is used by many agents — and everything they do with it, including failing to get an answer, is a signal it learns from. Here is the loop, mechanism by mechanism. Nothing on this page is a roadmap; all of it runs today.")}</p>

        {/* ── the working half: one box over every public brain ────────── */}
        <section style={{ marginTop: "clamp(2rem, 5vw, 3rem)" }}>
          <form
            action="/collective"
            method="get"
            style={{ display: "flex", gap: ".5rem", flexWrap: "wrap", maxWidth: 720 }}
          >
            <input
              type="search"
              name="q"
              required
              minLength={3}
              maxLength={200}
              defaultValue={q}
              placeholder="Ask every public brain at once — e.g. how do webhook retries work?"
              style={{
                flex: "1 1 320px",
                padding: ".7rem .9rem",
                border: "1.5px solid var(--ink)",
                background: "var(--paper)",
                font: "inherit",
              }}
            />
            <select
              name="topic"
              defaultValue={topic ?? ""}
              style={{
                padding: ".7rem .6rem",
                border: "1.5px solid var(--ink)",
                background: "var(--paper)",
                font: "inherit",
              }}
            >
              <option value="">{t("all topics")}</option>
              {TOPICS.map((t) => (
                <option key={t.key} value={t.key}>
                  {t.label}
                </option>
              ))}
            </select>
            <button className="btn" type="submit">
              {t("Search the collective")}</button>
          </form>

          {results !== null && (
            <div style={{ marginTop: "1.5rem", maxWidth: 720 }}>
              {results.length === 0 ? (
                <p style={{ color: "var(--ink-2)" }}>
                  {markup(t("No public brain answers that yet <0/>. The catalogue grows one miss at a time — <1>browse what is already learning</1> , or <2>start the brain that should have known</2>."), [
                  topic ? ` in ${topicLabel(topic)}` : "",
                  <Link href="/explore" style={{ textDecoration: "underline" }} key="s1" />,
                  <Link href="/make" style={{ textDecoration: "underline" }} key="s2" />,
                ])}</p>
              ) : (
                <>
                  <p className="eyebrow" style={{ marginBottom: ".75rem" }}>
                    {markup(t("<0/> brain<1/> answer <2/>"), [
                    results.length,
                    results.length === 1 ? "" : "s",
                    topic ? ` · ${topicLabel(topic)}` : "",
                  ])}</p>
                  <div className="rows">
                    {results.map((r) => (
                      <Link key={r.slug} className="row" href={`/b/${r.handle}/${r.slug}`}>
                        <span style={{ minWidth: 0 }}>
                          <strong>{r.title}</strong>
                          {r.answers.map((a) => (
                            <span key={a.title} className="row-sub">
                              {a.snippet}
                            </span>
                          ))}
                          <span className="row-meta">{r.handle}/{r.slug}</span>
                        </span>
                        <span className="row-side">→</span>
                      </Link>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </section>

        {/* ── 1: misses become questions ─────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-red)" }}>{t("Signal № 1")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("The question it couldn't answer becomes part of its exam.")}</h2>
          <svg viewBox="0 0 720 190" style={{ width: "100%", maxWidth: 720, display: "block", border: "1.5px solid var(--ink)", background: "var(--paper-2)" }} aria-label="A search with zero results flows into the exam, then into new material">
            <rect x="25" y="60" width="150" height="50" fill="none" stroke="#14161a" strokeWidth="2" />
            <text x="100" y="82" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("someone's agent asks")}</text>
            <text x="100" y="98" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#f15060">{t("0 results")}</text>
            <path d="M 180 85 L 250 85" stroke="#14161a" strokeWidth="2.5" />
            <rect x="258" y="55" width="160" height="60" fill="#f15060" opacity="0.14" stroke="#f15060" strokeWidth="2" />
            <text x="338" y="82" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("exam question,")}</text>
            <text x="338" y="98" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("category: asked in real use")}</text>
            <path d="M 423 85 L 493 85" stroke="#14161a" strokeWidth="2.5" />
            <rect x="500" y="40" width="195" height="90" fill="none" stroke="#3ec300" strokeWidth="2" />
            <text x="597" y="70" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("next re-read focuses on it,")}</text>
            <text x="597" y="88" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("the crawler fetches pages")}</text>
            <text x="597" y="106" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("that could answer it")}</text>
          </svg>
          <p style={{ maxWidth: "62ch", color: "var(--ink-2)", marginTop: "1rem" }}>
            {markup(t("When any connected agent searches a brain and gets nothing back, that query is recorded. Before the next exam, the most-asked recent misses are added as real exam questions — in their own category, <0>asked in real use</0>. From there the standard machinery takes over: the failed question steers the next focused re-read of the sources, and the brain fetches unread pages whose paths match what was asked. Nobody wrote a ticket. The gap was reported by the act of hitting it."), [
            <span className="mono" key="s0" />,
          ])}</p>
        </section>

        {/* ── 2: corrections ────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-violet)" }}>{t("Signal № 2")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("Agents file corrections while they work.")}</h2>
          <p style={{ maxWidth: "62ch", color: "var(--ink-2)" }}>
            {markup(t("Every connected agent has a <0>brain_feedback</0> tool: “this note is wrong, here is what the API actually returned.” The correction lands in the owner's review queue with the caller's evidence attached. One approval turns it into a note; the old note is superseded, not edited in place. The gate matters as much as the door — no stranger writes into a brain directly, so one confused (or hostile) caller cannot poison what a thousand others rely on. Moderated, evidence-first, attributable: the same reason Wikipedia outlived the wikis that let anyone type anything."), [
            <span className="mono" key="s0" />,
          ])}</p>
        </section>

        {/* ── 3: versions ───────────────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow" style={{ color: "var(--color-riso-green)" }}>{t("Signal № 3")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("Nothing is ever deleted, so every version is still there.")}</h2>
          <svg viewBox="0 0 720 170" style={{ width: "100%", maxWidth: 720, display: "block", border: "1.5px solid var(--ink)", background: "var(--paper-2)" }} aria-label="A chain of superseded notes with exam scores over time">
            {[0, 1, 2, 3].map((i) => (
              <g key={i}>
                <rect x={40 + i * 170} y={55} width={120} height={44} fill={i === 3 ? "#3ec300" : "none"} opacity={i === 3 ? 0.16 : 1} stroke="#14161a" strokeWidth="2" />
                <text x={100 + i * 170} y={73} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#14161a">
                  {i === 3 ? "active note" : "superseded"}
                </text>
                <text x={100 + i * 170} y={89} textAnchor="middle" fontSize="10" fontFamily="monospace" fill="#14161a">
                  {["exam 55%", "exam 71%", "exam 86%", "exam 92%"][i]}
                </text>
                {i < 3 && <path d={`M ${165 + i * 170} 77 L ${205 + i * 170} 77`} stroke="#14161a" strokeWidth="2" />}
              </g>
            ))}
            <text x="360" y="140" textAnchor="middle" fontSize="11" fontFamily="monospace" fill="#14161a">{t("the whole chain is kept — every fact knows what replaced it, and when")}</text>
          </svg>
          <p style={{ maxWidth: "62ch", color: "var(--ink-2)", marginTop: "1rem" }}>
            {t("Improvement never overwrites. A better note supersedes the old one and the old one stays in the chain, timestamped. Each exam sitting is stored with its score, so a brain has a measurable history: you can see exactly which batch of changes moved it from 71% to 86%, and which questions it lost along the way. Knowledge only moves up — a re-read can add and replace, never silently forget.")}</p>
        </section>

        {/* ── the compounding point ─────────────────────────────────────── */}
        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)" }}>
          <p className="eyebrow">{t("Why this compounds")}</p>
          <h2 className="h2" style={{ margin: ".4rem 0 1rem" }}>
            {t("The tenth user gets a better brain than the first.")}</h2>
          <p style={{ maxWidth: "62ch", color: "var(--ink-2)" }}>
            {t("A private file helps one person and decays. A brain accumulates the misses, corrections and re-reads of everyone who touches it — so the brain you add today is the sum of every question it has ever failed and then learned to answer. That is the actual argument for a shared brain over a thousand private copies of the same notes: not storage, but compound interest on other people's questions.")}</p>
          <p style={{ maxWidth: "62ch", color: "var(--ink-2)" }}>
            {t("And because the exam is public on every brain's page, the compounding is visible: score, gaps, what was asked and missed. You never have to take “it got smarter” on faith.")}</p>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4.5rem)", display: "flex", gap: ".75rem", flexWrap: "wrap" }}>
          <Link className="btn" href="/explore">{t("Take a brain that's already learning")}</Link>
          <Link className="btn btn-ghost" href="/make">{t("Or start one of your own")}</Link>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
