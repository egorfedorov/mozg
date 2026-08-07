/**
 * Packs — a trade's brains, sold together.
 *
 * A pack is not a new kind of object in the database. It is a name for a set
 * of brains that one job already reaches for together, and everything else
 * about it — the scores, the note counts, the prices — is read live from the
 * catalogue when a page renders. That is deliberate: a pack page whose numbers
 * were typed into it would be the exact failure this product argues against.
 *
 * One file, so adding a pack is a data change somebody can review in a diff,
 * and so the offer page and scripts/grandfather.ts cannot drift about which
 * brains are in it.
 *
 * `parents` names a family — its children come along, which is also how
 * lib/paywall.ts prices a family: a price on the parent covers every child
 * without one. `loose` names the brains that belong to the trade but sit
 * outside a family.
 */

export interface Pack {
  slug: string;
  /** Bought once, per account. Not a subscription: the material does not
   *  expire, and renting a book somebody has already read is a bad trade. */
  priceCents: number;
  /** People who may read it on one purchase, the buyer counted. */
  seats: number;
  /** The trade, in the reader's words. */
  title: string;
  eyebrow: string;
  /** Two lines. The break is the point — it is set in display type. */
  headline: [string, string];
  /** The pain, in the second person. Three sentences at most. */
  lede: string;
  /** What the brains actually cover, finished by the page with a note count. */
  covers: string;
  /** Who the seats are for, named as jobs rather than as "users". */
  team: string;
  /** The honest limit. Every pack has one; a page without it is an advert. */
  caveat: string;
  parents: string[];
  loose: string[];
}

export const PACKS: Pack[] = [
  {
    slug: "igaming",
    priceCents: 9900,
    seats: 3,
    title: "Slot studios",
    eyebrow: "For slot studios",
    headline: ["A failed submission", "costs more than a year of this."],
    lede:
      "The rejection arrives with a line number and no context. Somebody re-reads the approval rules, somebody else argues about what the RGS contract actually said, and the build slips a fortnight — again, over something that was written down the whole time.",
    covers:
      "the approval checklist, the compliance rules per jurisdiction, the RGS lifecycle, the math SDK, the animation and art direction",
    team:
      "Your maths person, your frontend, your artist and your producer each connect their own agent with their own token",
    caveat:
      "It is not certification, and it is not advice: a brain answers from what it was taught and says so, and the exam measures whether the answer was in there — not whether the regulator agrees. It is not a replacement for reading the contract before you sign it.",
    parents: ["stake-engine", "slot-studio"],
    loose: [
      "slot-studio-compliance",
      "slot-animation-craft",
      "slot-art-direction",
      "pixijs-casino",
      "spine-2d-animation",
    ],
  },
];

export function packBySlug(slug: string): Pack | undefined {
  return PACKS.find((p) => p.slug === slug);
}

/**
 * Which packs contain this brain — by its own slug, or by its family's.
 *
 * Takes slugs rather than a Brain so the read path can answer without loading
 * the parent row when the brain has no parent, which is most of them.
 */
export function packsWith(slug: string, parentSlug?: string | null): string[] {
  return PACKS.filter(
    (p) =>
      p.loose.includes(slug) ||
      p.parents.includes(slug) ||
      (parentSlug ? p.parents.includes(parentSlug) : false),
  ).map((p) => p.slug);
}
