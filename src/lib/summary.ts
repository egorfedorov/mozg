import { createHash } from "node:crypto";

/**
 * Category summaries — the pure half of the hierarchical-memory feature.
 *
 * A summary is one short paragraph per category, synthesised from the
 * category's active notes and stored in the `summaries` table (0041). This
 * module holds everything testable: the staleness hash, the one-pass vs
 * map-reduce decision, and which categories need a (re)compile. The LLM
 * calls live in src/worker/summary.ts.
 */

/** Below this a category is small enough to be its own summary. */
export const MIN_SUMMARY_NOTES = 3;

/**
 * One LLM pass vs map-reduce, decided on cost. A single pass over the notes
 * is the better summary — the model sees the whole category and can actually
 * synthesise rather than concatenate — and it is cheap: the extract-tier
 * model reads ~40 average notes (well under 10k input tokens) for a fraction
 * of a cent. Past SINGLE_PASS_LIMIT the input starts to dominate the call and
 * the tail notes get less attention, so the work splits into map batches
 * whose partial summaries are then reduced with one more call.
 */
export const SINGLE_PASS_LIMIT = 40;
export const MAP_BATCH = 25;

/** Same recipe as the lesson hash: a summary rebuilds when its material does. */
export function summaryNotesHash(notes: { id: string; title: string; body: string }[]): string {
  return createHash("sha256")
    .update(notes.map((n) => n.id + n.title + n.body).join("\n"))
    .digest("hex");
}

/**
 * The notes split into LLM calls: one batch means a single pass, several
 * mean map-reduce (one partial summary per batch, then a reduce pass).
 */
export function summaryBatches<T>(notes: T[]): T[][] {
  if (notes.length <= SINGLE_PASS_LIMIT) return [notes];
  const out: T[][] = [];
  for (let i = 0; i < notes.length; i += MAP_BATCH) {
    out.push(notes.slice(i, i + MAP_BATCH));
  }
  return out;
}

/**
 * Diff the categories a brain currently has against the summaries on file.
 *
 * compile: categories with enough notes whose hash moved (or which have no
 *   summary yet). prune: summaries whose category emptied or shrank below
 *   the minimum — keeping them would serve a map of territory that no
 *   longer exists.
 */
export function staleSummaryCategories(
  current: { category: string; hash: string; count: number }[],
  existing: { category: string; hash: string }[],
): { compile: string[]; prune: string[] } {
  const byCategory = new Map(current.map((c) => [c.category, c]));
  const compile = current
    .filter((c) => {
      if (c.count < MIN_SUMMARY_NOTES) return false;
      const e = existing.find((x) => x.category === c.category);
      return !e || e.hash !== c.hash;
    })
    .map((c) => c.category);
  const prune = existing
    .filter((e) => {
      const c = byCategory.get(e.category);
      return !c || c.count < MIN_SUMMARY_NOTES;
    })
    .map((e) => e.category);
  return { compile, prune };
}
