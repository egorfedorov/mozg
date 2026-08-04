/**
 * The collective search, made of pure parts so the API route, the /collective
 * page and the tests share one definition of what an answer looks like.
 *
 * One query fans out over every public brain; the results come back grouped
 * by the brain that answered, with attribution — a result doubles as a
 * catalogue entry, which is the point of the feature: search is the
 * storefront.
 */

/** The slice of a search hit the grouping needs — SearchHit satisfies it. */
export interface CollectiveHit {
  brain_slug: string;
  title: string;
  excerpt: string;
  score: number;
}

/** Who a brain belongs to, for the /b/[handle]/[slug] link. */
export interface CollectiveBrain {
  slug: string;
  handle: string;
  title: string;
}

export interface CollectiveAnswer {
  title: string;
  snippet: string;
}

export interface CollectiveResult {
  handle: string;
  slug: string;
  title: string;
  answers: CollectiveAnswer[];
}

/**
 * A chunk's text, trimmed to a preview line: whitespace folded, cut on a word
 * boundary when it is anywhere near the cap (a mid-word cut reads like a
 * bug, not a clip).
 */
export function clipSnippet(text: string, max = 220): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const boundary = cut.lastIndexOf(" ");
  return (boundary > max * 0.6 ? cut.slice(0, boundary) : cut).trimEnd() + "…";
}

/**
 * Ranked hits in, attributed brains out. First-seen order keeps the search
 * ranking; a brain offers at most `perBrain` answers (deduped by note title
 * — two chunks of one note are one answer), and the page gets at most
 * `maxBrains` brains so one huge brain cannot fill the board alone.
 */
export function groupHitsByBrain(
  hits: CollectiveHit[],
  brains: CollectiveBrain[],
  perBrain = 2,
  maxBrains = 5,
): CollectiveResult[] {
  const bySlug = new Map(brains.map((b) => [b.slug, b]));
  const grouped = new Map<string, CollectiveResult>();

  for (const hit of hits) {
    const brain = bySlug.get(hit.brain_slug);
    if (!brain) continue;
    let entry = grouped.get(brain.slug);
    if (!entry) {
      entry = { handle: brain.handle, slug: brain.slug, title: brain.title, answers: [] };
      grouped.set(brain.slug, entry);
    }
    if (entry.answers.length >= perBrain) continue;
    if (entry.answers.some((a) => a.title === hit.title)) continue;
    entry.answers.push({ title: hit.title, snippet: clipSnippet(hit.excerpt) });
  }

  return [...grouped.values()].slice(0, maxBrains);
}

/**
 * A soft per-key throttle for public endpoints — collective search pays for
 * embeddings on every call, so a script cannot be allowed to loop it.
 *
 * In memory on purpose: unlike the DB-backed user limits (rate-limit.ts)
 * this guards money only in the aggregate, the keys are anonymous IPs with
 * no table to live in, and the worst case of a restart is a fresh window —
 * acceptable for a limit whose job is to stop loops, not to win races.
 */
export function createIpLimiter(opts: {
  max: number;
  windowMs: number;
  now?: () => number;
}): (key: string) => boolean {
  const { max, windowMs } = opts;
  const now = opts.now ?? (() => Date.now());
  const hits = new Map<string, number[]>();

  return (key) => {
    const t = now();
    // Bound the map: a spray of one-off IPs must not grow it forever.
    if (hits.size > 10_000) {
      for (const [k, ts] of hits) {
        if (ts.every((x) => t - x >= windowMs)) hits.delete(k);
      }
    }
    const recent = (hits.get(key) ?? []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    return true;
  };
}
