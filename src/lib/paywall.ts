import { maybeOne } from "@/db";
import type { Brain } from "@/db/types";

/**
 * What has to be bought before a brain can be read.
 *
 * Two rules, and their order matters:
 *
 *   1. A child's own price wins. An author pricing parts separately is
 *      selling parts — the storefront must sell the part, not redirect to
 *      the family.
 *   2. A parent's price covers any child *without* one. Otherwise a paid
 *      family is a paywall with the door propped open: the buyer skips the
 *      parent and adds the free children, which is the same material for
 *      nothing.
 *
 * Together they make the parent's price a bundle: buying the family unlocks
 * every child (unlockedBy carries the parent), while each child stays
 * buyable on its own.
 */
export interface Gate {
  /** The brain the buy button points at. */
  brainId: string;
  /** Purchases of ANY of these satisfy the gate — itself, and the family. */
  unlockedBy: string[];
  priceCents: number;
}

export async function gateFor(brain: Brain): Promise<Gate | null> {
  const parent = brain.parent_id
    ? await maybeOne<{ id: string; price_cents: number }>(
        `select id, price_cents from brains where id = $1`,
        [brain.parent_id],
      )
    : null;
  const paidParent = parent && parent.price_cents > 0 ? parent : null;

  if (brain.price_cents > 0) {
    return {
      brainId: brain.id,
      unlockedBy: [brain.id, ...(paidParent ? [paidParent.id] : [])],
      priceCents: brain.price_cents,
    };
  }

  if (paidParent) {
    return {
      brainId: paidParent.id,
      unlockedBy: [paidParent.id],
      priceCents: paidParent.price_cents,
    };
  }

  return null;
}

/**
 * Has this reader paid anything that satisfies the gate?
 *
 * Takes accounts rather than an account, because a seat shares a purchase. A
 * studio buying a pack owns none of its brains — they belong to whoever wrote
 * them — so the only thing a colleague can inherit is the buyer's receipt. Pass
 * the reader plus any studio they hold a seat in; see lib/team.ts.
 */
export async function hasPaid(
  gate: Gate,
  buyers: string | string[] | null,
): Promise<boolean> {
  const ids = (typeof buyers === "string" ? [buyers] : (buyers ?? [])).filter(Boolean);
  if (!ids.length) return false;
  const bought = await maybeOne(
    `select 1 from purchases where brain_id = any($1::uuid[]) and buyer_id = any($2::text[])`,
    [gate.unlockedBy, ids],
  );
  return Boolean(bought);
}
