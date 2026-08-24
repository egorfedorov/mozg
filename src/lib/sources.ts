import type { SourceKind } from "@/db/types";

/**
 * Which source kinds are crawl roots rather than material.
 *
 * A root is a URL somebody pasted that expands into many `url` sources — it
 * never produces notes itself, it is queued on the crawl queue instead of the
 * ingest queue, it is re-walked on a schedule, and it must be excluded from
 * every "retry the failed sources" sweep, because retrying a root re-expands
 * the whole tree.
 *
 * There are two of them now (`site` for documentation, `repo` for a codebase)
 * and the difference between them is only what gets read. Thirteen places
 * branched on the string 'site' before the second kind existed; each was a
 * place where a repo root would have been handed to the page ingester and
 * turned into notes about a JSON file. So the question is asked in one place,
 * in both dialects — TypeScript for the code paths, a SQL fragment for the
 * queries — and a third kind changes this file and nothing else.
 */
export const CRAWL_ROOT_KINDS = ["site", "repo"] as const;

export function isCrawlRoot(kind: SourceKind | string): boolean {
  return (CRAWL_ROOT_KINDS as readonly string[]).includes(kind);
}

/** For `where kind in ${CRAWL_ROOTS_SQL}` — literals, never interpolated input. */
export const CRAWL_ROOTS_SQL = `(${CRAWL_ROOT_KINDS.map((k) => `'${k}'`).join(", ")})`;
