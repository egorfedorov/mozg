/**
 * Exams from real search failures — the pure half.
 *
 * The calls table records every brain_search (query, result count, and since
 * 0042 the top fused score). A weak call — no results, or a best hit only one
 * retriever weakly agreed with — is a gap report from a real caller. This
 * module normalises and clusters those queries; src/worker/search-gaps.ts
 * does the SQL and turns the top clusters into exam checks.
 */

/**
 * What "weak" means for a non-empty result. The fused score is RRF with
 * K=60: rank 1 in both retrievers scores 2/61 ≈ 0.033, rank 1 in only one
 * scores 1/61 ≈ 0.016. Below 0.02 the best hit was surfaced by a single leg
 * at a good rank, or by both legs badly — in practice an answer the agent
 * should not have trusted. Heuristic on purpose: notes.weight (0.5-2.0)
 * multiplies the score, so no threshold is exact, and a borderline call that
 * slips in costs one extra exam check, not a wrong answer.
 */
export const WEAK_TOP_SCORE = 0.02;

/** Shorter than this after normalisation, a query carries no signal. */
export const MIN_QUERY_LENGTH = 12;

/**
 * Lowercase, punctuation and symbols to spaces, whitespace collapsed. "How
 * do I reset a webhook?" and "how do i reset a webhook" must land in one
 * cluster — callers retry the same question with cosmetic differences, and
 * the retry count is the demand signal.
 */
export function normalizeQuery(q: string): string {
  return q
    .toLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export interface QueryCluster {
  /** The most recent raw query of the cluster — becomes the check's question. */
  representative: string;
  /** How many weak calls asked this. The demand ranking. */
  count: number;
  /**
   * How many DIFFERENT people asked it — the part that separates demand from
   * one person's project. See clusterQueries.
   */
  callers: number;
}

/** A weak call, as the harvest reads it. */
export interface WeakCall {
  query: string;
  callerId: string;
}

/**
 * Cluster weak queries by their normalised text (exact match after
 * normalisation — deliberately simple; embeddings would cluster "webhook
 * retries" with "webhook idempotency", which are different gaps).
 *
 * Input is expected most-recent-first, so the representative of a cluster is
 * its freshest phrasing. Sorted by demand, most-asked first.
 */
export function clusterQueries(calls: (string | WeakCall)[]): QueryCluster[] {
  const clusters = new Map<string, QueryCluster & { seen: Set<string> }>();
  for (const call of calls) {
    const raw = typeof call === "string" ? call : call.query;
    const caller = typeof call === "string" ? "" : call.callerId;
    const key = normalizeQuery(raw);
    if (key.length < MIN_QUERY_LENGTH) continue;
    const existing = clusters.get(key);
    if (existing) {
      existing.count++;
      existing.seen.add(caller);
      existing.callers = existing.seen.size;
    } else {
      clusters.set(key, {
        representative: raw.trim().slice(0, 500),
        count: 1,
        callers: 1,
        seen: new Set([caller]),
      });
    }
  }
  // Most people first, then most times. A question five people asked once
  // outranks one somebody asked five times, which is the whole correction.
  return [...clusters.values()]
    .map((c) => ({ representative: c.representative, count: c.count, callers: c.callers }))
    .sort((a, b) => b.callers - a.callers || b.count - a.count);
}
