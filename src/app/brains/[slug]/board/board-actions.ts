"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { maybeOne, one } from "@/db";
import type { Note } from "@/db/types";
import { currentUser } from "@/lib/session";
import { scanSecrets } from "@/lib/scan";
import { normalizeCategory } from "@/lib/category";
import { approve } from "@/lib/review";

/**
 * Writing a note from the board. The owner typing into their own brain needs
 * no review queue — the note is inserted pending and immediately approved,
 * which routes it through the one indexing path review already owns (chunks,
 * embeddings, activation). No second pipeline.
 */
export async function addBoardNote(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const slug = String(formData.get("slug"));
  const brain = await maybeOne<{ id: string }>(
    `select id from brains where owner_id = $1 and slug = $2`,
    [user.id, slug],
  );
  if (!brain) return;

  const title = String(formData.get("title") ?? "").trim().slice(0, 200);
  const body = String(formData.get("body") ?? "").trim().slice(0, 20000);
  if (!title || !body) return;

  // Same gate every other write path has. An owner can leak their own token
  // into their own brain and then sell the brain.
  if (scanSecrets(`${title}\n${body}`).length) return;

  const note = await one<Note>(
    `insert into notes (brain_id, title, body, category, kind, author, status)
     values ($1, $2, $3, $4, 'fact', 'human', 'pending')
     returning *`,
    [
      brain.id,
      title,
      body,
      normalizeCategory(String(formData.get("category") ?? "") || null),
    ],
  );
  await approve(note);

  revalidatePath(`/brains/${slug}/board`);
}
