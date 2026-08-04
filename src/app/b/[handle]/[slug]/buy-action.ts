"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne } from "@/db";
import type { Brain } from "@/db/types";
import { currentUser } from "@/lib/session";
import { purchaseBrain } from "@/lib/money";
import { createInvoice } from "@/lib/payments";

/**
 * Buy access to a brain from the account balance.
 *
 * The price is read inside purchaseBrain's own transaction, never from the
 * form and never from this read: a posted price is a number the buyer chose,
 * and a price read here could change before the debit.
 */
/**
 * Direct checkout: one crypto invoice for the full price, and the webhook
 * buys the brain the moment the money confirms. The invoice amount is the
 * brain's CURRENT price — if it changes before payment lands, the purchase
 * still charges the then-current price from the credited balance, and any
 * difference stays on the balance rather than vanishing.
 */
export async function buyWithCrypto(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(String(formData.get("path")))}`);

  const brain = await maybeOne<Brain>(
    `select b.* from brains b join "user" u on u.id = b.owner_id
      where u.handle = $1 and b.slug = $2 and b.visibility = 'public'`,
    [String(formData.get("handle")), String(formData.get("slug"))],
  );
  if (!brain) return { error: "That brain is not available." };
  if (brain.price_cents <= 0) return { error: "This brain is free; nothing to buy." };

  const res = await createInvoice({
    userId: user.id,
    amountCents: brain.price_cents,
    purpose: "buy",
    buyBrainId: brain.id,
  });
  if (!res.ok) {
    return {
      error:
        res.reason === "unconfigured"
          ? "Crypto checkout is not switched on yet — use the balance."
          : res.reason === "amount"
            ? "This price is outside what the gateway accepts — top up the balance instead."
            : `The payment provider did not answer (${res.reason}). Try again shortly.`,
    };
  }
  return { payUrl: res.invoice.payUrl };
}

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
