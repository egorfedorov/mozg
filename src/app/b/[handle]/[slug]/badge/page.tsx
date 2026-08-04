import Link from "next/link";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import TopBar from "@/components/TopBar";
import SiteFooter from "@/components/SiteFooter";
import Contents from "@/components/Contents";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
import { isoDate } from "@/lib/dates";
import { tintFor } from "@/lib/brains";

/**
 * The brain's exam badge — the public, shareable receipt for the score the
 * storefront quotes. Unlike the learner's certificate this page needs no
 * sign-in and names no person: it is the agent's own result, with the
 * anti-bluff probes next to the headline number so a high score cannot hide
 * a brain that answers out of scope.
 *
 * Public brains only; a private brain's exam is its owner's business.
 */
export const dynamic = "force-dynamic";

interface ExamRun {
  score: number;
  sat_at: Date;
  questions: number;
  neg_passed: number;
  neg_total: number;
}

/** The latest finished sitting, with the negative probes counted from the
 *  run itself (ExamResult's negativePassed/negativeTotal, re-derived). */
async function latestExam(brainId: string): Promise<ExamRun | null> {
  const rows = await query<ExamRun>(
    `select r.score,
            coalesce(r.finished_at, r.started_at) as sat_at,
            (select count(*) from check_results cr where cr.run_id = r.id)::int as questions,
            (select count(*) from check_results cr
               join checks c on c.id = cr.check_id
              where cr.run_id = r.id and c.kind = 'negative' and cr.passed)::int as neg_passed,
            (select count(*) from check_results cr
               join checks c on c.id = cr.check_id
              where cr.run_id = r.id and c.kind = 'negative')::int as neg_total
       from check_runs r
      where r.brain_id = $1 and r.status = 'done' and r.score is not null
      order by r.started_at desc limit 1`,
    [brainId],
  );
  return rows[0] ?? null;
}

async function resolve(handle: string, slug: string) {
  const found = await accessForSlug(handle, slug, null);
  if (!found?.brain || found.brain.visibility !== "public") return null;
  const exam = await latestExam(found.brain.id);
  return { brain: found.brain, exam };
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}): Promise<Metadata> {
  const { handle, slug } = await params;
  const resolved = await resolve(handle, slug);
  if (!resolved) return { title: "mozg" };
  const { brain, exam } = resolved;
  const title = exam
    ? `${brain.title} scored ${exam.score}% on its exam — mozg`
    : `${brain.title} — exam badge — mozg`;
  const description = exam
    ? `An AI agent running on the ${brain.title} brain answered ${exam.score}% of ` +
      `${exam.questions} exam questions correctly (${isoDate(exam.sat_at)})` +
      (exam.neg_total > 0
        ? `, refusing ${exam.neg_passed} of ${exam.neg_total} out-of-scope probes`
        : "") +
      `. Graded by an independent judge, not claimed by the author.`
    : `The ${brain.title} brain has not sat its exam yet.`;
  return {
    title,
    description,
    openGraph: { title, description, type: "article", url: `/b/${handle}/${slug}/badge` },
    twitter: { card: "summary_large_image", title, description },
  };
}

export default async function ExamBadgePage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const resolved = await resolve(handle, slug);
  if (!resolved) notFound();
  const { brain, exam } = resolved;

  return (
    <>
      <TopBar />
      <Contents active="/explore" />

      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)", maxWidth: 760 }}>
        <p className="eyebrow">
          <Link href={`/b/${handle}/${slug}`}>{brain.title}</Link> / exam badge
        </p>

        <div
          style={{
            border: "2px solid var(--ink)",
            background: "var(--paper-2)",
            padding: "clamp(2rem, 6vw, 3.5rem)",
            marginTop: "1rem",
            position: "relative",
            boxShadow: "8px 8px 0 var(--ink)",
          }}
        >
          <span
            aria-hidden
            style={{
              position: "absolute",
              top: "1.25rem",
              right: "1.5rem",
              width: 44,
              height: 44,
              background: `var(--color-riso-${tintFor(brain)})`,
              boxShadow: "3px -3px 0 rgba(20,22,26,.18)",
            }}
          />
          <p className="eyebrow" style={{ margin: 0 }}>mozg exam badge</p>
          {exam ? (
            <>
              <h1 className="display" style={{ fontSize: "clamp(2.5rem, 8vw, 4.5rem)", margin: "1rem 0 .25rem" }}>
                {exam.score}
                <span style={{ fontSize: ".4em" }}>%</span>
              </h1>
              <p className="lede" style={{ margin: "0 0 1.5rem" }}>
                An AI agent running on <strong>{brain.title}</strong> scored{" "}
                {exam.score}% on the brain&apos;s own exam.
              </p>
              <p style={{ color: "var(--ink-2)", maxWidth: "52ch" }}>
                {exam.questions} questions written from the brain&apos;s stated
                goal, answered through search over its notes, graded by an
                independent judge — the score is measured, not claimed.
                {exam.neg_total > 0 && (
                  <>
                    {" "}Anti-bluff: the agent refused{" "}
                    <strong>
                      {exam.neg_passed} of {exam.neg_total}
                    </strong>{" "}
                    deliberately out-of-scope probes, where the only correct
                    answer is &ldquo;I don&apos;t know&rdquo;.
                  </>
                )}
              </p>
              <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", marginBottom: 0 }}>
                sat {isoDate(exam.sat_at)} ·{" "}
                <Link href={`/b/${handle}/${slug}`} style={{ textDecoration: "underline" }}>
                  inspect the brain
                </Link>
              </p>
            </>
          ) : (
            <>
              <h1 className="h1" style={{ margin: "1rem 0" }}>Not examined yet.</h1>
              <p className="lede">
                <strong>{brain.title}</strong> has not sat its exam, so there is
                no score to badge. The exam is generated from the brain&apos;s
                goal once there is material to test.
              </p>
              <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", marginBottom: 0 }}>
                <Link href={`/b/${handle}/${slug}`} style={{ textDecoration: "underline" }}>
                  back to the brain
                </Link>
              </p>
            </>
          )}
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
