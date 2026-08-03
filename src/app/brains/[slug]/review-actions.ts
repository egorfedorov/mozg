"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, query, toVector } from "@/db";
import type { Note } from "@/db/types";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages } from "@/lib/embed";
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

  const texts = chunksForNote(note.title, note.body);

  // Embed before flipping status. If the embedder is down, the note stays
  // pending — an "active" note with no chunks is invisible to search, which
  // looks like the approval silently did nothing.
  const vectors = await embedPassages(texts);

  await query(`update notes set status = 'active' where id = $1`, [note.id]);
  for (let i = 0; i < texts.length; i++) {
    await query(
      `insert into chunks (brain_id, note_id, content, token_count, embedding)
       values ($1, $2, $3, $4, $5::vector)`,
      [note.brain_id, note.id, texts[i], estimateTokens(texts[i]), toVector(vectors[i])],
    );
  }

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
