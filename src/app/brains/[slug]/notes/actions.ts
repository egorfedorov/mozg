"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query, maybeOne } from "@/db";
import { currentUser } from "@/lib/session";
import { normalizeCategory } from "@/lib/category";

/** Every action here proves the note belongs to a brain this user owns. */
async function ownedNote(noteId: string, userId: string) {
  return maybeOne<{ id: string; brain_id: string; slug: string }>(
    `select n.id, n.brain_id, b.slug
       from notes n join brains b on b.id = n.brain_id
      where n.id = $1 and b.owner_id = $2`,
    [noteId, userId],
  );
}

/**
 * Deleting a note removes its chunks with it (FK cascade), so it disappears
 * from search immediately. We hard-delete here rather than superseding: a note
 * the owner deliberately removed should not linger in the audit trail as
 * something an export might pick up.
 */
export async function deleteNote(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await query(
    `delete from notes n using brains b
      where n.id = $1 and n.brain_id = b.id and b.owner_id = $2`,
    [String(formData.get("id")), user.id],
  );

  revalidatePath(`/brains/${String(formData.get("slug"))}/notes`);
}

/**
 * Resolve a duplicate pair: keep one note, supersede the other.
 *
 * Superseded rather than deleted, and its chunks dropped at the same time —
 * search runs over chunks, so a note left with its chunks would keep answering
 * after being "merged" and the owner would rightly conclude the button does
 * nothing.
 */
export async function mergeNotes(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const keepId = String(formData.get("keep"));
  const dropId = String(formData.get("drop"));
  if (keepId === dropId) return;

  const keep = await ownedNote(keepId, user.id);
  const drop = await ownedNote(dropId, user.id);
  // Both, and from the same brain: merging across brains would move knowledge
  // between them, which is not what this button says it does.
  if (!keep || !drop || keep.brain_id !== drop.brain_id) return;

  await query(
    `update notes
        set status = 'superseded', superseded_by = $2,
            superseded_reason = 'merged into a note saying the same thing',
            superseded_at = now()
      where id = $1 and status = 'active'`,
    [drop.id, keep.id],
  );
  await query(`delete from chunks where note_id = $1`, [drop.id]);

  revalidatePath(`/brains/${keep.slug}/notes`);
}

/**
 * Move a note to another category. Extraction invents synonyms — "Spacing" and
 * "Spacing and layout" as separate categories is common — and a note filed
 * under a category the exam does not ask about is a note the score will never
 * credit.
 */
export async function recategorise(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const note = await ownedNote(String(formData.get("id")), user.id);
  if (!note) return;

  const raw = String(formData.get("category") ?? "").slice(0, 120);
  // Normalised like every other write path — a hand-typed "Type Scale" must
  // not fork the category extraction already uses.
  await query(`update notes set category = $2 where id = $1`, [
    note.id,
    normalizeCategory(raw),
  ]);

  revalidatePath(`/brains/${note.slug}/notes`);
}

/** Put a superseded note back, when a merge or a refresh took the better one. */
export async function restoreNote(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const note = await ownedNote(String(formData.get("id")), user.id);
  if (!note) return;

  // Restored to pending, not active: its chunks are gone, so it cannot answer
  // anything until something re-embeds it. Pending is exactly that state, and
  // the review queue already knows how to turn pending into searchable.
  await query(
    `update notes
        set status = 'pending', superseded_by = null,
            superseded_reason = null, superseded_at = null
      where id = $1 and status = 'superseded'`,
    [note.id],
  );

  revalidatePath(`/brains/${note.slug}/notes`);
}
