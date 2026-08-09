import { translator } from "@/lib/t";
import { markup } from "@/lib/markup";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { query } from "@/db";
import { accessForSlug } from "@/lib/access";
import { currentUser } from "@/lib/session";
import LearnShell from "../../../../LearnShell";
import { maybeOne } from "@/db";
import { enqueueLesson } from "@/worker/queue";
import { notesHash, sectionQuizzes, sectionKey, type LessonPayload } from "@/worker/lesson";
import { rankSections } from "@/lib/learn";
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
  const t = await translator();

  const { handle, slug, category: rawCat } = await params;
  const category = decodeURIComponent(rawCat);
  const part = Math.max(1, Number((await searchParams).part) || 1);
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/learn/${handle}/${slug}`);

  const found = await accessForSlug(handle, slug, user.id);
  if (!found?.brain || !found.access) notFound();
  const brain = found.brain;

  const [allNotes, checks] = await Promise.all([
    query<{ id: string; title: string; body: string }>(
      `select id, title, body from notes
        where brain_id = $1 and status = 'active'
          and coalesce(category, 'general') = $2
        order by created_at
        limit 200`,
      [brain.id, category],
    ),
    query<{ id: string; question: string; expect: string }>(
      `select id, question, expect from checks
        where brain_id = $1 and enabled and coalesce(category, 'general') = $2
        order by weight desc limit 6`,
      [brain.id, category],
    ),
  ]);
  if (!allNotes.length) notFound();

  // The compiled lesson, when the editor pass has run over exactly these
  // notes. Otherwise queue the compile and teach in raw order meanwhile —
  // a person mid-lesson beats a person waiting on a model call.
  const lessonRow = await maybeOne<{ notes_hash: string; payload: LessonPayload }>(
    `select notes_hash, payload from lessons where brain_id = $1 and category = $2`,
    [brain.id, category],
  );
  const compiled = lessonRow?.notes_hash === notesHash(allNotes, checks) ? lessonRow.payload : null;
  if (!compiled) void enqueueLesson(brain.id, category).catch(() => {});

  const byId = new Map(allNotes.map((n) => [n.id, n]));
  const checkById = new Map(checks.map((c) => [c.id, c]));

  // Adaptive order: the learner's history with this module's cards ranks
  // the sections — the weakest first. No history, the editor's order stands.
  const progress = compiled
    ? await query<{ kind: "note" | "check"; itemId: string; lapses: number; ease: number }>(
        `select kind, item_id as "itemId", lapses, ease from learn_progress
          where user_id = $1 and brain_id = $2 and kind in ('note', 'check')
            and item_id = any($3::uuid[])`,
        [user.id, brain.id, [...allNotes.map((n) => n.id), ...checks.map((c) => c.id)]],
      )
    : [];
  const enriched = (compiled?.sections ?? []).map((s, i) => ({
    ...s,
    eli5Lead: compiled?.depths?.eli5.leads[i],
    expertLead: compiled?.depths?.expert.leads[i],
  }));
  const { sections: ranked, adapted } = rankSections(enriched, progress);

  // When the compiled lesson binds sections to exam questions, each section
  // is quizzed with one of its questions right after its last note.
  const quizAt = compiled
    ? sectionQuizzes(ranked, new Set(checks.map((c) => c.id)))
    : new Map<string, string>();
  const ordered: {
    note: (typeof allNotes)[number];
    section?: { heading: string; lead: string; eli5Lead?: string; expertLead?: string };
  }[] = compiled
    ? ranked.flatMap((s) =>
        s.note_ids
          .map((id) => byId.get(id))
          .filter((n): n is NonNullable<typeof n> => Boolean(n))
          .map((note, i) =>
            i === 0
              ? { note, section: { heading: s.heading, lead: s.lead, eli5Lead: s.eli5Lead, expertLead: s.expertLead } }
              : { note },
          ),
      )
    : allNotes.map((note) => ({ note }));

  // Whole sections are graded too: the player aggregates the grades each
  // section's cards earn in the sitting and schedules the section itself.
  const playerSections = compiled
    ? ranked.map((s) => ({
        key: sectionKey(brain.id, category, s.heading, s.note_ids),
        itemIds: [...s.note_ids, ...(s.check_ids ?? [])],
      }))
    : undefined;

  const parts = Math.ceil(ordered.length / NOTES_PER_PART);
  const isLastPart = part >= parts;
  const pageNotes = ordered.slice((part - 1) * NOTES_PER_PART, part * NOTES_PER_PART);

  // read 4 → recall the same 4, repeated; section headings arrive as read
  // steps; a section's quiz follows its last note; the remaining exam
  // questions close the final part only.
  const items: LessonItem[] = [];
  // Checks quizzed on earlier parts count as asked — the closing exam must
  // not re-ask them (this Set is rebuilt per request, so seed it).
  const quizzed = new Set<string>();
  for (const { note } of ordered.slice(0, (part - 1) * NOTES_PER_PART)) {
    const asked = quizAt.get(note.id);
    if (asked) quizzed.add(asked);
  }
  for (let i = 0; i < pageNotes.length; i += CHUNK) {
    const chunk = pageNotes.slice(i, i + CHUNK);
    for (const { note, section } of chunk) {
      if (section) {
        items.push({
          type: "read",
          kind: "note",
          id: note.id,
          front: `§ ${section.heading}`,
          back: section.lead,
          altBack:
            section.eli5Lead || section.expertLead
              ? { eli5: section.eli5Lead, expert: section.expertLead }
              : undefined,
        });
      }
      items.push({ type: "read", kind: "note", id: note.id, front: note.title, back: note.body });
    }
    for (const { note } of chunk) {
      items.push({ type: "recall", kind: "note", id: note.id, front: note.title, back: note.body });
    }
    for (const { note } of chunk) {
      const checkId = quizAt.get(note.id);
      const c = checkId && !quizzed.has(checkId) ? checkById.get(checkId) : undefined;
      if (c) {
        quizzed.add(c.id);
        items.push({ type: "question", kind: "check", id: c.id, front: c.question, back: c.expect, quiz: true });
      }
    }
  }
  if (isLastPart) {
    for (const c of checks) {
      if (quizzed.has(c.id)) continue;
      items.push({ type: "question", kind: "check", id: c.id, front: c.question, back: c.expect });
    }
  }
  const closing = isLastPart ? checks.filter((c) => !quizzed.has(c.id)).length : 0;

  const backHref = `/learn/${handle}/${slug}`;
  const nextHref = isLastPart
    ? null
    : `/learn/${handle}/${slug}/study/${encodeURIComponent(category)}?part=${part + 1}`;

  return (
    <LearnShell>
    <main className="shell" style={{ paddingBlock: "clamp(2rem, 5vw, 3.5rem)", maxWidth: 820 }}>
      <p className="eyebrow">
        {markup(t("<0>learn</0> / <1/> / lesson"), [
        <Link href="/learn" key="s0" />,
        <Link key="s1" href={backHref}>{brain.title}</Link>,
      ])}</p>
      <h1 className="display" style={{ fontSize: "clamp(1.7rem, 5vw, 2.6rem)", margin: ".4rem 0 .5rem" }}>
        {category}
      </h1>
      <p className="mono" style={{ fontSize: ".8125rem", color: "var(--ink-3)", margin: "0 0 1.5rem" }}>
        {markup(t("<0/> read a few, recall the same few<1/> <2/>"), [
        parts > 1 ? `part ${part} of ${parts} · ` : "",
        closing > 0 ? t(", then the exam asks") : "",
        !compiled && t(" · the editor is arranging this module — this sitting teaches in raw order"),
      ])}</p>

      <LessonPlayer
        brainId={brain.id}
        items={items}
        backHref={backHref}
        nextHref={nextHref}
        intro={
          compiled && part === 1
            ? {
                standard: compiled.intro,
                eli5: compiled.depths?.eli5.intro,
                expert: compiled.depths?.expert.intro,
              }
            : undefined
        }
        adapted={adapted}
        sections={playerSections}
      />
    </main>
    </LearnShell>
  );
}
