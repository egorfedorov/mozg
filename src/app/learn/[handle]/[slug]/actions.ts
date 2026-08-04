"use server";

import { currentUser } from "@/lib/session";
import { canRead } from "@/lib/access";
import { maybeOne, query } from "@/db";
import { schedule, type Grade } from "@/lib/learn";

/**
 * Record one graded card. The scheduling itself is pure (lib/learn); this is
 * the read-modify-write around it. Guarded by canRead so progress rows can
 * only exist for brains this person could open anyway.
 */
export async function gradeCard(input: {
  brainId: string;
  kind: "note" | "check";
  itemId: string;
  grade: Grade;
}): Promise<{ dueInMs: number } | { error: string }> {
  const user = await currentUser();
  const userId = user?.id;
  if (!userId) return { error: "sign in" };
  if (!["again", "good", "easy"].includes(input.grade)) return { error: "bad grade" };
  if (!(await canRead(input.brainId, userId))) return { error: "no access" };

  const prev = await maybeOne<{
    interval_days: number;
    ease: number;
    reps: number;
    lapses: number;
  }>(
    `select interval_days, ease, reps, lapses from learn_progress
      where user_id = $1 and kind = $2 and item_id = $3`,
    [userId, input.kind, input.itemId],
  );

  const next = schedule(
    {
      intervalDays: prev?.interval_days ?? 0,
      ease: prev?.ease ?? 2.5,
      reps: prev?.reps ?? 0,
      lapses: prev?.lapses ?? 0,
    },
    input.grade,
  );

  await query(
    `insert into learn_progress
       (user_id, brain_id, kind, item_id, due_at, interval_days, ease, reps, lapses, updated_at)
     values ($1, $2, $3, $4, now() + ($5 || ' milliseconds')::interval, $6, $7, $8, $9, now())
     on conflict (user_id, kind, item_id) do update set
       due_at = excluded.due_at, interval_days = excluded.interval_days,
       ease = excluded.ease, reps = excluded.reps, lapses = excluded.lapses,
       updated_at = now()`,
    [
      userId,
      input.brainId,
      input.kind,
      input.itemId,
      String(next.dueInMs),
      next.intervalDays,
      next.ease,
      next.reps,
      next.lapses,
    ],
  );

  return { dueInMs: next.dueInMs };
}
