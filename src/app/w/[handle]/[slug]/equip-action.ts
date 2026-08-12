"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";
import { purchaseBrain, purchasePack } from "@/lib/money";
import { packBySlug } from "@/lib/packs";
import { brainsIn } from "@/lib/pack-brains";
import { offerFor, packFor } from "@/lib/route-cost";
import { shelfFor } from "@/lib/route-shelf";
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
 * What it buys is worked out by lib/route-cost.ts from the shelf
 * lib/route-shelf.ts resolves, and never posted from the form: a pack where
 * the pack is cheaper than its parts, the brain on its own where it is not,
 * and free ones straight onto the shelf. Every price is read inside the
 * transaction that charges it. Partial success is normal and reported: four
 * shelved, one short of balance is a useful answer, and refunding the four to
 * make it atomic would help nobody.
 */
export async function equipRoute(_prev: unknown, formData: FormData) {
  const handle = String(formData.get("handle") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=${encodeURIComponent(`/w/${handle}/${slug}`)}`);

  const w = await findWorkflow(`${handle}/${slug}`, user.id);
  if (!w) return { error: "That route is not available." };

  const shelf = await shelfFor(w.steps, user.id);
  if (!shelf.brains.length && !shelf.unknown.length) {
    return { error: "This route names no brains." };
  }

  const offer = offerFor(
    shelf.missing.map((b) => ({
      slug: b.slug,
      parentSlug: b.parent_slug,
      priceCents: b.price_cents,
    })),
  );

  const short: string[] = [];

  /**
   * The packs first, and if one of them fails, its brains are simply not
   * bought.
   *
   * Both halves of that are bugs this had. Buying the parts first meant a
   * balance that covered the pack went on its contents and then could not
   * reach the pack that was cheaper. And a pack that failed for want of
   * balance used to fall through to the per-brain loop, which charged $19 at
   * a time for what the pack held: somebody who could not afford $99 was
   * billed five times at a worse rate, ran out anyway, and still had a route
   * that would not run. The offer said "the pack", and the offer is the only
   * thing this button may charge for.
   */
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
      shelf.packsHeld.push(pack.slug);
    } else if (res.reason === "already-owned") {
      shelf.packsHeld.push(pack.slug);
    } else {
      short.push(`${pack.title} ($${(pack.priceCents / 100).toFixed(2)})`);
    }
  }

  let added = 0;
  let bought = 0;

  for (const b of shelf.brains) {
    // Whatever the offer routed through a pack is never also bought singly —
    // the pack shelved it inside its own transaction if it went through, and
    // stranded it if it did not. Either way this loop has no business
    // charging for it at the higher price.
    if (packFor(offer, b.slug)) continue;

    if (!b.held && b.price_cents > 0) {
      const res = await purchaseBrain({
        brainId: b.id,
        buyerId: user.id,
        sellerId: b.owner_id,
      });
      if (res.ok) bought++;
      else if (res.reason === "insufficient") {
        short.push(`${b.slug} ($${(b.price_cents / 100).toFixed(2)})`);
      }
      continue;
    }

    // Free, or already open by a grant: onto the shelf so it turns up in
    // /brains and resolves from a bare slug in an agent.
    if (!b.shelved && b.owner_id !== user.id) {
      await query(
        `insert into library (user_id, brain_id) values ($1, $2) on conflict do nothing`,
        [user.id, b.id],
      );
      added++;
    }
  }

  revalidatePath(`/w/${handle}/${slug}`);
  revalidatePath("/settings/packs");
  revalidatePath("/brains");

  const got = [
    boughtPacks.length && `${boughtPacks.length} pack${boughtPacks.length > 1 ? "s" : ""}`,
    bought && `${bought} bought`,
    added && `${added} added to your shelf`,
  ].filter(Boolean);

  // An unresolvable name is not something money fixes, so it is reported
  // separately from the bill — and it still keeps the route closed.
  const unresolved = shelf.unknown.length
    ? ` Still not runnable: ${shelf.unknown.join(", ")} — no public brain answers to that name; ask the route's author.`
    : "";

  if (short.length) {
    return {
      error:
        `Not enough balance for: ${short.join(", ")}.` +
        (got.length ? ` The rest is done: ${got.join(", ")}.` : "") +
        " Top up at mozg.sh/settings/balance and press this again — nothing already " +
        "paid for is charged twice, and nothing inside a pack you could not buy was " +
        "bought separately at the higher price." +
        unresolved,
    };
  }

  return {
    ok: true as const,
    message:
      (got.length
        ? `Ready: ${got.join(", ")}.`
        : "Everything this route needs was already on your shelf.") + unresolved,
  };
}
