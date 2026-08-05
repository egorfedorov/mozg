import { query, toVector } from "@/db";
import type { Note } from "@/db/types";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages } from "@/lib/embed";

/**
 * Turning a pending note into a searchable one.
 *
 * This is where "review required" stops being a label: a note written by an
 * agent has no chunks until it is approved, and search runs over chunks. The
 * web action and the CLI both call this, so approving in bulk from a terminal
 * cannot drift from approving one in the browser.
 */
export async function approve(note: Note): Promise<void> {
  const texts = chunksForNote(note.title, note.body);

  // Embed before flipping status. If the embedder is down the note stays
  // pending — an "active" note with no chunks is invisible to search, which
  // looks like the approval silently did nothing.
  const vectors = await embedPassages(texts);

  await query(`update notes set status = 'active' where id = $1`, [note.id]);
  for (let i = 0; i < texts.length; i++) {
    await query(
      `insert into chunks (brain_id, note_id, content, token_count, embedding)
       values ($1, $2, $3, $4, $5::halfvec)`,
      [note.brain_id, note.id, texts[i], estimateTokens(texts[i]), toVector(vectors[i])],
    );
  }

  // An approved note is new knowledge, so the brain is due a re-exam. Stamped
  // rather than queued directly: the maintenance pass picks it up, and a burst
  // of approvals should not queue one exam each.
  await query(`update brains set content_changed_at = now() where id = $1`, [note.brain_id]);
}

export async function reject(noteId: string): Promise<void> {
  await query(`update notes set status = 'rejected' where id = $1`, [noteId]);
}
