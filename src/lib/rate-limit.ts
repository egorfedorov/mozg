import { one, query } from "@/db";

/**
 * Per-user throttles for the expensive buttons (exam runs, ingest retries).
 *
 * In the database rather than in memory: these actions spend the platform's
 * Anthropic budget, so the limit has to survive a restart — an in-memory map
 * would reset exactly when a deploy happens, which is when people retry.
 *
 * Soft by design: count-then-insert can be raced by simultaneous clicks, which
 * is acceptable. The point is to stop a stuck button or a scripted loop, not
 * to win a race.
 */
export async function rateLimited(
  userId: string,
  action: string,
  maxPerHour: number,
): Promise<boolean> {
  const { n } = await one<{ n: number }>(
    `select count(*)::int as n from rate_limits
      where user_id = $1 and action = $2 and created_at > now() - interval '1 hour'`,
    [userId, action],
  );
  if (n >= maxPerHour) return true;

  await query(`insert into rate_limits (user_id, action) values ($1, $2)`, [userId, action]);
  return false;
}
