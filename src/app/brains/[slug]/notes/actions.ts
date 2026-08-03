"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { query } from "@/db";
import { currentUser } from "@/lib/session";

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
