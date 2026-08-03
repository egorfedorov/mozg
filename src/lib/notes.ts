import { query } from "@/db";
import type { Note } from "@/db/types";

/**
 * Looking inside a brain.
 *
 * A flat list of notes answers "what is in here" and nothing else. The
 * questions an owner actually has are "which parts of my goal are covered",
 * "am I storing the same fact four times", and "what did this used to say" —
 * so the shape here is by category, with the exam result attached, plus the
 * duplicates and the history that a flat list hides.
 */

export interface CategoryGroup {
  category: string;
  notes: number;
  /** Latest exam result for this category, when there is one. */
  passed: number | null;
  total: number | null;
  state: "pass" | "partial" | "fail" | "unexamined";
}

/**
 * Categories with their coverage. Left-joined both ways on purpose: a category
 * the exam asks about but nothing covers is the most useful row on the screen,
 * and an inner join would hide exactly that one.
 */
export async function categoryGroups(brainId: string): Promise<CategoryGroup[]> {
  const rows = await query<{
    category: string;
    notes: number;
    passed: number | null;
    total: number | null;
  }>(
    `with latest as (
       select id from check_runs
        where brain_id = $1 and status = 'done'
        order by started_at desc limit 1
     ),
     counted as (
       select coalesce(category, 'uncategorised') as category, count(*)::int as notes
         from notes
        where brain_id = $1 and status = 'active'
        group by 1
     ),
     examined as (
       select c.category,
              count(r.passed) filter (where r.passed)::int as passed,
              count(*)::int as total
         from checks c
         join latest l on true
         join check_results r on r.check_id = c.id and r.run_id = l.id
        where c.brain_id = $1 and c.enabled
        group by c.category
     )
     select coalesce(counted.category, examined.category) as category,
            coalesce(counted.notes, 0) as notes,
            examined.passed, examined.total
       from counted full outer join examined on examined.category = counted.category
      order by
        case when examined.total is null then 1 else 0 end,
        coalesce(examined.passed, 0)::float / nullif(examined.total, 0) nulls first,
        coalesce(counted.notes, 0) desc`,
    [brainId],
  );

  return rows.map((r) => ({
    category: r.category,
    notes: r.notes,
    passed: r.passed,
    total: r.total,
    state:
      r.total === null
        ? "unexamined"
        : r.passed === r.total
          ? "pass"
          : r.passed === 0
            ? "fail"
            : "partial",
  }));
}

export interface DuplicatePair {
  a: Pick<Note, "id" | "title" | "body" | "category" | "created_at">;
  b: Pick<Note, "id" | "title" | "body" | "category" | "created_at">;
  distance: number;
}

/**
 * Notes that say close to the same thing.
 *
 * Ingest already refuses to add a near-identical note, but pairs still
 * accumulate: two sources describing the same rule in different words, an
 * agent writing down what a screenshot already said, a page re-read after it
 * changed. Left alone they crowd the search results and make the brain look
 * fuller than it is.
 *
 * lazy: a self-join over chunks, so it is O(n²) within one brain and the query
 * is capped. Fine to a few thousand notes; index it or move to a clustering
 * pass if brains get much larger than that.
 */
const NEAR = 0.12;

export async function duplicatePairs(
  brainId: string,
  limit = 20,
): Promise<DuplicatePair[]> {
  const rows = await query<{
    a_id: string;
    a_title: string;
    a_body: string;
    a_category: string | null;
    a_created: string;
    b_id: string;
    b_title: string;
    b_body: string;
    b_category: string | null;
    b_created: string;
    distance: number;
  }>(
    `with pairs as (
       select x.note_id as a_id, y.note_id as b_id,
              min(x.embedding <=> y.embedding) as distance
         from chunks x
         join chunks y
           on y.brain_id = x.brain_id and y.note_id > x.note_id
         -- Filter inside the self-join, not after it: pairing every chunk of
         -- a dead note against everything else is the expensive part, and the
         -- outer filter used to pay for it and then throw the pairs away.
         join notes xa on xa.id = x.note_id and xa.status = 'active'
         join notes yb on yb.id = y.note_id and yb.status = 'active'
        where x.brain_id = $1 and (x.embedding <=> y.embedding) < $2
        group by 1, 2
        order by 3
        limit $3
     )
     select p.distance,
            a.id as a_id, a.title as a_title, a.body as a_body,
            a.category as a_category,
            to_char(a.created_at at time zone 'UTC', 'YYYY-MM-DD') as a_created,
            b.id as b_id, b.title as b_title, b.body as b_body,
            b.category as b_category,
            to_char(b.created_at at time zone 'UTC', 'YYYY-MM-DD') as b_created
       from pairs p
       join notes a on a.id = p.a_id
       join notes b on b.id = p.b_id
      order by p.distance`,
    [brainId, NEAR, limit],
  );

  return rows.map((r) => ({
    distance: Number(r.distance),
    a: {
      id: r.a_id,
      title: r.a_title,
      body: r.a_body,
      category: r.a_category,
      created_at: r.a_created as unknown as Date,
    },
    b: {
      id: r.b_id,
      title: r.b_title,
      body: r.b_body,
      category: r.b_category,
      created_at: r.b_created as unknown as Date,
    },
  }));
}

export interface HistoryNote {
  id: string;
  title: string;
  body: string;
  reason: string | null;
  at: string | null;
  replaced_by_title: string | null;
}

/** What the brain used to say, and why it stopped saying it. */
export async function supersededNotes(
  brainId: string,
  limit = 30,
): Promise<HistoryNote[]> {
  return query<HistoryNote>(
    `select n.id, n.title, n.body,
            coalesce(n.superseded_reason, 'replaced by a closer note') as reason,
            to_char(coalesce(n.superseded_at, n.created_at) at time zone 'UTC',
                    'YYYY-MM-DD') as at,
            r.title as replaced_by_title
       from notes n
       left join notes r on r.id = n.superseded_by
      where n.brain_id = $1 and n.status = 'superseded'
      order by coalesce(n.superseded_at, n.created_at) desc
      limit $2`,
    [brainId, limit],
  );
}

/** Categories in use, for the recategorise control. */
export async function categoryNames(brainId: string): Promise<string[]> {
  const rows = await query<{ category: string }>(
    `select distinct category from notes
      where brain_id = $1 and category is not null and status = 'active'
      union
     select distinct category from checks where brain_id = $1 and enabled
      order by 1`,
    [brainId],
  );
  return rows.map((r) => r.category);
}
