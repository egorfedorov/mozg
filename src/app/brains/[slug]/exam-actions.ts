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
