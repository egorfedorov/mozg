import { query } from "@/db";
import type { Brain } from "@/db/types";

/**
 * Brain families.
 *
 * A parent is a brain that groups others: "Stake Engine" over "RGS wallet
 * endpoints", "maths model", "frontend SDK". One level deep, guaranteed by a
 * trigger — see 0006_families.sql.
 *
 * The point is retrieval. Asking a parent searches its children, so an agent
 * that knows the product name does not have to know how the owner split it up;
 * asking a child searches only that child, which is what keeps each exam
 * honest.
 */

export interface FamilyMember {
  id: string;
  slug: string;
  title: string;
  goal: string | null;
  score: number | null;
  note_count: number;
}

/**
 * Every brain a query against `brainId` should reach: itself, plus its
 * children when it is a parent. A child reaches only itself — pulling in its
 * siblings would make a narrow brain answer from material it was never scored
 * on.
 */
export async function familyIds(brain: Pick<Brain, "id" | "parent_id">): Promise<string[]> {
  if (brain.parent_id) return [brain.id];

  const kids = await query<{ id: string }>(
    `select id from brains where parent_id = $1`,
    [brain.id],
  );
  return [brain.id, ...kids.map((k) => k.id)];
}

export async function childrenOf(brainId: string): Promise<FamilyMember[]> {
  return query<FamilyMember>(
    `select id, slug, title, goal, score, note_count
       from brains where parent_id = $1
      order by title`,
    [brainId],
  );
}

export async function parentOf(brain: Pick<Brain, "parent_id">): Promise<FamilyMember | null> {
  if (!brain.parent_id) return null;
  const rows = await query<FamilyMember>(
    `select id, slug, title, goal, score, note_count from brains where id = $1`,
    [brain.parent_id],
  );
  return rows[0] ?? null;
}

/**
 * Brains this user could group something under: their own, minus the ones that
 * are already children. Offering a child as a parent would be offering an
 * option the database will refuse.
 */
export async function possibleParents(
  ownerId: string,
  excludeId?: string,
): Promise<FamilyMember[]> {
  return query<FamilyMember>(
    `select id, slug, title, goal, score, note_count
       from brains
      where owner_id = $1 and parent_id is null
        and ($2::uuid is null or id <> $2)
        -- a brain that is itself a child cannot become a parent
        and not exists (select 1 from brains c where c.id = brains.parent_id)
      order by title`,
    [ownerId, excludeId ?? null],
  );
}
