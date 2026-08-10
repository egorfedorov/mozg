import Link from "next/link";
import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import { msg } from "@/lib/msg";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query } from "@/db";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "How a brain learns — mozg",
  description:
    "One link becomes every page behind it, pages become notes, notes sit an exam, and the questions it fails decide what gets read next. The loop that makes a knowledge base improve instead of rot.",
};

/**
 * How one brain learns.
 *
 * /collective already explains the network effect — one person's miss becomes
 * everyone's material. What nobody had written down is the loop inside a
 * single brain, which is the part people do not believe until they see it
 * named: a knowledge base that gets *worse* with age is everyone's experience
 * of documentation, and the claim being made here is the opposite one.
 *
 * The numbers are read live rather than typed into the copy. A page that
 * boasts about staying current cannot itself be out of date.
 */

const STEPS: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: msg("One link becomes every page behind it"),
    body: msg("Point a brain at a documentation site or a repository and the crawler works out how to enumerate it — the git tree, the sitemap, or a walk of the links — then reads each page. Files, pasted text, screenshots and PDFs go in the same door. A repository's own plumbing is skipped: changelogs, licences, CI folders and agent prompts are not the product's manual."),
  },
  {
    n: "02",
    title: msg("Pages are read against the goal, not summarised"),
    body: msg("Every brain states what it is for, and extraction reads for that: the same page yields different notes for a brain about pricing and a brain about the API. Tables stay whole, code examples stay verbatim, and a page dense enough to overflow one reply is split and read in halves rather than lost. Extraction is cached, so the same page is never paid for twice."),
  },
  {
    n: "03",
    title: msg("Notes are atomic, and near-copies never land twice"),
    body: msg("A note is one fact, self-contained enough to be read alone months later by someone with none of the context. Each is chunked and embedded, and a new note close enough to an existing one is rejected at the door — the same fact worded twice is how a knowledge base starts contradicting itself. Credentials and prompt-injection language are scanned out before anything is stored."),
  },
  {
    n: "04",
    title: msg("Then it sits an exam — including on what it does not have"),
    body: msg("Control questions are written from the goal, not from the notes, and deliberately include subjects the goal implies but the material has not covered. Those failures are the point. A fifth of every exam is the opposite test: plausible questions from outside the brain's scope, which it is supposed to refuse rather than answer. Three independent judges vote on every question, so a score means the same thing twice running."),
  },
  {
    n: "05",
    title: msg("The questions it failed decide what is read next"),
    body: msg("This is the loop. Failed checks are matched against the pages of the brain's own sources; the ones that look like answers are queued and read. Those same failed questions travel inside the extraction prompt, so a re-read is never blind — it is hunting for exactly what the score says is missing. Then the brain re-sits, and the difference is visible on its page."),
  },
  {
    n: "06",
    title: msg("A real search that found nothing becomes an exam question"),
    body: msg("When any agent searches a brain and gets nothing back, that query is filed. The most frequent misses become control questions, which pulls the whole machinery — focused re-reads, page top-ups, the score — toward what people actually asked instead of only what the author imagined."),
  },
  {
    n: "07",
    title: msg("Sources are re-read when they change, and nothing is deleted"),
    body: msg("Pages are re-fetched and fingerprinted; an unchanged page costs nothing, a changed one is read again and the notes it used to produce are superseded rather than removed. Every fact keeps the chain of what replaced it and when — which is what lets you ask a brain what it used to believe."),
  },
];

export default async function HowItLearnsPage() {
  const t = await translator();

  const [now] = await query<{
    notes: number;
    pages: number;
    examined: number;
    avg_score: number | null;
  }>(
    `select
       (select count(*)::int from notes where status = 'active') as notes,
       (select count(*)::int from sources where status = 'ready') as pages,
       (select count(*)::int from brains
         where visibility = 'public' and parent_id is null and score is not null) as examined,
       (select round(avg(score))::int from brains
         where visibility = 'public' and parent_id is null and score is not null) as avg_score`,
  );

  return (
    <>
      <TopBar />
      <Contents active="/how-it-learns" />

      <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)" }}>
        <p className="eyebrow">{t("How a brain learns")}</p>
        <h1
          className="display"
          style={{ fontSize: "clamp(2rem, 5.5vw, 3.6rem)", margin: ".4rem 0 1.25rem" }}
        >
          {markup(t("Documentation rots. <0/>This is built to do the opposite."), [
            <br key="s0" />,
          ])}
        </h1>
        <p
          style={{
            fontSize: "clamp(1.05rem, 2vw, 1.25rem)",
            color: "var(--ink-2)",
            maxWidth: "56ch",
            marginTop: 0,
          }}
        >
          {t("Everyone has met a wiki that was true in March. A brain is the same material with a loop around it: it is examined against what it was made for, and the questions it fails are what decides which pages get read next. Seven steps, all of them running while you read this.")}
        </p>

        <div className="stats" style={{ marginTop: "2rem" }}>
          <div className="stat">
            <span className="eyebrow">{t("Notes held")}</span>
            <span className="stat-value" data-big>
              {(now?.notes ?? 0).toLocaleString()}
            </span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Pages read")}</span>
            <span className="stat-value">{(now?.pages ?? 0).toLocaleString()}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Brains examined")}</span>
            <span className="stat-value">{now?.examined ?? 0}</span>
          </div>
          <div className="stat">
            <span className="eyebrow">{t("Catalogue average")}</span>
            <span className="stat-value">{now?.avg_score ?? "—"}%</span>
          </div>
        </div>

        <ol className="wf-steps" style={{ marginTop: "2.5rem" }}>
          {STEPS.map((s) => (
            <li key={s.n} className="wf-step">
              <span className="wf-step-n">{s.n}</span>
              <div className="wf-step-body">
                <h2 className="wf-step-title">{t(s.title)}</h2>
                <p style={{ margin: 0, fontSize: ".97rem", lineHeight: 1.55 }}>{t(s.body)}</p>
              </div>
            </li>
          ))}
        </ol>

        <h2 className="h2" style={{ marginTop: "3rem" }}>
          {t("What it never does: go and look things up on its own")}
        </h2>
        <p style={{ maxWidth: "60ch" }}>
          {t("A brain reads what it was given — a source you named, a file you sent, a note an agent wrote back. It does not wander off to fill a gap from a search engine, and that is a deliberate line rather than a missing feature. Everything this product claims rests on knowing exactly what a brain read: the score means something because the material is known, the author can be paid because the material is theirs, and you can check a fact because it has a page behind it. A brain that quietly scraped the open web to look complete would have none of that, and you would have no way to tell.")}
        </p>
        <p style={{ maxWidth: "60ch" }}>
          {t("Inside a source you named, though, it is free: give it a documentation site and it finds every page behind the link, comes back when those pages change, and goes hunting through them whenever its exam says something is missing.")}
        </p>

        <div
          className="panel"
          style={{
            marginTop: "2.5rem",
            display: "flex",
            gap: "1.5rem",
            flexWrap: "wrap",
            alignItems: "center",
          }}
        >
          <div style={{ flex: "1 1 30ch" }}>
            <h2 className="h2" style={{ margin: 0 }}>
              {t("Watch it happen on a real one.")}
            </h2>
            <p style={{ color: "var(--ink-2)", margin: ".5rem 0 0" }}>
              {t("Every brain's page shows its score, the categories it fails, and what it was asked and could not answer. None of it is taken on faith.")}
            </p>
          </div>
          <Link className="btn" href="/explore">
            {t("Open the catalogue")}
          </Link>
        </div>

        <p className="mono" style={{ marginTop: "1.5rem", fontSize: ".8125rem", color: "var(--ink-2)" }}>
          <Link href="/collective">{t("And what happens when everyone's misses feed the same shelf →")}</Link>
        </p>
      </main>

      <SiteFooter />
    </>
  );
}
