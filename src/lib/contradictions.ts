import { query } from "@/db";

/**
 * Two brains in one pack, saying different things.
 *
 * A pack is read as if it were one brain: the agent asks the compliance brain,
 * then the RGS brain, and both answer in the same voice with the same
 * confidence. Where they disagree, whichever note ranked first becomes "the
 * answer" — no flag, no second opinion, nothing to tell the reader a choice
 * was even made.
 *
 * The conflicts are found nightly (worker/contradict.ts) and read from here.
 * Deliberately never merged: inside a brain one owner and one exam decide what
 * is true, and consolidation merges accordingly; across brains there is no such
 * authority, so the product move is to publish the disagreement and let the
 * reader see both sides. An agent told "these two disagree about X" can say so.
 * An agent handed one side silently cannot.
 */

interface Row {
  id: string;
  subject: string;
  claim_a: string;
  claim_b: string;
  note_a: string;
  note_b: string;
  title_a: string;
  title_b: string;
  brain_a: string;
  brain_b: string;
  slug_a: string;
  slug_b: string;
  handle_a: string | null;
  handle_b: string | null;
}

/** One conflict, seen from one side of it. */
export interface Side {
  note_id: string;
  title: string;
  claim: string;
  brain: string;
  brain_slug: string;
  /** Owner handle, for a link — null on a brain whose owner has none. */
  handle: string | null;
}

export interface Contradiction {
  id: string;
  subject: string;
  a: Side;
  b: Side;
}

const SELECT = `
  select c.id, c.subject, c.claim_a, c.claim_b, c.note_a, c.note_b,
         na.title as title_a, nb.title as title_b,
         ba.title as brain_a, ba.slug as slug_a, ua.handle as handle_a,
         bb.title as brain_b, bb.slug as slug_b, ub.handle as handle_b
    from contradictions c
    -- Both joins insist on 'active': a note that was superseded or merged
    -- since the judgement is no longer something the brain says, and a
    -- conflict with a retracted claim is noise on a page that trades on being
    -- exact. It comes back on its own if the replacement still disagrees.
    join notes na on na.id = c.note_a and na.status = 'active'
    join notes nb on nb.id = c.note_b and nb.status = 'active'
    join brains ba on ba.id = na.brain_id
    join brains bb on bb.id = nb.brain_id
    left join "user" ua on ua.id = ba.owner_id
    left join "user" ub on ub.id = bb.owner_id
   where c.status = 'open'`;

function shape(r: Row): Contradiction {
  return {
    id: r.id,
    subject: r.subject,
    a: {
      note_id: r.note_a,
      title: r.title_a,
      claim: r.claim_a,
      brain: r.brain_a,
      brain_slug: r.slug_a,
      handle: r.handle_a,
    },
    b: {
      note_id: r.note_b,
      title: r.title_b,
      claim: r.claim_b,
      brain: r.brain_b,
      brain_slug: r.slug_b,
      handle: r.handle_b,
    },
  };
}

/**
 * A conflict turned to face one of its notes: "this is what your hit says,
 * this is what the other brain says".
 *
 * Which of the pair is `a` is an artefact of uuid ordering (the table keeps
 * note_a < note_b so a pair is one row), so every reader that has a note in
 * hand — a search hit, a note being read — has to flip the sides itself.
 * Doing it in one place is the difference between a warning that names the
 * right brain and one that confidently names the reader's own.
 */
export function facing(
  c: Contradiction,
  noteId: string,
): { mine: Side; theirs: Side } | null {
  if (c.a.note_id === noteId) return { mine: c.a, theirs: c.b };
  if (c.b.note_id === noteId) return { mine: c.b, theirs: c.a };
  return null;
}

/** Open conflicts touching any of these notes — the search/read flag. */
export async function contradictionsFor(noteIds: string[]): Promise<Contradiction[]> {
  if (!noteIds.length) return [];
  const rows = await query<Row>(
    `${SELECT} and (c.note_a = any($1::uuid[]) or c.note_b = any($1::uuid[]))
      order by c.judged_at desc`,
    [noteIds],
  );
  return rows.map(shape);
}

/** Open conflicts with both sides inside this set of brains — the pack page. */
export async function contradictionsIn(
  brainIds: string[],
  limit = 20,
): Promise<Contradiction[]> {
  if (brainIds.length < 2) return [];
  const rows = await query<Row>(
    `${SELECT} and na.brain_id = any($1::uuid[]) and nb.brain_id = any($1::uuid[])
      order by c.judged_at desc limit $2`,
    [brainIds, limit],
  );
  return rows.map(shape);
}

/**
 * When the pass last reached these brains, conflict or not.
 *
 * "None found" is only worth printing next to a date. Without one it is
 * indistinguishable from "nobody has looked", which is the claim a page like
 * this must never make by accident.
 */
export async function lastJudgedIn(brainIds: string[]): Promise<string | null> {
  if (!brainIds.length) return null;
  const rows = await query<{ at: string | null }>(
    `select to_char(max(c.judged_at) at time zone 'UTC', 'YYYY-MM-DD') as at
       from contradictions c
       join notes na on na.id = c.note_a
       join notes nb on nb.id = c.note_b
      where na.brain_id = any($1::uuid[]) and nb.brain_id = any($1::uuid[])`,
    [brainIds],
  );
  return rows[0]?.at ?? null;
}
