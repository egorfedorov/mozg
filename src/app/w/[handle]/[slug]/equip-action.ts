"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { purchaseBrain, purchasePack } from "@/lib/money";
import { packBySlug, packsWith } from "@/lib/packs";
import { packsFor } from "@/lib/pack-access";
import { brainsIn } from "@/lib/pack-brains";
import { offerFor } from "@/lib/route-cost";
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
 * What it buys is worked out by lib/route-cost.ts and never posted from the
 * form: a pack where the pack is cheaper than its parts, the brain on its own
 * where it is not, and free ones straight onto the shelf. Every price is read
 * inside the transaction that charges it. Partial success is normal and
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
    parent_slug: string | null;
    owned: boolean;
    shelved: boolean;
  }>(
    `select b.id, b.slug, b.owner_id, b.price_cents, p.slug as parent_slug,
            exists (select 1 from purchases pu
                     where pu.brain_id = b.id and pu.buyer_id = $2) as owned,
            exists (select 1 from library l
                     where l.brain_id = b.id and l.user_id = $2) as shelved
       from brains b
       left join brains p on p.id = b.parent_id
      where lower(b.slug) = any($1::text[]) and b.visibility = 'public'`,
    [wanted, user.id],
  );

  // Held packs first, so a reader who already bought one is not offered it
  // again and its brains are not counted as anything left to get.
  const packsHeld = (await packsFor(user.id)).map((h) => h.pack);
  const covered = (b: { slug: string; parent_slug: string | null }) =>
    packsWith(b.slug, b.parent_slug).some((p) => packsHeld.includes(p));

  const short: string[] = [];
  const offer = offerFor(
    brains
      .filter((b) => !b.owned && b.owner_id !== user.id && !covered(b))
      .map((b) => ({ slug: b.slug, parentSlug: b.parent_slug, priceCents: b.price_cents })),
  );

  // The packs, before anything is bought one at a time — otherwise a reader
  // whose balance covers the pack pays for its parts first and then cannot
  // afford the pack that would have been cheaper.
  const boughtPacks: string[] = [];
  for (const offered of offer.packs) {
    const pack = packBySlug(offered.slug);
    if (!pack) continue;
    const res = await purchasePack({
      pack: pack.slug,
      buyerId: user.id,
      priceCents: pack.priceCents,
      brainIds: (await brainsIn(pack)).map((b) => b.id),
    });
    if (res.ok) {
      boughtPacks.push(pack.slug);
      packsHeld.push(pack.slug);
    } else if (res.reason === "already-owned") {
      packsHeld.push(pack.slug);
    } else {
      short.push(pack.title);
    }
  }

  let added = 0;
  let bought = 0;

  for (const b of brains) {
    const mine = b.owner_id === user.id;
    if (b.price_cents > 0 && !b.owned && !mine && !covered(b)) {
      const res = await purchaseBrain({
        brainId: b.id,
        buyerId: user.id,
        sellerId: b.owner_id,
      });
      if (res.ok) bought++;
      else if (res.reason === "insufficient") short.push(b.slug);
      continue;
    }
    // A pack purchase shelves what it contains inside its own transaction, so
    // a brain that arrived that way needs nothing here.
    if (!b.shelved && !covered(b)) {
      await query(
        `insert into library (user_id, brain_id) values ($1, $2) on conflict do nothing`,
        [user.id, b.id],
      );
      added++;
    }
  }

  revalidatePath(`/w/${handle}/${slug}`);
  revalidatePath("/settings/packs");

  const gotPacks = boughtPacks.length
    ? `${boughtPacks.length} pack${boughtPacks.length > 1 ? "s" : ""}, `
    : "";

  if (short.length) {
    return {
      error:
        `Not enough balance for: ${short.join(", ")}. ` +
        `The rest is on your shelf (${gotPacks}${bought} bought, ${added} added). ` +
        "Top up at mozg.sh/settings/balance and run this again — nothing already " +
        "paid for is charged twice. The route stays closed until all of it is open.",
    };
  }

  return {
    ok: true as const,
    message:
      boughtPacks.length || bought || added
        ? `Ready: ${gotPacks}${bought} bought, ${added} added to your shelf.`
        : "Everything this route needs was already on your shelf.",
  };
}
