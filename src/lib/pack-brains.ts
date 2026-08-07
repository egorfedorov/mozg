import { query } from "@/db";
import type { Pack } from "@/lib/packs";

/**
 * The live catalogue behind a pack. One query, used by the index and by the
 * pack page, so the two can never disagree about what is in one.
 */

export interface PackBrain {
  id: string;
  slug: string;
  title: string;
  goal: string | null;
  score: number | null;
  note_count: number;
  handle: string | null;
  parent: string | null;
}

export async function brainsIn(pack: Pack): Promise<PackBrain[]> {
  return query<PackBrain>(
    `select b.id, b.slug, b.title, b.goal, b.score, b.note_count, u.handle, p.slug as parent
       from brains b
       left join "user" u on u.id = b.owner_id
       left join brains p on p.id = b.parent_id
      where b.visibility = 'public'
        and (b.slug = any($1) or p.slug = any($1) or b.slug = any($2))
      order by b.score desc nulls last`,
    [pack.parents, pack.loose],
  );
}

export interface PackStats {
  brains: number;
  notes: number;
  /** Median rather than mean: one unscored newcomer should not move it. */
  median: number | null;
}

export function statsOf(brains: PackBrain[]): PackStats {
  const scored = brains.filter((b) => b.score !== null).map((b) => b.score!);
  scored.sort((a, b) => a - b);
  return {
    brains: brains.length,
    notes: brains.reduce((n, b) => n + b.note_count, 0),
    median: scored.length ? scored[Math.floor(scored.length / 2)] : null,
  };
}
