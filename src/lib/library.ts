import { query, maybeOne } from "@/db";
import type { Brain } from "@/db/types";

/**
 * Brains someone added from the catalogue to their own working set.
 *
 * Adding is not a copy. The brain stays where it is, keeps its author, keeps
 * being updated by them — the row here only means "show this to my agents".
 * Copying would freeze it at the moment of adding, which is the opposite of
 * what a maintained brain is for.
 */

export type AddResult =
  | { ok: true; already: boolean }
  | { ok: false; reason: "not-found" | "not-public" | "unpaid" | "own" };

export async function addToLibrary(userId: string, brainId: string): Promise<AddResult> {
  const brain = await maybeOne<Brain>(`select * from brains where id = $1`, [brainId]);
  if (!brain) return { ok: false, reason: "not-found" };
  if (brain.owner_id === userId) return { ok: false, reason: "own" };
  if (brain.visibility !== "public") return { ok: false, reason: "not-public" };

  // A paid brain reaches the library through a purchase, not around it.
  if (brain.price_cents > 0) {
    const bought = await maybeOne(
      `select 1 from purchases where brain_id = $1 and buyer_id = $2`,
      [brain.id, userId],
    );
    if (!bought) return { ok: false, reason: "unpaid" };
  }

  const inserted = await query<{ brain_id: string }>(
    `insert into library (user_id, brain_id) values ($1, $2)
     on conflict do nothing returning brain_id`,
    [userId, brain.id],
  );
  return { ok: true, already: inserted.length === 0 };
}

export async function removeFromLibrary(userId: string, brainId: string): Promise<void> {
  await query(`delete from library where user_id = $1 and brain_id = $2`, [userId, brainId]);
}

export async function inLibrary(userId: string, brainId: string): Promise<boolean> {
  const row = await maybeOne(`select 1 from library where user_id = $1 and brain_id = $2`, [
    userId,
    brainId,
  ]);
  return Boolean(row);
}

export interface LibraryBrain {
  id: string;
  slug: string;
  handle: string;
  title: string;
  goal: string | null;
  score: number | null;
  note_count: number;
  topic: string;
  owner_handle: string;
  price_cents: number;
  added_at: string;
  /** False once the author unpublishes it — it stays listed, but says so. */
  still_public: boolean;
}

export async function libraryBrains(userId: string): Promise<LibraryBrain[]> {
  return query<LibraryBrain>(
    `select b.id, b.slug, u.handle || '/' || b.slug as handle, b.title, b.goal,
            b.score, b.note_count, b.topic, u.handle as owner_handle, b.price_cents,
            to_char(l.added_at at time zone 'UTC', 'YYYY-MM-DD') as added_at,
            (b.visibility = 'public') as still_public
       from library l
       join brains b on b.id = l.brain_id
       join "user" u on u.id = b.owner_id
      where l.user_id = $1
      order by l.added_at desc`,
    [userId],
  );
}

/** Ids in the library, for marking cards in the catalogue. */
export async function libraryIds(userId: string): Promise<Set<string>> {
  const rows = await query<{ brain_id: string }>(
    `select brain_id from library where user_id = $1`,
    [userId],
  );
  return new Set(rows.map((r) => r.brain_id));
}
