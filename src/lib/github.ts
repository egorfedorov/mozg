import { createHmac, timingSafeEqual } from "node:crypto";
import { parseGitHubUrl } from "@/lib/crawl";

/**
 * The parts of the push callback worth testing, kept out of the route.
 *
 * Same shape as lib/payments for the same reason: a signature check that only
 * exists inside a Next route handler is a signature check nothing runs in CI,
 * and Node 20's test discovery cannot reach a .ts file under src/app at all.
 */

/** GitHub signs the raw body with HMAC-SHA256, prefixed "sha256=". */
export function validSignature(raw: string, header: string | null, secret: string): boolean {
  if (!header) return false;
  const expected = `sha256=${createHmac("sha256", secret).update(raw).digest("hex")}`;
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on a length mismatch, which would be an exception
  // where a `false` belongs — compare lengths first, answer the same either way.
  return a.length === b.length && timingSafeEqual(a, b);
}

export interface PushEvent {
  ref?: string;
  repository?: { full_name?: string; default_branch?: string };
}

/**
 * Which repository was merged to, or null if this push is not one we act on.
 *
 * Only the default branch: a brain that re-read itself on every feature branch
 * would describe conventions that were never merged.
 */
export function mergedRepo(payload: PushEvent): string | null {
  const repo = payload.repository?.full_name;
  const branch = payload.ref?.replace(/^refs\/heads\//, "");
  if (!repo || !branch) return null;
  return branch === payload.repository?.default_branch ? repo : null;
}

/**
 * Does this crawl root point at that repository?
 *
 * Matched through parseGitHubUrl rather than a SQL `like`: the same repository
 * is written github.com/o/r, /tree/main/sub, or as a raw host, and that
 * function is the one place that already knows all three spellings.
 */
export function rootMatchesRepo(url: string | null, repo: string): boolean {
  return !!url && parseGitHubUrl(url)?.repo === repo;
}
