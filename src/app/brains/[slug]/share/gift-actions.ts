"use server";

import { randomBytes } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, one, query } from "@/db";
import { currentUser } from "@/lib/session";

/**
 * Gift links: the owner mints a link with N uses; each redeem writes an
 * ordinary viewer grant. Capped small — a hundred-use link is a free tier
 * wearing a bow, and that decision deserves the pricing page, not a loophole.
 */

const MAX_USES = 25;

export async function createGiftLink(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await maybeOne<{ id: string }>(
    `select id from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (!brain) return;

  const uses = Math.min(MAX_USES, Math.max(1, Number(formData.get("uses") ?? 5)));
  await one(
    `insert into gift_links (brain_id, code, uses_left, created_by)
     values ($1, $2, $3, $4) returning id`,
    [brain.id, randomBytes(9).toString("base64url"), uses, user.id],
  );
  revalidatePath(`/brains/${slug}/share`);
}

export async function revokeGiftLink(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await query(
    `delete from gift_links g using brains b
      where g.id = $1 and b.id = g.brain_id and b.owner_id = $2`,
    [String(formData.get("id")), user.id],
  );
  revalidatePath(`/brains/${String(formData.get("slug"))}/share`);
}
