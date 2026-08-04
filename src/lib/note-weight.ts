import { one, query } from "@/db";

/**
 * A note's standing from agent feedback, as one bounded multiplier on its
 * fused RRF score (applied in search.ts).
 *
 * The steps are deliberately asymmetric: a down-flag is only ever filed
 * after the agent checked the note against reality, so one of them costs
 * more than a "this helped" earns. And the clamp does the real work —
 * floored at 0.5 a flagged note sinks but keeps answering (one agent
 * disagreeing must not be able to silence a correct note, the same rule
 * the flag system itself follows), capped at 2.0 a well-liked note rises
 * but cannot crowd out a better textual or vector match.
 *
 * The formula lives here and ONLY here; the column is a cache of it, and
 * the search query just multiplies.
 */

export const WEIGHT_FLOOR = 0.5;
export const WEIGHT_CEIL = 2.0;
/** What one "this note helped" report adds. */
export const UP_STEP = 0.2;
/** What one verified "this note is wrong" report costs. */
export const DOWN_STEP = 0.35;

export function feedbackWeight(ups: number, downs: number): number {
  const raw =
    1 + UP_STEP * Math.max(0, ups) - DOWN_STEP * Math.max(0, downs);
  return Math.min(WEIGHT_CEIL, Math.max(WEIGHT_FLOOR, raw));
}

/**
 * Recompute and store a note's weight from its flags. Called wherever flags
 * are written or removed; returns the new weight so callers can log it.
 */
export async function refreshNoteWeight(noteId: string): Promise<number> {
  const { ups, downs } = await one<{ ups: number; downs: number }>(
    `select count(*) filter (where signal = 'up')::int as ups,
            count(*) filter (where signal = 'down')::int as downs
       from note_flags where note_id = $1`,
    [noteId],
  );
  const weight = feedbackWeight(ups, downs);
  await query(`update notes set weight = $2 where id = $1`, [noteId, weight]);
  return weight;
}
