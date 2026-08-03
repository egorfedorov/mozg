"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { one, query, maybeOne } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { slugify } from "@/lib/brains";
import { TOPIC_KEYS } from "@/lib/topics";

const PLAN_BRAIN_LIMIT = { free: 1, pro: 20, team: 100 } as const;

const createSchema = z.object({
  title: z.string().trim().min(1, "Give the brain a name").max(80),
  goal: z.string().trim().max(4000).optional(),
  // An unknown topic is a stale form, not something worth an error message.
  topic: z.string().catch("other").transform((t) => (TOPIC_KEYS.includes(t) ? t : "other")),
});

export async function createBrain(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const parsed = createSchema.safeParse({
    title: formData.get("title"),
    goal: formData.get("goal") || undefined,
    topic: formData.get("topic") ?? "other",
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0].message };
  }

  const { count } = await one<{ count: number }>(
    `select count(*)::int as count from brains where owner_id = $1`,
    [user.id],
  );
  const limit = PLAN_BRAIN_LIMIT[user.plan];
  if (count >= limit) {
    return {
      error:
        user.plan === "free"
          ? "The free plan holds one brain. Upgrade to add more."
          : `You have reached ${limit} brains on the ${user.plan} plan.`,
    };
  }

  // Slugs are per-owner, so only disambiguate against this user's brains.
  const base = slugify(parsed.data.title);
  let slug = base;
  for (let i = 2; i < 50; i++) {
    const taken = await maybeOne(
      `select 1 from brains where owner_id = $1 and slug = $2`,
      [user.id, slug],
    );
    if (!taken) break;
    slug = `${base}-${i}`.slice(0, 39);
  }

  const brain = await one<Brain>(
    `insert into brains (owner_id, slug, title, goal, topic)
     values ($1, $2, $3, $4, $5) returning *`,
    [user.id, slug, parsed.data.title, parsed.data.goal ?? null, parsed.data.topic],
  );

  revalidatePath("/brains");
  redirect(`/brains/${brain.slug}`);
}

export async function updateGoal(brainId: string, goal: string) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await query(`update brains set goal = $3 where id = $1 and owner_id = $2`, [
    brainId,
    user.id,
    goal.trim() || null,
  ]);
  revalidatePath("/brains");
}
