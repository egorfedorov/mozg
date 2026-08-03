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
 * Cross-encoder cost grows with document length and the reranker itself is
 * capped at 512 tokens; past ~2000 chars the tail only slows the pair down
 * without changing its score much.
 */
export const MAX_DOC_CHARS = 2000;

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
      // this gives up fast: a slow reranker is as good as a dead one.
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) return null;

    const json = (await res.json()) as { results?: unknown };
    if (!Array.isArray(json.results)) return null;
    return json.results as RerankScore[];
  } catch {
    return null;
  }
}
