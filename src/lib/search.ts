import { query, toVector } from "@/db";
import { embedQuery } from "@/lib/embed";
import { toTsQuery } from "@/lib/tsquery";

/**
 * Hybrid retrieval: vector + full-text, fused with Reciprocal Rank Fusion.
 *
 * RRF combines the two rankings without needing their scores to be on the same
 * scale — cosine distance and ts_rank never are, and calibrating them against
 * each other is a tuning job that never ends. Ranks are comparable by
 * construction, so there is nothing to tune.
 *
 * lazy: no cross-encoder rerank yet. Add bge-reranker-v2-m3 over the top-30
 * once the exam shows retrieval is what's capping the score.
 */

/** RRF damping. 60 is the value from the original paper and behaves well. */
const K = 60;
const CANDIDATES = 30;

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
): Promise<{ hits: SearchHit[]; degraded: boolean }> {
  const ids = Array.isArray(brainIds) ? brainIds : [brainIds];
  const limit = Math.min(Math.max(opts.limit ?? 8, 1), 25);
  const text = q.trim();
  if (!text) return { hits: [], degraded: false };

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
         and ((select cat from params) is null or n.category = (select cat from params))
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
         and ((select cat from params) is null or n.category = (select cat from params))
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
    select f.id as chunk_id, f.note_id, n.title, n.category, n.kind,
           c.content as excerpt, f.score::text, f.in_vec, f.in_fts,
           b.slug as brain_slug, b.title as brain_title
      from fused f
      join chunks c on c.id = f.id
      join notes n on n.id = f.note_id
      join brains b on b.id = n.brain_id
     order by f.score desc
     limit $5
    `,
    [ids, vector, toTsQuery(text), opts.category ?? null, limit],
  );

  return {
    degraded,
    hits: rows.map((r) => ({
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
    })),
  };
}

/**
 * Compact map of a brain, for the agent to read before searching: what it
 * covers, in what words, and — just as usefully — what it is known to be
 * missing.
 */
export interface BrainBrief {
  goal: string | null;
  noteCount: number;
  categories: { name: string; notes: number }[];
  sampleTitles: string[];
  knownGaps: string[];
}

export async function briefBrain(brainId: string): Promise<BrainBrief> {
  const [goalRow, categories, titles, gaps] = await Promise.all([
    query<{ goal: string | null; note_count: number }>(
      `select goal, note_count from brains where id = $1`,
      [brainId],
    ),
    query<{ name: string; notes: number }>(
      `select coalesce(category, 'uncategorised') as name, count(*)::int as notes
         from notes where brain_id = $1 and status = 'active'
        group by 1 order by 2 desc limit 20`,
      [brainId],
    ),
    query<{ title: string }>(
      `select title from notes where brain_id = $1 and status = 'active'
        order by created_at desc limit 12`,
      [brainId],
    ),
    // Categories the latest exam could not answer — the agent should know not
    // to trust the brain here, and say so rather than guess.
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
        group by c.category
       having count(*) filter (where r.passed) = 0`,
      [brainId],
    ),
  ]);

  return {
    goal: goalRow[0]?.goal ?? null,
    noteCount: goalRow[0]?.note_count ?? 0,
    categories,
    sampleTitles: titles.map((t) => t.title),
    knownGaps: gaps.map((g) => g.category),
  };
}
