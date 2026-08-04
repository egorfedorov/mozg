import { query } from "@/db";
import { byokStorage } from "@/lib/byok";

/**
 * Record what a model call cost us.
 *
 * Extraction and exams keep their cost on the row they belong to; everything
 * else lands here, so "what did today cost" is one query rather than a guess.
 * Calls made on a user's own key are not our spend and are not recorded —
 * counting them would inflate our numbers with money we never paid.
 */
export async function recordSpend(
  kind: string,
  cents: number,
  opts: { brainId?: string; model?: string } = {},
): Promise<void> {
  if (!cents || byokStorage.getStore()) return;
  await query(
    `insert into spend (kind, brain_id, cents, model) values ($1, $2, $3, $4)`,
    [kind, opts.brainId ?? null, cents, opts.model ?? null],
  ).catch(() => {
    // Accounting must never fail the work it is accounting for.
  });
}
