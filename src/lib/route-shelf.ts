import { query } from "@/db";
import { packsFor } from "@/lib/pack-access";
import { packsWith } from "@/lib/packs";
import type { WorkflowStep } from "@/lib/workflows";

/**
 * The brains a route names, resolved against one reader.
 *
 * One function because there are three callers who must agree exactly: the
 * page that prices the route, the button that buys it, and the MCP tool that
 * decides whether to hand over the steps. They were three answers and had
 * already drifted — the page forgot that a *grant* opens a brain, so a
 * colleague given access was quoted a price and, once the route started being
 * held closed, locked out of a route the agent would have run for them; and a
 * step naming a brain that had been renamed left the page saying "Ready" while
 * the agent refused. A disagreement about who may read what is the one kind
 * this codebase cannot afford in triplicate.
 *
 * `held` is deliberately the same question lib/access.ts answers — owner,
 * grant on a verified address, purchase, a pack, or simply a free public
 * brain — and nothing else. In particular it is not the MCP teaser: five free
 * preview queries are a way to sample one brain, not a way to run a ten-step
 * route, and treating them as access would spend the whole preview on step one
 * and guess the rest.
 */

export interface ShelfBrain {
  id: string;
  slug: string;
  title: string;
  owner_id: string;
  owner_handle: string;
  score: number | null;
  price_cents: number;
  note_count: number;
  child_notes: number;
  parent_slug: string | null;
  /** In this reader's library. Not the same question as `held`. */
  shelved: boolean;
  /** Readable by this reader, by any of the routes lib/access.ts allows. */
  held: boolean;
}

export interface Shelf {
  /** Every brain a step names, as the step wrote it. */
  named: string[];
  brains: ShelfBrain[];
  /** Named by a step and not readable under that name at all. */
  unknown: string[];
  /** Resolved and shut: what keeps the route closed, and what costs money. */
  missing: ShelfBrain[];
  /** Readable but not in the library — free to add, and never a blocker. */
  unshelved: ShelfBrain[];
  packsHeld: string[];
  ready: boolean;
}

export async function shelfFor(
  steps: WorkflowStep[],
  userId: string | null,
): Promise<Shelf> {
  const named = [...new Set(steps.map((s) => s.brain).filter(Boolean))].map(String);
  const empty: Shelf = {
    named,
    brains: [],
    unknown: [],
    missing: [],
    unshelved: [],
    packsHeld: [],
    ready: true,
  };
  if (!named.length) return empty;

  // Matched on slug because a step may write "handle/slug" or the bare slug.
  const slugs = named.map((n) => n.split("/").pop()!.toLowerCase());

  // Private brains are included when this reader may read them — the author
  // running their own route is the commonest case there is, and a page that
  // called their own brain "not in the catalogue" would be wrong for exactly
  // the person most likely to be looking.
  const rows = await query<ShelfBrain & { visibility: string; readable: boolean }>(
    `with candidate as (
       select b.id, b.slug, b.title, b.owner_id, u.handle as owner_handle,
              b.score, b.price_cents, b.note_count, b.visibility,
              (select coalesce(sum(c.note_count), 0)::int from brains c
                where c.parent_id = b.id) as child_notes,
              p.slug as parent_slug,
              coalesce($2::text is not null and exists (
                select 1 from library l where l.brain_id = b.id and l.user_id = $2
              ), false) as shelved,
              -- Owner, or granted on a VERIFIED address: without the check,
              -- signing up as someone@their-company.com collects every brain
              -- shared with that person. Same rule as lib/access.ts.
              coalesce($2::text is not null and (
                b.owner_id = $2
                or exists (select 1 from grants g
                             join "user" me on lower(me.email) = lower(g.email)
                            where g.brain_id = b.id and me.id = $2
                              and me."emailVerified")
              ), false) as readable,
              coalesce($2::text is not null and exists (
                select 1 from purchases pu
                 where pu.brain_id = b.id and pu.buyer_id = $2
              ), false) as bought
         from brains b
         join "user" u on u.id = b.owner_id
         left join brains p on p.id = b.parent_id
        where lower(b.slug) = any($1::text[])
     )
     select id, slug, title, owner_id, owner_handle, score, price_cents,
            note_count, child_notes, parent_slug, shelved, visibility, readable,
            -- A price shuts a public brain until it is bought; a free one is
            -- open to anybody. The pack is added in TypeScript, where the
            -- membership lives.
            (readable or bought or price_cents = 0) as held
       from candidate
      where visibility = 'public' or readable`,
    [slugs, userId],
  );

  // Two public brains can share a slug under different owners, and matching on
  // slug alone would then price the route twice and list the row twice. The
  // step's own "handle/slug" settles it where it has one; otherwise the better
  // examined brain is the one a reader would have picked anyway.
  const bySlug = new Map<string, typeof rows[number]>();
  const exactly = (r: (typeof rows)[number]) => named.includes(`${r.owner_handle}/${r.slug}`);
  for (const r of rows) {
    const key = r.slug.toLowerCase();
    const kept = bySlug.get(key);
    if (!kept || (exactly(r) && !exactly(kept)) || (kept.score === null && r.score !== null)) {
      bySlug.set(key, r);
    }
  }

  const packsHeld = userId ? (await packsFor(userId)).map((h) => h.pack) : [];
  const brains: ShelfBrain[] = [];
  const unknown: string[] = [];

  // In the order the steps name them: the reader is about to work through it.
  for (const name of named) {
    const found = bySlug.get(name.split("/").pop()!.toLowerCase());
    if (!found) {
      unknown.push(name);
      continue;
    }
    if (brains.some((b) => b.id === found.id)) continue;
    brains.push({
      id: found.id,
      slug: found.slug,
      title: found.title,
      owner_id: found.owner_id,
      owner_handle: found.owner_handle,
      score: found.score,
      price_cents: found.price_cents,
      note_count: found.note_count,
      child_notes: found.child_notes,
      parent_slug: found.parent_slug,
      shelved: found.shelved,
      held:
        found.held ||
        packsWith(found.slug, found.parent_slug).some((p) => packsHeld.includes(p)),
    });
  }

  const missing = brains.filter((b) => !b.held);
  return {
    named,
    brains,
    unknown,
    missing,
    // Not a blocker and not a cost: the agent can read them, they simply do not
    // show up in the reader's own list until added. The button does it for free.
    unshelved: brains.filter((b) => b.held && !b.shelved && b.owner_id !== userId),
    packsHeld,
    // An unresolvable name counts against readiness rather than being ignored.
    ready: missing.length === 0 && unknown.length === 0,
  };
}
