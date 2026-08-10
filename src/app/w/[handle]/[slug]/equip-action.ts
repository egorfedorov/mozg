"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { purchaseBrain } from "@/lib/money";
import { findWorkflow } from "@/lib/workflow-store";

/**
 * Put everything a route needs on the reader's shelf, in one go.
 *
 * The route itself is not sold, and that is a decision rather than an
 * omission: what costs money to make is the material, the route is the order
 * it is read in, and charging twice for one body of knowledge is how a
 * catalogue loses the trust its scores are meant to earn. A route earns by
 * being the reason somebody buys the brains under it.
 *
 * Free brains land in the library, paid ones go through the same
 * purchaseBrain transaction the brain page uses — the price is read inside
 * that transaction, never from this form. Partial success is normal and
 * reported: four shelved, one short of balance is a useful answer, and
 * refunding the four to make it atomic would help nobody.
 */
export async function equipRoute(_prev: unknown, formData: FormData) {
  const handle = String(formData.get("handle") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/w/${handle}/${slug}`)}`);

  const w = await findWorkflow(`${handle}/${slug}`, user.id);
  if (!w) return { error: "That route is not available." };

  const wanted = [...new Set(w.steps.map((s) => s.brain).filter(Boolean))].map((b) =>
    String(b).split("/").pop()!.toLowerCase(),
  );
  if (!wanted.length) return { error: "This route names no brains." };

  const brains = await query<{
    id: string;
    slug: string;
    owner_id: string;
    price_cents: number;
    owned: boolean;
    shelved: boolean;
  }>(
    `select b.id, b.slug, b.owner_id, b.price_cents,
            exists (select 1 from purchases p
                     where p.brain_id = b.id and p.buyer_id = $2) as owned,
            exists (select 1 from library l
                     where l.brain_id = b.id and l.user_id = $2) as shelved
       from brains b
      where lower(b.slug) = any($1::text[]) and b.visibility = 'public'`,
    [wanted, user.id],
  );

  let added = 0;
  let bought = 0;
  const short: string[] = [];

  for (const b of brains) {
    const mine = b.owner_id === user.id;
    if (b.price_cents > 0 && !b.owned && !mine) {
      const res = await purchaseBrain({
        brainId: b.id,
        buyerId: user.id,
        sellerId: b.owner_id,
      });
      if (res.ok) bought++;
      else if (res.reason === "insufficient") short.push(b.slug);
      continue;
    }
    if (!b.shelved) {
      await query(
        `insert into library (user_id, brain_id) values ($1, $2) on conflict do nothing`,
        [user.id, b.id],
      );
      added++;
    }
  }

  revalidatePath(`/w/${handle}/${slug}`);

  if (short.length) {
    return {
      error:
        `Shelved ${added + bought} of ${brains.length}. Not enough balance for: ` +
        `${short.join(", ")}. Top up at mozg.sh/settings/balance and run this again — ` +
        "nothing already paid for is charged twice.",
    };
  }

  return {
    ok: true as const,
    message:
      bought || added
        ? `Ready: ${bought} bought, ${added} added to your shelf.`
        : "Everything this route needs was already on your shelf.",
  };
}
