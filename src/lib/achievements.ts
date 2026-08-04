import { query } from "@/db";

/**
 * Learner achievements — the durable half of the course-page duel. The
 * "did they win" check itself is pure (beatTheAgent in lib/learn.ts); this
 * file only remembers the first crossing so the badge survives the brain
 * re-sitting its exam and climbing back ahead.
 */

export const BEAT_THE_AGENT = "beat_the_agent";

/** When this person first earned the achievement on this brain, if ever. */
export async function achievementAt(
  userId: string,
  brainId: string,
  kind: string = BEAT_THE_AGENT,
): Promise<Date | null> {
  const rows = await query<{ achieved_at: Date }>(
    `select achieved_at from achievements
      where user_id = $1 and brain_id = $2 and kind = $3`,
    [userId, brainId, kind],
  );
  return rows[0]?.achieved_at ?? null;
}

/**
 * Record the first crossing. `on conflict do nothing` keeps it idempotent —
 * the course page calls this on render whenever the duel reads as won.
 */
export async function recordAchievement(
  userId: string,
  brainId: string,
  kind: string = BEAT_THE_AGENT,
): Promise<void> {
  await query(
    `insert into achievements (user_id, brain_id, kind) values ($1, $2, $3)
     on conflict (user_id, brain_id, kind) do nothing`,
    [userId, brainId, kind],
  );
}

/** Every brain this person holds the achievement on — the shelf's badges. */
export async function achievedBrainIds(
  userId: string,
  kind: string = BEAT_THE_AGENT,
): Promise<Set<string>> {
  const rows = await query<{ brain_id: string }>(
    `select brain_id from achievements where user_id = $1 and kind = $2`,
    [userId, kind],
  );
  return new Set(rows.map((r) => r.brain_id));
}
