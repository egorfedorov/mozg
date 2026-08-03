"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { storage } from "@/lib/storage";

/**
 * Deleting a brain is the one action here with no undo, so it asks the owner to
 * type the name. Everything below it — notes, chunks, sources, checks, grants —
 * goes with it through foreign keys; stored objects need removing by hand.
 */
export async function deleteBrain(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await maybeOne<Brain>(
    `select * from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (!brain) return { error: "Brain not found." };

  if (String(formData.get("confirm")).trim() !== brain.title) {
    return { error: `Type "${brain.title}" exactly to confirm.` };
  }

  // Same refusal the admin path makes: people paid for that access, and
  // deleting the brain silently takes what they bought.
  const sold = await maybeOne<{ n: number }>(
    `select count(*)::int as n from purchases where brain_id = $1`,
    [brain.id],
  );
  if (sold && sold.n > 0) {
    return {
      error:
        `This brain has been bought ${sold.n} time${sold.n === 1 ? "" : "s"}, so it cannot ` +
        "be deleted — that would take back something people paid for. Take it off " +
        "sale instead, or ask support to refund the buyers first.",
    };
  }

  const keys = await query<{ storage_key: string }>(
    `select storage_key from sources
      where brain_id = $1 and storage_key is not null`,
    [brain.id],
  );

  await query(`delete from brains where id = $1`, [brain.id]);

  // After the row is gone — a storage hiccup should not leave a half-deleted
  // brain in the database.
  await Promise.all(keys.map((k) => storage.del(k.storage_key).catch(() => {})));

  revalidatePath("/brains");
  redirect("/brains");
}
