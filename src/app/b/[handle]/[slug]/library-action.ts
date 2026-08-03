"use server";

import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/session";
import { addToLibrary, removeFromLibrary } from "@/lib/library";

/**
 * Add a catalogue brain to your own set, so your agents can see it.
 *
 * Adding does not copy anything: the brain stays with its author and keeps
 * being updated by them. Copying would freeze it at the moment of adding,
 * which is the opposite of what a maintained brain is for.
 */
export async function addBrain(
  _prev: unknown,
  formData: FormData,
): Promise<{ ok?: true; already?: boolean; error?: string }> {
  const user = await currentUser();
  if (!user) return { error: "Sign in first — a brain is added to an account." };

  const brainId = String(formData.get("brainId") ?? "");
  const res = await addToLibrary(user.id, brainId);

  if (!res.ok) {
    return {
      error:
        res.reason === "own"
          ? "This is your own brain — your agents already see it."
          : res.reason === "unpaid"
            ? "Buy it first; a purchase adds it automatically."
            : res.reason === "not-public"
              ? "That brain is not public."
              : "That brain no longer exists.",
    };
  }

  revalidatePath("/brains");
  return { ok: true, already: res.already };
}

export async function dropBrain(formData: FormData) {
  const user = await currentUser();
  if (!user) return;

  await removeFromLibrary(user.id, String(formData.get("brainId") ?? ""));
  revalidatePath("/brains");
  revalidatePath("/settings/purchases");
}
