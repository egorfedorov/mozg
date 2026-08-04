import { z } from "zod";
import { query, maybeOne } from "@/db";
import { env } from "@/lib/env";
import { structured } from "@/lib/claude";
import { contentHash } from "@/lib/page";

/**
 * The lesson compiler. Notes are written for retrieval — atomic, unordered,
 * no narrative — which is right for an agent and spartan for a person. One
 * cheap editor pass per module fixes the gap: order the notes from
 * foundations to detail, group them into named sections, and write two
 * sentences of connective tissue per section. The notes' text itself is
 * never rewritten — the editor arranges, the material stays the material
 * that passed the exam.
 */

const lessonShape = z.object({
  intro: z.string().min(1).transform((s) => s.slice(0, 600)),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).transform((s) => s.slice(0, 120)),
        lead: z.string().min(1).transform((s) => s.slice(0, 400)),
        note_ids: z.array(z.string()),
      }),
    )
    .min(1),
});

export type LessonPayload = z.infer<typeof lessonShape>;

const SCHEMA = {
  type: "object",
  properties: {
    intro: {
      type: "string",
      description: "2-3 sentences: what this module teaches and why it matters for the goal.",
    },
    sections: {
      type: "array",
      items: {
        type: "object",
        properties: {
          heading: { type: "string", description: "Short section title, plain words." },
          lead: {
            type: "string",
            description: "1-2 sentences bridging into this section — why it comes now.",
          },
          note_ids: {
            type: "array",
            items: { type: "string" },
            description: "The ids of the notes this section teaches, in teaching order.",
          },
        },
        required: ["heading", "lead", "note_ids"],
        additionalProperties: false,
      },
    },
  },
  required: ["intro", "sections"],
  additionalProperties: false,
} as const;

export function notesHash(notes: { id: string; title: string; body: string }[]): string {
  return contentHash(notes.map((n) => n.id + n.title + n.body).join("\n"));
}

export async function compileLesson(brainId: string, category: string): Promise<string> {
  const notes = await query<{ id: string; title: string; body: string }>(
    `select id, title, body from notes
      where brain_id = $1 and status = 'active'
        and coalesce(category, 'general') = $2
      order by created_at limit 200`,
    [brainId, category],
  );
  if (!notes.length) return "empty";

  const hash = notesHash(notes);
  const existing = await maybeOne<{ notes_hash: string }>(
    `select notes_hash from lessons where brain_id = $1 and category = $2`,
    [brainId, category],
  );
  if (existing?.notes_hash === hash) return "current";

  const goal = await maybeOne<{ goal: string | null }>(
    `select goal from brains where id = $1`,
    [brainId],
  );

  const { data: raw } = await structured<unknown>({
    model: env.MODEL_EXTRACT,
    toolName: "arrange_lesson",
    toolDescription: "Save the lesson plan. Call once with the full arrangement.",
    schema: SCHEMA,
    system:
      "You are a course editor. You receive atomic reference notes from a " +
      "knowledge base and arrange them into a teachable lesson.\n\n" +
      "Rules:\n" +
      "- Order from foundations to detail: a reader must never need a later " +
      "note to understand an earlier one.\n" +
      "- Group into 2-6 named sections; every section lead says in plain " +
      "words why this comes now.\n" +
      "- Include EVERY note id exactly once. Do not invent ids, do not drop " +
      "notes — if a note fits nowhere, it goes in the closest section.\n" +
      "- You arrange; you never rewrite the notes themselves.",
    content: [
      {
        type: "text",
        text:
          (goal?.goal ? `The brain's goal:\n${goal.goal}\n\n` : "") +
          `Module: ${category}\n\nNotes:\n` +
          notes.map((n) => `[${n.id}]\n${n.title}\n${n.body}`).join("\n\n"),
      },
    ],
  });

  const parsed = lessonShape.safeParse(raw);
  if (!parsed.success) throw new Error("lesson compile schema mismatch");

  // The editor is graded on completeness here, not trusted: unknown ids are
  // dropped, missed notes are appended as a final section, duplicates keep
  // their first placement.
  const valid = new Set(notes.map((n) => n.id));
  const seen = new Set<string>();
  const sections = parsed.data.sections
    .map((s) => ({
      ...s,
      note_ids: s.note_ids.filter((id) => valid.has(id) && !seen.has(id) && (seen.add(id), true)),
    }))
    .filter((s) => s.note_ids.length > 0);
  const missed = notes.filter((n) => !seen.has(n.id)).map((n) => n.id);
  if (missed.length) {
    sections.push({ heading: "Also in this module", lead: "The remaining notes.", note_ids: missed });
  }

  await query(
    `insert into lessons (brain_id, category, notes_hash, payload, model)
     values ($1, $2, $3, $4, $5)
     on conflict (brain_id, category) do update set
       notes_hash = excluded.notes_hash, payload = excluded.payload,
       model = excluded.model, created_at = now()`,
    [brainId, category, hash, { intro: parsed.data.intro, sections }, env.MODEL_EXTRACT],
  );
  return "compiled";
}
