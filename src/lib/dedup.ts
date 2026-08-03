import { pool, toVector } from "@/db";

/**
 * "Does the brain already know this?" — the write-time duplicate check.
 *
 * Lives in one place because three paths need the same answer with the same
 * threshold: ingest (per extracted note, inside its transaction), brain_write
 * (before an agent's lesson becomes searchable), and anything future that
 * writes notes. Two copies of the threshold would drift, and the drift would
 * show up as duplicates that one path catches and another waves through.
 */

/**
 * Cosine distance below this means "the brain already knows this" — a
 * similarity of ~0.93, tuned to catch near-copies while letting the same fact
 * phrased differently through (that band is the consolidation pass's job,
 * which deliberately uses a looser threshold; see worker/consolidate.ts).
 */
export const DUPLICATE_DISTANCE = 0.07;

export interface DuplicateMatch {
  note_id: string;
  title: string;
  distance: number;
}

/**
 * The slice of pg's Pool/PoolClient this needs, so the check can run inside
 * an open transaction (ingest must see the notes it inserted earlier in the
 * same batch — they are uncommitted at that point) as easily as against the
 * pool.
 */
interface Queryable {
  query<T extends object>(text: string, params: unknown[]): Promise<{ rows: T[] }>;
}

/**
 * Closest active note to a new note's leading chunk — that's where title and
 * first sentence live, which is what makes two notes "the same fact". Returns
 * null when nothing is close enough to call a repeat.
 */
export async function findDuplicateNote(
  brainId: string,
  leadingVector: number[],
  db: Queryable = pool,
): Promise<DuplicateMatch | null> {
  const { rows } = await db.query<{ note_id: string; title: string; distance: number }>(
    `select c.note_id, n.title, (c.embedding <=> $2::vector) as distance
       from chunks c
       join notes n on n.id = c.note_id
      where c.brain_id = $1 and n.status = 'active'
      order by c.embedding <=> $2::vector
      limit 1`,
    [brainId, toVector(leadingVector)],
  );

  const hit = rows[0];
  if (!hit || Number(hit.distance) >= DUPLICATE_DISTANCE) return null;
  return { note_id: hit.note_id, title: hit.title, distance: Number(hit.distance) };
}
