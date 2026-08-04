import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
import { currentUser } from "@/lib/session";
import LessonPlayer, { type LessonItem } from "../../LessonPlayer";

export const dynamic = "force-dynamic";

// A lesson part: enough to feel substantial, short enough to finish. Reads
// and recalls double the step count, so 12 notes ≈ 24-30 steps.
const NOTES_PER_PART = 12;
const CHUNK = 4;

/**
 * The lesson: chunks of read-then-recall over the module's notes, closed by
 * the module's exam questions. Recall immediately after reading is the
 * mechanic — re-reading feels like learning, retrieval is learning.
 */
export default async function StudyPage({
  params,
  searchParams,
}: {
  params: Promise<{ handle: string; slug: string; category: string }>;
  searchParams: Promise<{ part?: string }>;
}) {
  const { handle, slug, category: rawCat } = await params;
  const category = decodeURIComponent(rawCat);
  const part = Math.max(1, Number((await searchParams).part) || 1);
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/learn/${handle}/${slug}`);

  const found = await accessForSlug(handle, slug, user.id);
  if (!found?.brain || !found.access) notFound();
  const brain = found.brain;

  const [notes, checks, totalNotes] = await Promise.all([
    query<{ id: string; title: string; body: string }>(
      `select id, title, body from notes
        where brain_id = $1 and status = 'active'
          and coalesce(category, 'general') = $2
        order by created_at
        limit $3 offset $4`,
      [brain.id, category, NOTES_PER_PART, (part - 1) * NOTES_PER_PART],
    ),
    query<{ id: string; question: string; expect: string }>(
      `select id, question, expect from checks
        where brain_id = $1 and enabled and coalesce(category, 'general') = $2
        order by weight desc limit 6`,
      [brain.id, category],
    ),
    query<{ n: number }>(
      `select count(*)::int as n from notes
        where brain_id = $1 and status = 'active'
          and coalesce(category, 'general') = $2`,
      [brain.id, category],
    ).then((r) => r[0].n),
  ]);
  if (!notes.length) notFound();

  const parts = Math.ceil(totalNotes / NOTES_PER_PART);
  const isLastPart = part >= parts;

  // read 4 → recall the same 4, repeated; the module's exam questions close
  // the final part only — they span the whole module, not one page of it.
  const items: LessonItem[] = [];
  for (let i = 0; i < notes.length; i += CHUNK) {
    const chunk = notes.slice(i, i + CHUNK);
    for (const n of chunk) {
      items.push({ type: "read", kind: "note", id: n.id, front: n.title, back: n.body });
    }
    for (const n of chunk) {
      items.push({ type: "recall", kind: "note", id: n.id, front: n.title, back: n.body });
    }
  }
  if (isLastPart) {
    for (const c of checks) {
      items.push({ type: "question", kind: "check", id: c.id, front: c.question, back: c.expect });
    }
  }

  const backHref = `/learn/${handle}/${slug}`;
  const nextHref = isLastPart
    ? null
    : `/learn/${handle}/${slug}/study/${encodeURIComponent(category)}?part=${part + 1}`;

  return (
    <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: 820 }}>
      <p className="eyebrow">
        <Link href="/learn">learn</Link> /{" "}
        <Link href={backHref}>{brain.title}</Link> / lesson
      </p>
      <h1 className="display" style={{ fontSize: "clamp(1.7rem, 5vw, 2.6rem)", margin: ".4rem 0 .5rem" }}>
        {category}
      </h1>
      <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", margin: "0 0 1.5rem" }}>
        {parts > 1 ? `part ${part} of ${parts} · ` : ""}
        read a few, recall the same few{isLastPart && checks.length ? ", then the exam asks" : ""}
      </p>

      <LessonPlayer brainId={brain.id} items={items} backHref={backHref} nextHref={nextHref} />
    </main>
  );
}
