const MAX_TERMS = 12;

/**
 * Build a Postgres tsquery from a natural-language question.
 *
 * Not plainto_tsquery: it ANDs every token, and our 'simple' text-search config
 * keeps stopwords, so "how long are transitions" demands a note containing
 * "how" and "are" — which means sentence-shaped questions match nothing. Agents
 * ask in sentences, so that is every real query.
 *
 * OR the terms instead and let ts_rank_cd sort them; RRF restores precision on
 * the other side of the fusion. `:*` adds prefix matching, which buys crude
 * morphology in both English and Russian (transition/transitions,
 * отступ/отступы) without committing to a per-language stemmer.
 *
 * Pure on purpose — no env, no database — so it is testable on its own.
 */
export function toTsQuery(input: string): string | null {
  const terms = input
    .toLowerCase()
    // Strip anything that is not a letter or digit: to_tsquery is picky about
    // its operators, and this text comes from an agent.
    .replace(/[^\p{L}\p{N}\s]+/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length >= 2)
    .slice(0, MAX_TERMS);

  if (!terms.length) return null;
  return [...new Set(terms)].map((w) => `${w}:*`).join(" | ");
}
