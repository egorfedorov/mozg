import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import Contents from "@/components/Contents";
import SiteFooter from "@/components/SiteFooter";
import { env } from "@/lib/env";

export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("Knowledge audit — exam your RAG or memory system"),
    description: t("Send your knowledge base; it sits a real exam. A dated report: what it actually knows, category by category, with the judge's agreement rate. SOC 2 energy for knowledge bases."),
  };
}

/**
 * Exam-as-a-service, concierge edition. Every memory tool cites benchmarks
 * nobody can reproduce; mozg's exam machinery is its own and publishable, so
 * it can grade OTHER people's corpora. Concierge on purpose: the pipeline
 * exists (import → exam → report), the intake is a conversation until the
 * demand shape is known — a form would just be a slower conversation.
 */
export default async function AuditPage() {
  const t = await translator();

  return (
    <>
      <TopBar />
      <Contents active="/audit" />
      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)" }}>
        <p className="eyebrow">{t("Knowledge audit · exam-as-a-service")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)", margin: ".5rem 0 1rem", maxWidth: "20ch" }}>
          {t("Your knowledge base claims. Ours examines.")}</h1>
        <p className="lede" style={{ maxWidth: "60ch" }}>
          {markup(t("Every RAG and memory tool quotes benchmarks nobody can reproduce. mozg's exam is its own machinery — the same one that grades every brain in the catalogue, in public — and it will happily grade <0>yours</0>: send the corpus, get a dated report of what it actually knows."), [
          <strong key="s0" />,
        ])}</p>

        <section style={{ marginTop: "3rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("What the report says")}</h2>
            <span className="eyebrow">{t("measured, dated, reproducible")}</span>
          </div>
          <div className="rows" style={{ maxWidth: "56rem" }}>
            {[
              [t("The score"), t("Control questions are written from your corpus's own stated goal, then answered ONLY from what retrieval returns — the same honest constraint your users live under. Weighted, majority-voted.")],
              [t("Category coverage"), t("Not one number but a map: which subjects your base actually answers, which it fails, and which questions exposed the gaps — the fix list comes free.")],
              [t("Judge agreement"), t("Every verdict is voted by independent judge passes; the agreement rate ships in the report. A score without its own error bars is marketing.")],
              [t("Anti-bluff"), t("Plausible questions just outside your corpus's scope. A base that confidently answers what it cannot know fails customers quietly — this measures it loudly.")],
              [t("The date"), t("Knowledge rots. The report is dated, and re-audits diff against the previous sitting: what was learned, what was lost.")],
            ].map(([t, b]) => (
              <div key={t} className="row">
                <span style={{ minWidth: 0 }}>
                  <strong>{t}</strong>
                  <span className="row-sub">{b}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "3rem" }}>
          <div className="section-head">
            <h2 className="h2">{t("How it runs")}</h2>
            <span className="eyebrow">{t("your data stays yours")}</span>
          </div>
          <p style={{ color: "var(--ink-2)", maxWidth: "60ch", marginTop: 0 }}>
            {t("You export your corpus (JSONL, markdown, or an API dump — we adapt), it is imported as a private brain nobody else can reach, the exam runs, the report is delivered, and the imported copy is deleted on request. The first audits are hands-on with us in the loop — that is deliberate, not a beta apology: the report format is being shaped by real corpora.")}</p>
        </section>

        <section style={{ marginTop: "3rem", border: "1.5px solid var(--ink)", background: "var(--color-riso-yellow)", boxShadow: "4px 4px 0 var(--ink)", padding: "clamp(1.25rem, 4vw, 2rem)", maxWidth: "56rem" }}>
          <h2 className="h2" style={{ margin: "0 0 .5rem" }}>
            {t("First three audits — free, in exchange for a public result.")}</h2>
          <p style={{ margin: 0, maxWidth: "58ch" }}>
            {t("Your tool's exam score, published with your sign-off, methodology attached. You get an independent number to cite; we get the proof the exam grades anything. Write what your base is and roughly how big — a person answers, usually same day.")}</p>
          <div style={{ marginTop: "1rem" }}>
            <Link className="btn" href="/chat">
              {t("Start the conversation")}</Link>
          </div>
        </section>

        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: "2rem" }}>
          {markup(t("methodology: the same exam every mozg brain sits — question generation from goal + corpus, retrieval-only answering, <0/>-vote judging. Nothing bespoke, which is the point."), [
          env.JUDGE_VOTES ?? 3,
        ])}</p>
      </main>
      <SiteFooter />
    </>
  );
}
