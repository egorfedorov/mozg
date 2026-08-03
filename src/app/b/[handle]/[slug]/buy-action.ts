"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { purchaseBrain } from "@/lib/money";

/**
 * Buy access to a brain from the account balance.
 *
 * The price is read inside purchaseBrain's own transaction, never from the
 * form and never from this read: a posted price is a number the buyer chose,
 * and a price read here could change before the debit.
 */
export async function buyBrain(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(String(formData.get("path")))}`);

  const brain = await maybeOne<Brain>(
    `select b.* from brains b join "user" u on u.id = b.owner_id
      where u.handle = $1 and b.slug = $2 and b.visibility = 'public'`,
    [String(formData.get("handle")), String(formData.get("slug"))],
  );
  if (!brain) return { error: "That brain is not available." };

  const result = await purchaseBrain({
    brainId: brain.id,
    buyerId: user.id,
    sellerId: brain.owner_id,
  });

  if (result.ok) {
    revalidatePath(`/b/${formData.get("handle")}/${brain.slug}`);
    return { ok: true as const };
  }

  switch (result.reason) {
    case "insufficient":
      return {
        error: "Not enough on your balance. Top up in settings, then buy.",
        topUp: true as const,
      };
    case "already-owned":
      revalidatePath(`/b/${formData.get("handle")}/${brain.slug}`);
      return { ok: true as const };
    case "own-brain":
      return { error: "This is your brain — you already have it." };
    case "free":
      return { error: "This brain is free; nothing to buy." };
  }
}
