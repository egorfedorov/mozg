import { env } from "@/lib/env";

/**
 * Client for the /rerank endpoint of services/embed (bge-reranker-v2-m3).
 *
 * A cross-encoder reads query and document together, so it ranks pairs far
 * better than the bi-encoder that produced the embeddings — but at per-pair
 * cost, which is why it only ever sees the top of the RRF fusion, never the
 * whole corpus.
 *
 * Everything here degrades to null: the reranker is an optional layer, and a
 * search that falls back to plain RRF beats one that fails.
 */

/**
 * Cross-encoder cost grows with the tokens it reads, and this dominated search
 * latency: measured on production, 25 candidates of ~1400 chars cost 14s, the
 * same 25 at 400 chars cost 3s. The pattern held at every size we tried, which
 * makes document length — not candidate count — the knob that matters.
 *
 * 400 chars is roughly 100 tokens, and it clips less than it sounds: the average
 * chunk in production is 323 chars, so most pairs arrive whole. The judgement
 * being made here is "is this passage about the query", not "does it contain the
 * answer" — the answer is read from the full note afterwards.
 *
 * lazy: if a long note's relevance ever hides past this cut, score
 * `title + first 400 chars` rather than raising the cap for every pair.
 */
export const MAX_DOC_CHARS = 400;

/** Trim a document to what the reranker can usefully read. */
export function clipDocument(text: string): string {
  return text.length <= MAX_DOC_CHARS ? text : text.slice(0, MAX_DOC_CHARS);
}

export interface RerankScore {
  index: number;
  score: number;
}

/**
 * Reorder `items` by rerank scores and keep the top `limit`. The service
 * returns results sorted, but this sorts again rather than trusting the wire —
 * and drops scores pointing outside the array, because a corrupt response
 * should cost us the rerank, not the search.
 */
export function applyRerank<T>(items: T[], scores: RerankScore[], limit: number): T[] {
  const valid = scores.filter(
    (s) => Number.isInteger(s.index) && s.index >= 0 && s.index < items.length,
  );
  valid.sort((a, b) => b.score - a.score);
  return valid.slice(0, limit).map((s) => items[s.index]);
}

/**
 * Score documents against a query. Null when the reranker is not there —
 * service down, model weights not fetched (503), an older service without the
 * endpoint (404), or a malformed body; the caller then falls back to RRF.
 */
export async function rerank(
  queryText: string,
  documents: string[],
): Promise<RerankScore[] | null> {
  if (!documents.length) return null;
  try {
    const res = await fetch(`${env.RERANK_URL}/rerank`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        query: queryText,
        documents: documents.map(clipDocument),
        top_n: documents.length,
      }),
      // A search call is interactive, so unlike ingest's 120s embed timeout
      // this gives up fast: a slow reranker is as good as a dead one. Eight
      // seconds is roughly twice the measured cost of a full candidate set, so
      // it only fires when the service is genuinely contended — and then RRF
      // order in 8s beats perfect order in 30, by which time the agent has
      // given up on us.
      signal: AbortSignal.timeout(8_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { results?: unknown };
    if (!Array.isArray(json.results)) return null;
    return json.results as RerankScore[];
  } catch {
    return null;
  }
}
