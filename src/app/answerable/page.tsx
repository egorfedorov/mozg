import Link from "next/link";
import { markup } from "@/lib/markup";
import { translator } from "@/lib/t";
import TopBar from "@/components/TopBar";
import Contents from "@/components/Contents";
import SiteFooter from "@/components/SiteFooter";
import { SketchDefs, Panel } from "@/components/Sketch";
import { currentUser } from "@/lib/session";
import { query } from "@/db";

export const dynamic = "force-dynamic";

export async function generateMetadata() {
  const t = await translator();
  return {
    title: t("Your users ask an agent about your product — mozg"),
    description: t("They stopped reading your docs. Their agent answers from a snapshot of last year, confidently, and you get the issue. A brain is the tool it calls instead — examined, dated, honest about its gaps."),
  };
}

/**
 * For whoever maintains the thing people ask agents about.
 *
 * A different reader from every other page here. /make and /start are for
 * somebody who has decided to build a brain; /audit is for somebody who
 * already built a RAG and wants it graded; /vs answers a comparison. This one
 * starts from a pain nobody on those pages has stated: your users have stopped
 * reading your documentation, their agent answers about your product from a
 * year-old snapshot with total confidence, and the result arrives in your
 * issue tracker with a stack trace against an API you removed.
 *
 * The page lives or dies on one section, and it is the one a marketing page
 * would cut: what this does NOT do. The whole category around us sells
 * "get cited by AI", and the measured position is that nobody can promise it
 * — llms.txt, the thing most often sold as the fix, does not correlate with
 * citation at all. Saying so, with the numbers and their source, is the only
 * claim on this page that our competitors structurally cannot copy: they are
 * charging for the opposite. It is also simply the house rule — no claim a row
 * cannot back — applied to a page about ourselves.
 *
 * Everything numeric here is either read live from the catalogue below or
 * carries its source in the footnote. Nothing is asserted from memory.
 */

/** Third-party measurements, quoted with their source because they are not
 *  ours. A number without a citation on this page of all pages would be the
 *  exact thing the page is arguing against. */
const EVIDENCE = {
  llmsTxtAdoption: "~10%",
  citedDomainsWithLlmsTxt: 1,
  citedDomainsSampled: 50,
  noReferrerShare: "70.6%",
  referrerSample: "446,000",
};

export default async function AnswerablePage() {
  const t = await translator();
  const user = await currentUser();

  // The one number on the page that is ours, so it is read rather than typed.
  const live = await query<{ brains: number; searches: number }>(
    `select (select count(*)::int from brains where visibility = 'public') as brains,
            (select count(*)::int from calls
              where tool in ('brain_search', 'brain_find')
                and created_at > now() - interval '30 days') as searches`,
  ).then((r) => r[0] ?? { brains: 0, searches: 0 });

  return (
    <>
      <SketchDefs />
      <TopBar />
      <Contents active="/answerable" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("For whoever maintains the thing people ask about")}</p>
        <h1 className="display" style={{ fontSize: "clamp(2rem, 5.5vw, 3.5rem)", margin: ".5rem 0 1rem", maxWidth: "20ch" }}>
          {t("Nobody is reading your documentation.")}</h1>
        <p className="lede" style={{ maxWidth: "62ch" }}>
          {t("They are asking an agent about your product instead. It answers from a snapshot taken before your last two releases, in the same confident voice it uses for things it knows — and the result reaches you as an issue with a stack trace against a function you deleted.")}</p>

        <section style={{ marginTop: "clamp(2.5rem, 6vw, 3.5rem)" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            {t("Writing better docs does not fix this")}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
            {t("At the moment it answers, the agent is not reading anything. It is recalling — and what it recalls is whatever your site looked like when the model was trained. Rewriting the page changes the next training run, months from now, if you are large enough to be worth learning properly.")}</p>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch" }}>
            {t("An agent reads your pages only when something hands them over mid-task — a fetch it decided to make, or a tool it was given. That is the whole of the opening, and it is narrow enough to be worth aiming at deliberately.")}</p>
        </section>

        <section style={{ marginTop: "clamp(2.5rem, 6vw, 3.5rem)" }}>
          <div className="section-head">
            <h2 className="h2">{t("What a brain does about it")}</h2>
            <span className="eyebrow">{t("the tool the agent calls")}</span>
          </div>
          <div className="sk-strip">
            <Panel n="1" title={t("It is read at answer time")} tint="var(--color-riso-blue)">
              <p>
                {t("Your documentation becomes searchable notes the agent queries mid-task over MCP. It takes the three it needs, not the whole site, so the answer costs a few hundred tokens rather than a context window.")}</p>
            </Panel>
            <Panel n="2" title={t("It sits an exam it did not write")} tint="var(--color-riso-red)">
              <p>
                {t("Your stated goal becomes control questions, re-sat after every re-read. The score is on the public page. So is the list of questions it failed — an agent is told the gaps before it searches, which is the difference between a wrong answer and no answer.")}</p>
            </Panel>
            <Panel n="3" title={t("It re-reads without you")} tint="var(--color-riso-green)">
              <p>
                {t("Pages are checked by content hash; what changed is replaced. A release does not need a documentation sprint to reach the agents answering about you.")}</p>
            </Panel>
            <Panel n="4" title={t("It reports what it was asked")} tint="var(--color-riso-violet)">
              <p>
                {t("Searches that found nothing become exam questions on their own. What your users could not get an answer to is a list you can read — and it is written by their agents, not by a survey.")}</p>
            </Panel>
          </div>
        </section>

        {/* The section a marketing page cuts. It is the reason to believe the
            rest, and the one thing the category selling "get cited by AI"
            cannot print. */}
        <section
          style={{
            marginTop: "clamp(3rem, 7vw, 4rem)",
            border: "2px solid var(--ink)",
            background: "var(--paper-2)",
            padding: "clamp(1.25rem, 4vw, 2rem)",
            maxWidth: "56rem",
          }}
        >
          <h2 className="h2" style={{ margin: "0 0 .75rem" }}>
            {t("What this does not do")}</h2>
          <div className="rows">
            {[
              [
                t("It will not get you cited by ChatGPT."),
                t("Nobody can sell you that, and the tools that do are selling a correlation. What we affect is what an agent gets when it calls a tool — which is a door we can actually hold open, and the only one."),
              ],
              [
                t("llms.txt is not the fix it is sold as."),
                markup(t("Adoption sits around <0/> of scanned domains, and among the <1/> most AI-cited domains exactly <2/> has one. Google has confirmed no Search system reads it. It is genuinely useful for one thing — coding assistants fetching your docs cheaply at answer time — which is this door, not that claim."), [
                  EVIDENCE.llmsTxtAdoption,
                  EVIDENCE.citedDomainsSampled,
                  EVIDENCE.citedDomainsWithLlmsTxt,
                ]),
              ],
              [
                t("It does not touch your search ranking."),
                t("Different mechanism, different page, and anyone bundling the two has not measured either."),
              ],
              [
                t("Most of the traffic cannot be attributed, and we say so."),
                markup(t("Around <0/> of visits arriving from an AI assistant carry no referrer at all (measured across <1/> visits) and land in every analytics tool as “direct”. We show what the first-touch tag could see and label the rest unrecorded, rather than dividing the unknown among the channels that happen to be measurable."), [
                  EVIDENCE.noReferrerShare,
                  EVIDENCE.referrerSample,
                ]),
              ],
              [
                t("A low score gets published too."),
                t("The exam is not a badge you buy. If the material is thin, the number says so on your own page — that is what makes the number worth anything when it is high."),
              ],
            ].map(([head, body], i) => (
              <div key={i} className="row">
                <span style={{ minWidth: 0 }}>
                  <strong>{head}</strong>
                  <span className="row-sub">{body}</span>
                </span>
              </div>
            ))}
          </div>
        </section>

        <section style={{ marginTop: "clamp(3rem, 7vw, 4rem)" }}>
          <h2 className="h2" style={{ marginBottom: ".5rem" }}>
            {t("Three steps, and the first one is a URL")}</h2>
          <p style={{ color: "var(--ink-2)", maxWidth: "62ch", marginTop: 0 }}>
            {markup(t("Paste the link to your documentation. Every page behind it is found and read, the material becomes notes, and the brain sits its first exam — you read the score and the failed questions, add whatever they name, and it re-sits. Then you publish it, or keep it private and hand it only to your own team. <0/>Today there are <1/> public brains, and agents ran <2/> searches through mozg in the last thirty days."), [
            <br key="s0" />,
            live.brains,
            live.searches,
          ])}</p>
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginTop: "1.25rem" }}>
            <Link className="btn" href={user ? "/brains/new" : "/sign-in"}>
              {t("Start with your docs URL")}</Link>
            <Link className="btn btn-ghost" href="/make">
              {t("How a good one is built")}</Link>
            <Link className="btn btn-ghost" href="/chat">
              {t("Ask a person first")}</Link>
          </div>
        </section>

        <p className="mono" style={{ fontSize: ".75rem", color: "var(--ink-3)", marginTop: "2.5rem", maxWidth: "62ch" }}>
          {t("Sources for the three numbers above, none of them ours: llms.txt adoption and citation share — Presenc AI, “State of llms.txt 2026”, and OpenHermit's 2026 guide; Google's position stated by John Mueller; referrer loss on AI-assistant traffic — Cometly's 2026 tracking analysis. Read August 2026. The catalogue counts on this page are read from our own database when you load it.")}</p>
      </main>

      <SiteFooter />
    </>
  );
}
