"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, query } from "@/db";
import type { Source } from "@/db/types";
import { currentUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { enqueueIngest } from "@/worker/queue";

async function ownedSource(sourceId: string, userId: string): Promise<Source | null> {
  return maybeOne<Source>(
    `select s.* from sources s
       join brains b on b.id = s.brain_id
      where s.id = $1 and b.owner_id = $2`,
    [sourceId, userId],
  );
}

/**
 * Re-run a source that failed or was rejected. Failures are usually transient
 * (the embedder was down, the model refused, the API rate-limited), so the fix
 * is almost always "try again" rather than "upload it again".
 */
export async function retrySource(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const source = await ownedSource(String(formData.get("id")), user.id);
  if (!source) return;

  // Drop what the previous attempt produced, or a retry would double the notes.
  await query(`delete from notes where source_id = $1`, [source.id]);
  await query(
    `update sources set status = 'queued', error = null, reject_reason = null,
            findings = null, note_count = 0, processed_at = null
      where id = $1`,
    [source.id],
  );

  await enqueueIngest(source.id);
  revalidatePath(`/brains/${String(formData.get("slug"))}`);
}

export async function deleteSource(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const source = await ownedSource(String(formData.get("id")), user.id);
  if (!source) return;

  // Notes cascade; the stored object does not, so remove it explicitly. A
  // failure here must not block the delete — an orphaned blob is cheaper than
  // a row the user cannot get rid of.
  if (source.storage_key) {
    await storage.del(source.storage_key).catch(() => {});
  }
  await query(`delete from sources where id = $1`, [source.id]);

  revalidatePath(`/brains/${String(formData.get("slug"))}`);
}
