"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { enqueueExam } from "@/worker/queue";

async function ownedBrain(slug: string, userId: string): Promise<Brain | null> {
  return maybeOne<Brain>(`select * from brains where owner_id = $1 and slug = $2`, [
    userId,
    slug,
  ]);
}

export async function saveGoal(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain) return { error: "Brain not found." };

  const goal = String(formData.get("goal") ?? "").trim().slice(0, 4000);
  const changed = goal !== (brain.goal ?? "");

  await query(`update brains set goal = $2, updated_at = now() where id = $1`, [
    brain.id,
    goal || null,
  ]);

  // The goal *is* the exam. Changing it invalidates every generated check, so
  // clear them and let the next run write a new set rather than grading the
  // brain against a goal it no longer has.
  if (changed && goal) {
    await query(`delete from checks where brain_id = $1 and origin = 'generated'`, [
      brain.id,
    ]);
    await query(`update brains set score = null, score_at = null where id = $1`, [
      brain.id,
    ]);
    await enqueueExam(brain.id);
  }

  revalidatePath(`/brains/${slug}`);
  return { ok: true as const, requeued: changed && Boolean(goal) };
}

export async function runExamNow(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain?.goal) return;

  if (formData.get("regenerate") === "1") {
    await query(`delete from checks where brain_id = $1 and origin = 'generated'`, [
      brain.id,
    ]);
  }

  await enqueueExam(brain.id);
  revalidatePath(`/brains/${slug}`);
}
