import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
import { currentUser } from "@/lib/session";
import LearnShell from "../../../LearnShell";

export const dynamic = "force-dynamic";

/**
 * The certificate: earned at 80% of the course's cards learned, dated, and
 * honest — it names the brain's own exam score next to yours, because "I
 * learned what my agent knows" is the claim this page exists to make.
 */
export default async function CertificatePage({
  params,
}: {
  params: Promise<{ handle: string; slug: string }>;
}) {
  const { handle, slug } = await params;
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/learn/${handle}/${slug}`);

  const found = await accessForSlug(handle, slug, user.id);
  if (!found?.brain || !found.access) notFound();
  const brain = found.brain;

  const [{ total }, { learned }] = await Promise.all([
    query<{ total: number }>(
      `select (select count(*) from notes where brain_id = $1 and status = 'active')::int
            + (select count(*) from checks where brain_id = $1 and enabled)::int as total`,
      [brain.id],
    ).then((r) => r[0]),
    query<{ learned: number }>(
      `select count(*)::int as learned from learn_progress
        where user_id = $1 and brain_id = $2 and reps > 0
          and kind in ('note', 'check')`,
      [user.id, brain.id],
    ).then((r) => r[0]),
  ]);

  const pct = total ? Math.round((Math.min(learned, total) / total) * 100) : 0;
  if (pct < 80) {
    return (
      <LearnShell>
        <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: 720 }}>
          <p className="eyebrow"><Link href={`/learn/${handle}/${slug}`}>back to the course</Link></p>
          <h1 className="h1">Not yet.</h1>
          <p className="lede">
            The certificate unlocks at 80% of the course learned — you are at{" "}
            {pct}%. It is a claim about knowledge, so it has to be earned the
            slow way.
          </p>
        </main>
      </LearnShell>
    );
  }

  const date = new Date().toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });

  return (
    <LearnShell>
      <main className="shell" style={{ paddingBlock: "clamp(2.5rem, 7vw, 4.5rem)", maxWidth: 760 }}>
        <div
          style={{
            border: "2px solid var(--ink)",
            background: "var(--paper-2)",
            padding: "clamp(2rem, 6vw, 3.5rem)",
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
              borderRadius: "50%",
              background: "var(--color-riso-green)",
              boxShadow: "3px -3px 0 rgba(20,22,26,.18)",
            }}
          />
          <p className="eyebrow" style={{ margin: 0 }}>learn. — a mozg service</p>
          <h1 className="display" style={{ fontSize: "clamp(1.9rem, 5.5vw, 3rem)", margin: "1rem 0" }}>
            Certificate of completion
          </h1>
          <p className="lede" style={{ margin: "0 0 1.5rem" }}>
            <strong>{user.name ?? user.email}</strong> completed the course
          </p>
          <p className="h1" style={{ margin: "0 0 1.5rem" }}>{brain.title}</p>
          <p style={{ color: "var(--ink-2)", maxWidth: "52ch" }}>
            {pct}% of {total} cards learned through spaced retrieval, including
            the brain&apos;s own exam questions
            {brain.score != null ? ` — the same exam the AI agent scores ${brain.score}% on` : ""}.
            Material kept current at mozg.sh; this knowledge was measured, not
            attended.
          </p>
          <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", marginBottom: 0 }}>
            {date} · mozg.sh/learn · verify: the course page shows live progress
          </p>
        </div>

        <p style={{ color: "var(--ink-2)", marginTop: "1.5rem" }}>
          Screenshot it, print it, put it in a README. And since the brain
          keeps learning, so can you —{" "}
          <Link href={`/learn/${handle}/${slug}`} style={{ textDecoration: "underline" }}>
            the course grows with it
          </Link>
          .
        </p>
      </main>
    </LearnShell>
  );
}
