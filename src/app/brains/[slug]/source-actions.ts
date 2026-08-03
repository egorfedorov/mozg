"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, one, query } from "@/db";
import type { Source } from "@/db/types";
import { currentUser } from "@/lib/session";
import { storage } from "@/lib/storage";
import { checkFetchableUrl } from "@/lib/url-guard";
import { rateLimited } from "@/lib/rate-limit";
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

  // A retry re-reads the whole source through the extraction model on the
  // platform's bill, so it cannot be a free retry loop either.
  if (await rateLimited(user.id, "ingest-retry", 10)) return;

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

/**
 * Add one or more pages by URL, one per line. Docs sites are where most of a
 * brain's material actually lives, and pasting eight links beats saving eight
 * screenshots of the same pages.
 */
export async function addUrls(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await maybeOne<{ id: string }>(
    `select id from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (!brain) return { error: "Brain not found." };

  const lines = String(formData.get("urls") ?? "")
    .split(/[\n\s]+/)
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 25);

  if (!lines.length) return { error: "Paste at least one URL." };

  const added: string[] = [];
  const refused: string[] = [];

  for (const line of lines) {
    const check = await checkFetchableUrl(line);
    if (!check.ok || !check.url) {
      refused.push(`${line.slice(0, 60)} — ${check.reason}`);
      continue;
    }

    const source = await one<Source>(
      `insert into sources (brain_id, kind, url, original_name)
       values ($1, 'url', $2, $3) returning *`,
      [brain.id, check.url, new URL(check.url).hostname],
    );
    await enqueueIngest(source.id);
    added.push(check.url);
  }

  revalidatePath(`/brains/${slug}`);
  return { added: added.length, refused };
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
