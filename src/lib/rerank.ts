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

/**
 * Below this the cross-encoder is saying the passage does not answer the
 * question.
 *
 * Measured against the live service rather than reasoned about, twice, after
 * two wrong guesses. bge-reranker-v2-m3 behind this deployment returns
 * SIGMOID-normalised scores in 0..1, not the raw logits the model emits — so a
 * threshold of zero, which is the model's own boundary, can never fire.
 *
 * The real separation is enormous. One query, "how do I write a Playwright
 * test that runs on webkit", against two passages:
 *
 *   the Playwright note   0.851
 *   a PixiJS note         0.00011
 *
 * 0.1 sits three orders of magnitude above the irrelevant one and eight times
 * below the relevant one, so it is nowhere near either edge.
 */
export const RERANK_IRRELEVANT = 0.1;

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
export function applyRerank<T extends object>(
  items: T[],
  scores: RerankScore[],
  limit: number,
): (T & { rerank: number })[] {
  const valid = scores.filter(
    (s) => Number.isInteger(s.index) && s.index >= 0 && s.index < items.length,
  );
  valid.sort((a, b) => b.score - a.score);
  // The cross-encoder's own score rides along. It used to be dropped here, and
  // it is the only number in the pipeline that means "this passage answers
  // this question" — RRF ranks are relative to the candidate set, so a fused
  // score cannot tell a good answer from the best of five bad ones. Measured:
  // asking a PixiJS brain a Playwright question fused to 0.0274 against a
  // median of 0.0320, indistinguishable, while a cross-encoder rates that pair
  // far below anything it considers relevant.
  return valid.slice(0, limit).map((s) => ({ ...items[s.index], rerank: s.score }));
}

/**
 * Keep only what the cross-encoder considers an answer to this query.
 *
 * Separate from applyRerank, which stays a pure reorder: this one is a
 * judgement about the corpus — a brain that holds nothing on a subject must
 * return nothing rather than its least-unrelated passages.
 */
export function keepRelevant<T extends { rerank: number }>(hits: T[]): T[] {
  return hits.filter((h) => h.rerank >= RERANK_IRRELEVANT);
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
