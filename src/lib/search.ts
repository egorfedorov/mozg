import { query, toVector } from "@/db";
import { embedQuery } from "@/lib/embed";
import { applyRerank, rerank } from "@/lib/rerank";
import { toTsQuery } from "@/lib/tsquery";
import { normalizeCategory, topLevelCategory } from "@/lib/category";
import {
  groupHitsByBrain,
  type CollectiveBrain,
  type CollectiveResult,
} from "@/lib/collective";

/**
 * Hybrid retrieval: vector + full-text, fused with Reciprocal Rank Fusion,
 * then rescored by a cross-encoder when one is available.
 *
 * RRF combines the two rankings without needing their scores to be on the same
 * scale — cosine distance and ts_rank never are, and calibrating them against
 * each other is a tuning job that never ends. Ranks are comparable by
 * construction, so there is nothing to tune.
 *
 * The reranker (bge-reranker-v2-m3) then reads the query together with each of
 * the top candidates and reorders them — a cross-encoder ranks pairs far
 * better than the bi-encoder behind the vector leg, but at per-pair cost, so
 * it only ever sees RERANK_CANDIDATES. It is optional: weights not fetched or
 * service down means the RRF order is returned as-is.
 */

/** RRF damping. 60 is the value from the original paper and behaves well. */
const K = 60;
const CANDIDATES = 30;
/**
 * How many RRF winners the reranker rescores; also the SQL fetch size.
 *
 * 16 rather than 25 because the service batches 16 pairs at a time: 25 pays for
 * two batches to rescore nine extra candidates that RRF had already ranked
 * below the tenth. Recall past rank 16 is not what wins searches.
 */
const RERANK_CANDIDATES = 16;

export interface SearchHit {
  note_id: string;
  chunk_id: string;
  title: string;
  category: string | null;
  kind: string;
  excerpt: string;
  score: number;
  /** Which retriever(s) surfaced it — useful when debugging a bad answer. */
  via: "vector" | "text" | "both";
  /** Which brain it came from. Only interesting when searching a family. */
  brain_slug: string;
  brain_title: string;
}

export interface SearchOptions {
  limit?: number;
  category?: string | null;
}

/**
 * `brainIds` takes a family: searching a parent reaches its children, so an
 * agent that knows the product name does not need to know how the owner split
 * it up. A single id behaves exactly as before.
 */
export async function searchBrain(
  brainIds: string | string[],
  q: string,
  opts: SearchOptions = {},
): Promise<{ hits: SearchHit[]; degraded: boolean; reranked: boolean }> {
  const ids = Array.isArray(brainIds) ? brainIds : [brainIds];
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 25);
  // Normalised the same way the write paths store it, so an agent asking for
  // "Type scale" finds notes extraction filed as "type scale".
  const category = normalizeCategory(opts.category);
  const text = q.trim();
  if (!text) return { hits: [], degraded: false, reranked: false };

  // A dead embedding service degrades search to full-text instead of failing
  // the agent's tool call. Half an answer beats an error mid-task.
  let vector: string | null = null;
  let degraded = false;
  try {
    vector = toVector(await embedQuery(text));
  } catch {
    degraded = true;
  }

  const rows = await query<{
    chunk_id: string;
    note_id: string;
    title: string;
    category: string | null;
    kind: string;
    excerpt: string;
    score: string;
    in_vec: boolean;
    in_fts: boolean;
    brain_slug: string;
    brain_title: string;
  }>(
    `
    with params as (
      select $2::vector as v,
             case when $3::text is null then null
                  else to_tsquery('simple', $3) end as tsq,
             $4::text as cat
    ),
    vec as (
      select c.id, c.note_id,
             row_number() over (order by c.embedding <=> (select v from params)) as rank
        from chunks c
        join notes n on n.id = c.note_id
       where c.brain_id = any($1::uuid[])
         and n.status = 'active'
         and c.embedding is not null
         and (select v from params) is not null
         and ((select cat from params) is null
              or lower(n.category) = (select cat from params)
              -- A top-level filter reaches its subcategories: "typography"
              -- also matches "typography/scale". lower() covers rows written
              -- before category normalisation existed.
              or lower(n.category) like (select cat from params) || '/%')
       order by c.embedding <=> (select v from params)
       limit ${CANDIDATES}
    ),
    fts as (
      select c.id, c.note_id,
             row_number() over (
               order by ts_rank_cd(c.tsv, (select tsq from params)) desc
             ) as rank
        from chunks c
        join notes n on n.id = c.note_id
       where c.brain_id = any($1::uuid[])
         and n.status = 'active'
         and (select tsq from params) is not null
         and c.tsv @@ (select tsq from params)
         and ((select cat from params) is null
              or lower(n.category) = (select cat from params)
              -- A top-level filter reaches its subcategories: "typography"
              -- also matches "typography/scale". lower() covers rows written
              -- before category normalisation existed.
              or lower(n.category) like (select cat from params) || '/%')
       order by ts_rank_cd(c.tsv, (select tsq from params)) desc
       limit ${CANDIDATES}
    ),
    fused as (
      select id, note_id,
             sum(1.0 / (${K} + rank)) as score,
             bool_or(src = 'v') as in_vec,
             bool_or(src = 'f') as in_fts
        from (
          select id, note_id, rank, 'v' as src from vec
          union all
          select id, note_id, rank, 'f' as src from fts
        ) u
       group by id, note_id
    )
    -- The usage weight enters as a bounded multiplier on the fused RRF
    -- score, not as its own leg: feedback nudges a ranking built from the
    -- query, it never outvotes the query. notes.weight is clamped to
    -- 0.5-2.0 by the schema, so a flagged note sinks but keeps answering
    -- and a well-liked one rises but cannot crowd out a better match.
    -- The reranker after this reorders on query+text alone — the stronger,
    -- query-specific signal — and stays unweighted on purpose.
    select f.id as chunk_id, f.note_id, n.title, n.category, n.kind,
           c.content as excerpt, (f.score * n.weight)::text as score, f.in_vec, f.in_fts,
           b.slug as brain_slug, b.title as brain_title
      from fused f
      join chunks c on c.id = f.id
      join notes n on n.id = f.note_id
      join brains b on b.id = n.brain_id
     order by f.score * n.weight desc
     limit $5
    `,
    // Fetch enough for the rerank pass, not just the final page — the reranker
    // can promote a candidate that RRF put at #20 into the top-N.
    [ids, vector, toTsQuery(text), category, Math.max(limit, RERANK_CANDIDATES)],
  );

  const hits: SearchHit[] = rows.map((r) => ({
    note_id: r.note_id,
    chunk_id: r.chunk_id,
    title: r.title,
    category: r.category,
    kind: r.kind,
    excerpt: r.excerpt,
    score: Number(r.score),
    via: r.in_vec && r.in_fts ? "both" : r.in_vec ? "vector" : "text",
    brain_slug: r.brain_slug,
    brain_title: r.brain_title,
  }));

  // One candidate is already the answer; a dead reranker leaves the RRF order
  // untouched, which the caller reports as "no-rerank" degradation.
  if (hits.length <= 1) return { hits, degraded, reranked: false };

  // Title first: an atomic note's title is the strongest topical signal in it,
  // and the cross-encoder only reads the head of what it is given.
  const scores = await rerank(text, hits.map((h) => `${h.title}\n${h.excerpt}`));
  if (!scores) return { hits: hits.slice(0, limit), degraded, reranked: false };

  return { hits: applyRerank(hits, scores, limit), degraded, reranked: true };
}

/**
 * Compact map of a brain, for the agent to read before searching: what it
 * covers, in what words, and — just as usefully — what it is known to be
 * missing.
 */
export interface BriefSubcategory {
  /** The full category string, e.g. "typography/scale" — pass it to brain_search's category filter as-is. */
  name: string;
  notes: number;
}

export interface BriefCategory {
  /** Top-level segment: "typography" for "typography/scale", or the whole category when it has no "/". */
  name: string;
  /** Notes across the whole group, subcategories included. */
  notes: number;
  children: BriefSubcategory[];
  /** Children beyond the per-group cap — the group is bigger than shown. */
  hiddenChildren: number;
}

export interface BrainBrief {
  goal: string | null;
  noteCount: number;
  /** Auto-synthesised per-category paragraphs (0041) — the brief leads with
   *  these; the category tree below them is the drill-down. Empty until the
   *  lazy compile has run at least once. */
  summaries: { category: string; body: string }[];
  categories: BriefCategory[];
  /** Top-level groups beyond the cap. Nonzero means this is a summary, not the full map. */
  hiddenCategories: number;
  sampleTitles: string[];
  knownGaps: string[];
}

/**
 * Caps keep the brief a map rather than a dump: past a few dozen categories a
 * flat list costs more tokens than the orientation it buys. 200 raw rows is a
 * ceiling on the pathology, not a target — with normalised categories a brain
 * that still grows 200 distinct labels has a vocabulary problem, not a brief
 * problem.
 */
const MAX_CATEGORY_ROWS = 200;
const MAX_CATEGORY_GROUPS = 12;
const MAX_CHILDREN_PER_GROUP = 5;

function groupCategories(rows: { name: string; notes: number }[]): {
  groups: BriefCategory[];
  hidden: number;
} {
  const byTop = new Map<string, { notes: number; children: BriefSubcategory[] }>();
  for (const r of rows) {
    const top = topLevelCategory(r.name);
    let group = byTop.get(top);
    if (!group) {
      group = { notes: 0, children: [] };
      byTop.set(top, group);
    }
    group.notes += r.notes;
    // A category that *is* the top level has no child entry of its own.
    if (r.name !== top) group.children.push({ name: r.name, notes: r.notes });
  }

  const sorted = [...byTop.entries()]
    .map(([name, g]) => ({
      name,
      notes: g.notes,
      children: g.children.sort((a, b) => b.notes - a.notes),
    }))
    .sort((a, b) => b.notes - a.notes);

  const groups = sorted.slice(0, MAX_CATEGORY_GROUPS).map((g) => ({
    ...g,
    hiddenChildren: Math.max(0, g.children.length - MAX_CHILDREN_PER_GROUP),
    children: g.children.slice(0, MAX_CHILDREN_PER_GROUP),
  }));
  return { groups, hidden: sorted.length - groups.length };
}

export async function briefBrain(brainId: string): Promise<BrainBrief> {
  const [goalRow, summaries, categories, titles, gaps] = await Promise.all([
    query<{ goal: string | null; note_count: number }>(
      `select goal, note_count from brains where id = $1`,
      [brainId],
    ),
    // The synthesised map of each category — largest first, capped like the
    // category tree so the brief stays a map rather than a dump.
    query<{ category: string; body: string }>(
      `select category, body from summaries
        where brain_id = $1 order by note_count desc limit 8`,
      [brainId],
    ),
    // Read wide and fold into a tree in code: a "/" in the category makes one
    // branch, and the SQL stays a plain GROUP BY instead of recursive CTE
    // gymnastics for a two-level display.
    query<{ name: string; notes: number }>(
      `select coalesce(lower(category), 'uncategorised') as name, count(*)::int as notes
         from notes where brain_id = $1 and status = 'active'
        group by 1 order by 2 desc limit ${MAX_CATEGORY_ROWS}`,
      [brainId],
    ),
    query<{ title: string }>(
      `select title from notes where brain_id = $1 and status = 'active'
        order by created_at desc limit 12`,
      [brainId],
    ),
    // Categories the latest exam could not answer — the agent should know not
    // to trust the brain here, and say so rather than guess. Negative checks
    // are excluded: failing those means the brain bluffs, not that material
    // is missing, and a bluff is not a gap to fill.
    query<{ category: string }>(
      `with latest as (
         select id from check_runs
          where brain_id = $1 and status = 'done'
          order by started_at desc limit 1
       )
       select c.category
         from checks c
         join check_results r on r.check_id = c.id
        where c.brain_id = $1 and r.run_id = (select id from latest)
          and c.kind = 'positive'
        group by c.category
       having count(*) filter (where r.passed) = 0`,
      [brainId],
    ),
  ]);

  const { groups, hidden } = groupCategories(categories);

  return {
    goal: goalRow[0]?.goal ?? null,
    noteCount: goalRow[0]?.note_count ?? 0,
    summaries,
    categories: groups,
    hiddenCategories: hidden,
    sampleTitles: titles.map((t) => t.title),
    knownGaps: gaps.map((g) => g.category),
  };
}

/**
 * One query against every public brain at once — the working half of
 * /collective and its API. Public brains only, ever: the feature is a shop
 * window, and a private brain in it would be a leak, not a result. Only
 * each brain's OWN notes are searched (the ids themselves, not families) —
 * a private child of a public parent stays out of it too.
 */
export async function searchCollective(
  q: string,
  opts: { topic?: string | null } = {},
): Promise<CollectiveResult[]> {
  // Cap the fan-out: past a hundred brains the vector leg would scan the
  // whole platform for a page that shows five answers.
  const brains = await query<CollectiveBrain & { id: string }>(
    `select b.id, b.slug, b.title, u.handle
       from brains b join "user" u on u.id = b.owner_id
      where b.visibility = 'public' and b.note_count > 0 and u.handle is not null
        and ($1::text is null or b.topic = $1)
      order by b.score desc nulls last, b.note_count desc
      limit 100`,
    [opts.topic ?? null],
  );
  if (!brains.length) return [];

  const { hits } = await searchBrain(brains.map((b) => b.id), q, { limit: 15 });
  return groupHitsByBrain(hits, brains);
}
