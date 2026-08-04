import { z } from "zod";
import { createHash } from "node:crypto";
import { query, maybeOne } from "@/db";
import { env } from "@/lib/env";
import { costCents, structured } from "@/lib/claude";
import { recordSpend } from "@/lib/spend";
import { contentHash } from "@/lib/page";

/**
 * The lesson compiler. Notes are written for retrieval — atomic, unordered,
 * no narrative — which is right for an agent and spartan for a person. One
 * cheap editor pass per module fixes the gap: order the notes from
 * foundations to detail, group them into named sections, and write two
 * sentences of connective tissue per section. The notes' text itself is
 * never rewritten — the editor arranges, the material stays the material
 * that passed the exam.
 *
 * When the module has exam questions (checks), they are the lesson's
 * skeleton: section order follows the questions and each section teaches
 * the reader to answer its own. check_ids is optional so lessons compiled
 * before this still parse and render as they always did. The same editor
 * pass also writes the connective text in two extra registers (eli5 and
 * expert, stored under depths); notes are never rewritten, and a payload
 * without depths renders as standard.
 */

const depthShape = z.object({
  intro: z.string().min(1).transform((s) => s.slice(0, 600)),
  leads: z.array(z.string().min(1).transform((s) => s.slice(0, 400))),
});

export const lessonShape = z.object({
  intro: z.string().min(1).transform((s) => s.slice(0, 600)),
  sections: z
    .array(
      z.object({
        heading: z.string().min(1).transform((s) => s.slice(0, 120)),
        lead: z.string().min(1).transform((s) => s.slice(0, 400)),
        note_ids: z.array(z.string()),
        check_ids: z.array(z.string()).optional(),
      }),
    )
    .min(1),
  // Alternate voices for the connective text only — intro and section leads
  // in an eli5 and an expert register, leads[i] matching sections[i]. The
  // notes themselves are never rewritten. Optional, so lessons compiled
  // before depths existed keep parsing and render as standard.
  depths: z.object({ eli5: depthShape, expert: depthShape }).optional(),
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
          check_ids: {
            type: "array",
            items: { type: "string" },
            description:
              "The ids of the exam questions this section teaches the reader to answer. " +
              "Omit only if no question fits this section.",
          },
        },
        required: ["heading", "lead", "note_ids"],
        additionalProperties: false,
      },
    },
  },
  depths: {
    type: "object",
    description:
      "The same connective text in two extra voices. leads[i] rewrites sections[i].lead; " +
      "same facts, only the register changes.",
    properties: {
      eli5: {
        type: "object",
        description: "For a bright child: short words, a concrete analogy, no jargon.",
        properties: {
          intro: { type: "string" },
          leads: { type: "array", items: { type: "string" } },
        },
        required: ["intro", "leads"],
        additionalProperties: false,
      },
      expert: {
        type: "object",
        description: "For a practitioner: terse, technical, assumes the background.",
        properties: {
          intro: { type: "string" },
          leads: { type: "array", items: { type: "string" } },
        },
        required: ["intro", "leads"],
        additionalProperties: false,
      },
    },
    required: ["eli5", "expert"],
    additionalProperties: false,
  },
  required: ["intro", "sections", "depths"],
  additionalProperties: false,
} as const;

export function notesHash(
  notes: { id: string; title: string; body: string }[],
  checks: { id: string; question: string }[] = [],
): string {
  const base = notes.map((n) => n.id + n.title + n.body).join("\n");
  // No checks → the historical notes-only hash, so check-less modules keep
  // their compiled lessons. With checks the questions join the key: a changed
  // exam recompiles the lesson, and pre-skeleton lessons recompile once.
  if (!checks.length) return contentHash(base);
  return contentHash(base + "\n--checks--\n" + checks.map((c) => c.id + c.question).join("\n"));
}

/**
 * A section's identity for learn_progress, whose item_id is a uuid: md5 of
 * what makes the section itself — its module, heading, and the notes it
 * teaches, in order — formatted as a uuid. Deterministic, so the study page
 * and the review queue derive the same key without any extra storage; a
 * recompiled lesson that regroups the same notes honestly gets new keys.
 */
export function sectionKey(brainId: string, category: string, heading: string, noteIds: string[]): string {
  const hex = createHash("md5")
    .update([brainId, category, heading, ...noteIds].join("\n"))
    .digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/**
 * Section → quiz assignment, pure so the study page can be tested through it.
 * Each section with usable check_ids gets its first not-yet-assigned question,
 * asked right after the section's last note. Returns last-note-id → check-id.
 */
export function sectionQuizzes(
  sections: { note_ids: string[]; check_ids?: string[] }[],
  validChecks: Set<string>,
): Map<string, string> {
  const assigned = new Set<string>();
  const quizAt = new Map<string, string>();
  for (const s of sections) {
    const lastNote = s.note_ids[s.note_ids.length - 1];
    const check = s.check_ids?.find((id) => validChecks.has(id) && !assigned.has(id));
    if (lastNote && check) {
      assigned.add(check);
      quizAt.set(lastNote, check);
    }
  }
  return quizAt;
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

  // The module's exam questions — the same short list the study page closes
  // with. They are the lesson's skeleton: each section teaches its question.
  const checks = await query<{ id: string; question: string }>(
    `select id, question from checks
      where brain_id = $1 and enabled and coalesce(category, 'general') = $2
      order by weight desc limit 6`,
    [brainId, category],
  );

  const hash = notesHash(notes, checks);
  const existing = await maybeOne<{ notes_hash: string }>(
    `select notes_hash from lessons where brain_id = $1 and category = $2`,
    [brainId, category],
  );
  if (existing?.notes_hash === hash) return "current";

  const goal = await maybeOne<{ goal: string | null }>(
    `select goal from brains where id = $1`,
    [brainId],
  );

  const { data: raw, usage } = await structured<unknown>({
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
      "- You arrange; you never rewrite the notes themselves.\n" +
      "- Finally, rewrite the intro and every section lead in two extra " +
      "voices (depths): eli5 for a bright child, expert for a practitioner. " +
      "depths.eli5.leads[i] and depths.expert.leads[i] must match " +
      "sections[i] exactly — same facts, only the register changes." +
      (checks.length
        ? "\n- This module's exam questions are listed below. They are the " +
          "lesson skeleton: section order follows the question order, and " +
          "each section teaches the reader to answer its question(s). Put the " +
          "ids of the questions a section covers in its check_ids; cover " +
          "every question exactly once."
        : ""),
    content: [
      {
        type: "text",
        text:
          (goal?.goal ? `The brain's goal:\n${goal.goal}\n\n` : "") +
          `Module: ${category}\n\nNotes:\n` +
          notes.map((n) => `[${n.id}]\n${n.title}\n${n.body}`).join("\n\n") +
          (checks.length
            ? `\n\nExam questions (teach to these):\n` +
              checks.map((c) => `[${c.id}] ${c.question}`).join("\n")
            : ""),
      },
    ],
  });

  await recordSpend("lesson", costCents(env.MODEL_EXTRACT, usage), {
    brainId,
    model: env.MODEL_EXTRACT,
  });

  const parsed = lessonShape.safeParse(raw);
  if (!parsed.success) throw new Error("lesson compile schema mismatch");

  // The editor is graded on completeness here, not trusted: unknown ids are
  // dropped, missed notes are appended as a final section, duplicates keep
  // their first placement. check_ids get the same treatment against the
  // module's checks; a question no section claims is simply asked at the end.
  const valid = new Set(notes.map((n) => n.id));
  const validChecks = new Set(checks.map((c) => c.id));
  const seen = new Set<string>();
  const seenChecks = new Set<string>();
  const sections = parsed.data.sections
    .map((s) => {
      const checkIds = s.check_ids?.filter(
        (id) => validChecks.has(id) && !seenChecks.has(id) && (seenChecks.add(id), true),
      );
      return {
        heading: s.heading,
        lead: s.lead,
        note_ids: s.note_ids.filter((id) => valid.has(id) && !seen.has(id) && (seen.add(id), true)),
        ...(checkIds?.length ? { check_ids: checkIds } : {}),
      };
    })
    .filter((s) => s.note_ids.length > 0);
  const missed = notes.filter((n) => !seen.has(n.id)).map((n) => n.id);
  if (missed.length) {
    sections.push({ heading: "Also in this module", lead: "The remaining notes.", note_ids: missed });
  }

  // Depths are valid only when every lead lines up with a final section —
  // an appended catch-all section or a miscounted array drops the variants,
  // and the lesson simply renders as standard.
  const depths =
    parsed.data.depths &&
    parsed.data.depths.eli5.leads.length === sections.length &&
    parsed.data.depths.expert.leads.length === sections.length
      ? parsed.data.depths
      : undefined;

  await query(
    `insert into lessons (brain_id, category, notes_hash, payload, model)
     values ($1, $2, $3, $4, $5)
     on conflict (brain_id, category) do update set
       notes_hash = excluded.notes_hash, payload = excluded.payload,
       model = excluded.model, created_at = now()`,
    [brainId, category, hash, { intro: parsed.data.intro, sections, ...(depths ? { depths } : {}) }, env.MODEL_EXTRACT],
  );
  return "compiled";
}
