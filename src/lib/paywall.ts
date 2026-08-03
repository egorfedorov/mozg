import { maybeOne } from "@/db";
import type { Brain } from "@/db/types";

/**
 * What has to be bought before a brain can be read.
 *
 * A price on a parent covers its children. Without that, pricing a family is a
 * paywall with the door propped open: the buyer skips the parent and adds the
 * six free children instead, which is the same material for nothing.
 *
 * So the charge lives on the family, and a child's price is its parent's. A
 * child priced on its own is still honoured — that is an author deliberately
 * selling one part separately — but the parent's price is what a child inside
 * a paid family costs.
 */
export interface Gate {
  /** The brain whose purchase unlocks this one. Itself, or its parent. */
  brainId: string;
  priceCents: number;
}

export async function gateFor(brain: Brain): Promise<Gate | null> {
  if (brain.parent_id) {
    const parent = await maybeOne<{ id: string; price_cents: number }>(
      `select id, price_cents from brains where id = $1`,
      [brain.parent_id],
    );
    if (parent && parent.price_cents > 0) {
      return { brainId: parent.id, priceCents: parent.price_cents };
    }
  }

  if (brain.price_cents > 0) {
    return { brainId: brain.id, priceCents: brain.price_cents };
  }

  return null;
}

/** Has this reader paid whatever the gate asks for? */
export async function hasPaid(gate: Gate, userId: string | null): Promise<boolean> {
  if (!userId) return false;
  const bought = await maybeOne(
    `select 1 from purchases where brain_id = $1 and buyer_id = $2`,
    [gate.brainId, userId],
  );
  return Boolean(bought);
}
