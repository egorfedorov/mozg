"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { exists, maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { gateFor, hasPaid } from "@/lib/paywall";

/**
 * A review is a buyer's word, verified: the same gate that unlocks reading
 * decides who may rate. Free brains take reviews from anyone who added them —
 * a free brain's currency is attention, and its readers are its buyers.
 */
export async function submitReview(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const brain = await maybeOne<Brain>(
    `select b.* from brains b join "user" u on u.id = b.owner_id
      where u.handle = $1 and b.slug = $2 and b.visibility = 'public'`,
    [String(formData.get("handle")), String(formData.get("slug"))],
  );
  if (!brain) return { error: "That brain is not available." };
  if (brain.owner_id === user.id) return { error: "Reviewing your own brain would fool nobody." };

  const gate = await gateFor(brain);
  if (gate && !(await hasPaid(gate, user.id))) {
    return { error: "Reviews are for buyers — the paywall and the rating share one gate." };
  }
  if (!gate) {
    // Free brain: require it in the reader's library at least.
    const added = await exists(
      `select 1 from library where user_id = $1 and brain_id = $2`,
      [user.id, brain.id],
    );
    if (!added) return { error: "Add the brain first — review what you actually use." };
  }

  const rating = Math.min(5, Math.max(1, Number(formData.get("rating") ?? 0)));
  if (!rating) return { error: "Pick a rating." };
  const body = String(formData.get("body") ?? "").trim().slice(0, 600);

  await query(
    `insert into reviews (brain_id, buyer_id, rating, body)
     values ($1, $2, $3, $4)
     on conflict (brain_id, buyer_id)
       do update set rating = $3, body = $4, created_at = now()`,
    [brain.id, user.id, rating, body],
  );

  revalidatePath(`/b/${formData.get("handle")}/${brain.slug}`);
  return { ok: true as const };
}
