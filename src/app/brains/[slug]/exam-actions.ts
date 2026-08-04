"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { enqueueExam } from "@/worker/queue";
import { setGoal } from "@/lib/goal";
import { rateLimited } from "@/lib/rate-limit";

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
  const { changed } = await setGoal(brain.id, goal);

  revalidatePath(`/brains/${slug}`);
  return { ok: true as const, requeued: changed && Boolean(goal) };
}

/**
 * A check the owner wrote by hand. It outlives goal rewrites (setGoal only
 * clears generated checks) — this is "my agent must know this", straight from
 * the person who knows what matters.
 */
export async function addCheck(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain) return;

  // The form marks both required; empty here means someone bypassed it, and
  // silently not inserting is the right answer to that.
  const question = String(formData.get("question") ?? "").trim().slice(0, 500);
  const expect = String(formData.get("expect") ?? "").trim().slice(0, 500);
  if (!question || !expect) return;

  await query(
    `insert into checks (brain_id, category, question, expect, weight, origin)
     values ($1, 'Owner checks', $2, $3, 3, 'manual')`,
    [brain.id, question, expect],
  );

  revalidatePath(`/brains/${slug}`);
}

export async function removeCheck(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain) return;

  // Only manual ones: deleting a generated check silently skews the score,
  // and the honest way to drop those is "New questions".
  await query(
    `delete from checks where id = $1 and brain_id = $2 and origin = 'manual'`,
    [String(formData.get("id")), brain.id],
  );
  revalidatePath(`/brains/${slug}`);
}

export async function runExamNow(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await ownedBrain(slug, user.id);
  if (!brain?.goal) return;

  // An exam run is a batch of Anthropic calls on the platform's bill, so the
  // button cannot be a free retry loop.
  if (await rateLimited(user.id, "exam", 5)) return;

  if (formData.get("regenerate") === "1") {
    await query(`delete from checks where brain_id = $1 and origin = 'generated'`, [
      brain.id,
    ]);
  }

  await enqueueExam(brain.id);
  revalidatePath(`/brains/${slug}`);
}
