"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, query, toVector } from "@/db";
import type { Note } from "@/db/types";
import { approve } from "@/lib/review";
import { currentUser } from "@/lib/session";

/**
 * The review queue for agent-written notes. Approving is where a note becomes
 * searchable — it is indexed here, not at write time, so "review required"
 * actually means something.
 */

async function ownedNote(noteId: string, userId: string): Promise<Note | null> {
  return maybeOne<Note>(
    `select n.* from notes n
       join brains b on b.id = n.brain_id
      where n.id = $1 and b.owner_id = $2 and n.status = 'pending'`,
    [noteId, userId],
  );
}

export async function approveNote(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const note = await ownedNote(String(formData.get("id")), user.id);
  if (!note) return;

  await approve(note);

  revalidatePath(`/brains/${String(formData.get("slug"))}`);
}

/**
 * Close an agent's flag on a note. Either the owner fixed the note (or
 * removed it on the notes page) and the report did its job, or they looked
 * and disagreed — both end the same way: the flag is resolved by a human
 * who read it, which is all a flag ever asks for.
 */
export async function dismissFlag(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  await query(
    `delete from note_flags f using brains b
      where f.id = $1 and b.id = f.brain_id and b.owner_id = $2`,
    [String(formData.get("id")), user.id],
  );
  revalidatePath(`/brains/${String(formData.get("slug"))}`);
}

export async function rejectNote(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const note = await ownedNote(String(formData.get("id")), user.id);
  if (!note) return;

  await query(`update notes set status = 'rejected' where id = $1`, [note.id]);
  revalidatePath(`/brains/${String(formData.get("slug"))}`);
}
