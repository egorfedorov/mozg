import { query, maybeOne } from "@/db";
import { enqueueExam } from "@/worker/queue";

/**
 * Changing a goal, in one place.
 *
 * The goal *is* the exam: it generates the questions the brain is scored
 * against. Editing it without clearing those questions leaves the brain graded
 * on a promise it no longer makes, and the score becomes a number about
 * nothing.
 *
 * This used to live only in the web action, so the seeder could rewrite a goal
 * and leave the old exam in place. Three paths write goals now — the form, the
 * seeder, and MCP — and a rule only one of them applies is not a rule.
 */
export async function setGoal(
  brainId: string,
  goal: string | null,
): Promise<{ changed: boolean }> {
  const before = await maybeOne<{ goal: string | null }>(
    `select goal from brains where id = $1`,
    [brainId],
  );
  const next = goal?.trim() || null;
  const changed = (before?.goal ?? null) !== next;

  await query(`update brains set goal = $2, updated_at = now() where id = $1`, [
    brainId,
    next,
  ]);

  if (!changed) return { changed: false };

  // Only the generated ones: a check written by hand is the owner's own
  // question and outlives a reworded goal.
  await query(`delete from checks where brain_id = $1 and origin = 'generated'`, [brainId]);
  await query(`update brains set score = null, score_at = null where id = $1`, [brainId]);

  if (next) await enqueueExam(brainId);

  return { changed: true };
}
