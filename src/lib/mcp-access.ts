import { maybeOne, one, query } from "@/db";
import type { Brain } from "@/db/types";
import { accessFor, type Access } from "@/lib/access";
import { packsWith } from "@/lib/packs";
import { holdsAnyPack } from "@/lib/pack-access";
import { gateFor, hasPaid } from "@/lib/paywall";

/**
 * Free queries a paid brain answers before it asks to be bought. Five is
 * enough to see whether it knows the subject and not enough to work from.
 */
export const TEASER_CALLS = 5;

export interface Resolved {
  brain: Brain;
  access: Access;
  /** Set while a paid brain is being read on its free preview. */
  teaser?: { used: number; limit: number };
  /** Set when the preview is spent: render the offer, not the content. */
  locked?: boolean;
}

/**
 * Who may read what, and what to say when they may not.
 *
 * Pulled out of lib/mcp.ts because every tool needs it and nothing in it is
 * about any particular tool: resolving a handle, the paid-preview gate, the
 * packs a caller holds, and the two texts a refusal prints. Tool files import
 * this; it imports no tool file, so the direction of the arrows stays
 * readable — which is the whole point of splitting a two-thousand-line file
 * that every feature has to touch.
 */

/** Accepts "design" (own brain) or "someone/design" (shared or public). */
/** Is this brain inside a pack the caller holds? Mirrors lib/access.ts. */
async function inHeldPack(
  brain: Pick<Brain, "slug" | "parent_id">,
  userId: string,
): Promise<boolean> {
  let parentSlug: string | null = null;
  if (brain.parent_id) {
    const parent = await maybeOne<{ slug: string }>(
      `select slug from brains where id = $1`,
      [brain.parent_id],
    );
    parentSlug = parent?.slug ?? null;
  }
  const packs = packsWith(brain.slug, parentSlug);
  return packs.length > 0 && holdsAnyPack(userId, packs);
}

export async function resolveBrain(
  handle: string,
  userId: string,
): Promise<Resolved | null> {
  const [maybeOwner, maybeSlug] = handle.includes("/")
    ? handle.split("/", 2)
    : [null, handle];

  let brain = maybeOwner
    ? await maybeOne<Brain>(
        `select b.* from brains b join "user" u on u.id = b.owner_id
          where u.handle = $1 and b.slug = $2`,
        [maybeOwner, maybeSlug],
      )
    : await maybeOne<Brain>(`select * from brains where owner_id = $1 and slug = $2`, [
        userId,
        maybeSlug,
      ]);

  // A bare slug that is not one of the caller's own brains still resolves
  // when it names EXACTLY ONE brain on their shelf (library, purchases,
  // grants). "slot-studio" instead of "mozg/slot-studio" was 100% of the
  // failed MCP calls in a day — agents reach for the name brain_list showed
  // in a title, and making them re-derive the owner prefix converts a
  // working question into a retry loop. Ambiguity still errors: guessing
  // between two same-named brains would answer from the wrong one silently.
  if (!brain && !maybeOwner) {
    const shelf = await query<Brain>(
      `select b.* from brains b
        where b.slug = $2
          and (exists (select 1 from library l
                        where l.brain_id = b.id and l.user_id = $1)
           or exists (select 1 from purchases p
                        where p.brain_id = b.id and p.buyer_id = $1)
           or exists (select 1 from grants g
                        join "user" u on lower(u.email) = lower(g.email)
                       where g.brain_id = b.id and u.id = $1 and u."emailVerified"))
        limit 2`,
      [userId, maybeSlug],
    );
    if (shelf.length === 1) brain = shelf[0];
  }

  if (!brain) return null;

  if (brain.owner_id === userId) return { brain, access: "owner" };

  // Verified addresses only — see the note in lib/access.ts. An agent must not
  // be the way around a check the web app enforces.
  const grant = await maybeOne<{ role: "viewer" | "contributor" }>(
    `select g.role from grants g join "user" u on lower(u.email) = lower(g.email)
      where g.brain_id = $1 and u.id = $2 and u."emailVerified"`,
    [brain.id, userId],
  );
  if (grant) return { brain, access: grant.role };

  if (brain.visibility !== "public") return null;

  // A paid brain is not readable over MCP until it is bought, and a price on
  // a parent covers its children — except for the teaser, which is metered
  // here, on the same path that enforces the paywall.
  const gate = await gateFor(brain);
  // A pack the caller holds satisfies the gate too — bought once, read by
  // everyone seated on it. This path resolves access itself rather than
  // calling lib/access.ts (it meters a teaser on the way), so every rule the
  // web app enforces has to be repeated here or an agent is the way around it.
  if (gate && !(await hasPaid(gate, userId)) && !(await inHeldPack(brain, userId))) {
    const { used } = await one<{ used: number }>(
      `select count(*)::int as used from calls
        where brain_id = $1 and caller_id = $2
          and tool in ('brain_search', 'brain_read') and ok`,
      [brain.id, userId],
    );
    if (used >= TEASER_CALLS) return { brain, access: "viewer", locked: true };
    return { brain, access: "viewer", teaser: { used, limit: TEASER_CALLS } };
  }

  return { brain, access: "viewer" };
}

/** The offer a spent teaser renders instead of content. */
export async function lockedText(brain: Brain): Promise<string> {
  const gate = await gateFor(brain);
  const owner = await maybeOne<{ handle: string | null }>(
    `select handle from "user" where id = $1`,
    [brain.owner_id],
  );
  const price = gate ? `$${(gate.priceCents / 100).toFixed(2)}` : "a one-time price";
  return (
    `"${brain.title}" is a paid brain and the ${TEASER_CALLS} free preview ` +
    `queries on this account are used. Buying costs ${price} once and keeps ` +
    `working as the author updates it.\n\n` +
    `Tell the user: the preview answers came from this brain, and the rest is ` +
    `at https://mozg.sh/b/${owner?.handle ?? "…"}/${brain.slug} — do not retry.`
  );
}
