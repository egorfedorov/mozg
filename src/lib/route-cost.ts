import { PACKS, packsWith } from "@/lib/packs";

/**
 * The cheapest honest way to open a route.
 *
 * A workflow is free — it is an order of reading, not material, and charging
 * for the order is charging twice. What costs money is the shelf under it, and
 * the shelf is nearly always most of one pack: quoting the sum of the brains'
 * own prices is not just unfriendly, it is *wrong*, because the same reader can
 * click through to /packs and pay half of it. A page that names a price its own
 * shop beats is the one thing a catalogue selling accuracy cannot do.
 *
 * So the offer is worked out rather than added up: for every pack, if the
 * brains this route is short of that the pack contains cost more apart than the
 * pack costs whole, the pack replaces them. Whatever no pack covers stays
 * priced on its own — an author selling one brain outside every pack still
 * sells it here.
 */

export interface Need {
  slug: string;
  /** The family it belongs to, if any — packs name families as well as brains. */
  parentSlug: string | null;
  priceCents: number;
}

export interface OfferedPack {
  slug: string;
  title: string;
  priceCents: number;
  /** The needed brains this pack opens — not everything in it. */
  covers: string[];
}

export interface RouteOffer {
  packs: OfferedPack[];
  /** Paid brains no pack made cheaper, still bought one at a time. */
  brains: Need[];
  totalCents: number;
}

export function offerFor(missing: Need[]): RouteOffer {
  let left = missing.filter((n) => n.priceCents > 0);
  const packs: OfferedPack[] = [];

  for (const p of PACKS) {
    const covered = left.filter((n) => packsWith(n.slug, n.parentSlug).includes(p.slug));
    if (!covered.length) continue;
    const apart = covered.reduce((n, b) => n + b.priceCents, 0);
    // Ties go to the pack: at the same money it opens more, and it carries
    // seats. Only a pack that costs strictly more than the parts loses.
    if (p.priceCents > apart) continue;
    packs.push({
      slug: p.slug,
      title: p.title,
      priceCents: p.priceCents,
      covers: covered.map((c) => c.slug),
    });
    const taken = new Set(covered.map((c) => c.slug));
    left = left.filter((n) => !taken.has(n.slug));
  }

  return {
    packs,
    brains: left,
    totalCents:
      packs.reduce((n, p) => n + p.priceCents, 0) +
      left.reduce((n, b) => n + b.priceCents, 0),
  };
}

/** Which offered pack, if any, is the way to this brain. For the shelf rows. */
export function packFor(offer: RouteOffer, slug: string): OfferedPack | undefined {
  return offer.packs.find((p) => p.covers.includes(slug));
}
