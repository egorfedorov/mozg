import { z } from "zod";
import { maybeOne, query } from "@/db";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";
import {
  MIN_SUMMARY_NOTES,
  staleSummaryCategories,
  summaryBatches,
  summaryNotesHash,
} from "@/lib/summary";

/**
 * The summary compiler (feature: hierarchical memory).
 *
 * brain_brief answers "what does this brain know?" from category names and
 * note counts — a table of contents with no plot. This job writes the plot:
 * one short paragraph per category, synthesised from its active notes, which
 * the brief renders before anything else.
 *
 * Lazy like the lesson compiler: nothing runs on a schedule. brain_brief
 * enqueues this when the brain's content moved after the newest summary
 * (see summariesStale), and the per-category notes hash then decides which
 * summaries actually recompile — a category whose material did not move
 * costs one SQL read and zero model calls.
 *
 * Summaries are notes about notes, so they live in their own table (0041),
 * not in `notes`: the lesson compiler and learn pages read every active note
 * of a category, and search runs over note chunks — a summary stored as a
 * note would leak into all three.
 */

interface NoteRow {
  id: string;
  title: string;
  body: string;
  category: string;
}

/** Read cap per category — the same order-of-magnitude the exam reads. */
const MAX_NOTES_READ = 1500;
/** Categories compiled per job. A bound on spend per lazy trigger. */
const COMPILE_CAP = 6;

const summaryShape = z.object({
  summary: z.string().min(1).transform((s) => s.slice(0, 1200)),
});

const SUMMARY_SCHEMA = {
  type: "object",
  properties: {
    summary: {
      type: "string",
      description:
        "3-5 sentences: what this category of the brain covers, the key facts " +
        "and rules it holds, and the words it uses for them.",
    },
  },
  required: ["summary"],
  additionalProperties: false,
} as const;

const SYSTEM =
  "You summarise one category of a knowledge base that AI coding agents " +
  "search before answering. The summary is shown to an agent deciding " +
  "whether and how to search this category.\n\n" +
  "Write 3-5 plain sentences: what the category covers, the specific facts, " +
  "values and rules it holds, and the vocabulary the notes use. Do not " +
  "editorialise, do not say 'this category' — state the knowledge. Never " +
  "invent facts that are not in the notes.";

/** One LLM pass over a set of notes (or, in the map step, over one batch). */
async function synthesizePass(
  category: string,
  goal: string | null,
  notes: { title: string; body: string }[],
  partial: boolean,
): Promise<{ body: string; costCents: number }> {
  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE,
    maxTokens: 2000,
    toolName: "save_summary",
    toolDescription: "Save the category summary. Call once.",
    schema: SUMMARY_SCHEMA,
    system:
      SYSTEM +
      (partial
        ? "\n\nThese notes are one batch of a larger category — summarise " +
          "what this batch holds; a later pass merges the batches."
        : ""),
    content: [
      {
        type: "text",
        text:
          (goal ? `The brain's goal:\n${goal}\n\n` : "") +
          `Category: ${category}\n\nNotes:\n` +
          notes.map((n) => `- ${n.title}: ${n.body}`).join("\n"),
      },
    ],
  });

  const parsed = summaryShape.safeParse(raw);
  if (!parsed.success) throw new Error("summary schema mismatch");
  return { body: parsed.data.summary, costCents: costCents(env.MODEL_JUDGE, usage) };
}

/**
 * Single pass for ordinary categories, map-reduce past SINGLE_PASS_LIMIT —
 * the cost reasoning lives with the constants in lib/summary.ts.
 */
async function synthesize(
  category: string,
  goal: string | null,
  notes: { title: string; body: string }[],
): Promise<{ body: string; costCents: number }> {
  const batches = summaryBatches(notes);
  if (batches.length === 1) return synthesizePass(category, goal, batches[0], false);

  let cost = 0;
  const partials = await Promise.all(
    batches.map((b) => synthesizePass(category, goal, b, true)),
  );
  for (const p of partials) cost += p.costCents;

  const reduced = await synthesizePass(
    category,
    goal,
    partials.map((p, i) => ({ title: `part ${i + 1}`, body: p.body })),
    false,
  );
  return { body: reduced.body, costCents: cost + reduced.costCents };
}

export interface SummaryReport {
  compiled: number;
  current: number;
  pruned: number;
  costCents: number;
}

/**
 * Recompile the stale summaries of one brain. Idempotent and hash-gated:
 * on an unchanged brain this is two reads and no model calls.
 */
export async function compileSummaries(brainId: string): Promise<SummaryReport> {
  const notes = await query<NoteRow>(
    `select id, title, body, coalesce(category, 'general') as category
       from notes where brain_id = $1 and status = 'active'
       order by created_at limit ${MAX_NOTES_READ}`,
    [brainId],
  );

  const byCategory = new Map<string, NoteRow[]>();
  for (const n of notes) {
    byCategory.set(n.category, [...(byCategory.get(n.category) ?? []), n]);
  }
  const current = [...byCategory.entries()].map(([category, ns]) => ({
    category,
    hash: summaryNotesHash(ns),
    count: ns.length,
  }));

  const existing = await query<{ category: string; notes_hash: string }>(
    `select category, notes_hash from summaries where brain_id = $1`,
    [brainId],
  );
  const plan = staleSummaryCategories(
    current,
    existing.map((e) => ({ category: e.category, hash: e.notes_hash })),
  );

  const report: SummaryReport = {
    compiled: 0,
    current: current.filter(
      (c) => c.count >= MIN_SUMMARY_NOTES && !plan.compile.includes(c.category),
    ).length,
    pruned: 0,
    costCents: 0,
  };

  for (const category of plan.prune) {
    await query(`delete from summaries where brain_id = $1 and category = $2`, [
      brainId,
      category,
    ]);
    report.pruned++;
  }

  const goal = await maybeOne<{ goal: string | null }>(
    `select goal from brains where id = $1`,
    [brainId],
  );

  for (const category of plan.compile.slice(0, COMPILE_CAP)) {
    const ns = byCategory.get(category)!;
    const { body, costCents: cost } = await synthesize(category, goal?.goal ?? null, ns);
    report.costCents += cost;
    await query(
      `insert into summaries (brain_id, category, notes_hash, body, note_count, model)
       values ($1, $2, $3, $4, $5, $6)
       on conflict (brain_id, category) do update set
         notes_hash = excluded.notes_hash, body = excluded.body,
         note_count = excluded.note_count, model = excluded.model,
         created_at = now()`,
      [brainId, category, summaryNotesHash(ns), body, ns.length, env.MODEL_JUDGE],
    );
    report.compiled++;
  }

  return report;
}

/**
 * The cheap half of lazy compilation, called from brain_brief: does the
 * brain have material newer than its newest summary? One indexed read, no
 * hashes — the per-category hash check happens in the worker, off the
 * request path.
 */
export async function summariesStale(brainId: string): Promise<boolean> {
  const row = await maybeOne<{ changed_at: Date | null; compiled_at: Date | null }>(
    `select b.content_changed_at as changed_at,
            (select max(s.created_at) from summaries s where s.brain_id = b.id) as compiled_at
       from brains b where b.id = $1`,
    [brainId],
  );
  if (!row?.changed_at) return false;
  return !row.compiled_at || row.changed_at > row.compiled_at;
}
