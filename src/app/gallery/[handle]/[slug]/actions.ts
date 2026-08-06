"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { accessForSlug } from "@/lib/access";
import { currentUser } from "@/lib/session";
import { startGeneration } from "@/lib/generate";
import { imageGenReady } from "@/lib/imagegen";
import { rateLimited } from "@/lib/rate-limit";
import { enqueueGeneration } from "@/worker/queue";

/**
 * Ask a style to draw something.
 *
 * The debit and the row are one transaction inside startGeneration; the job is
 * only queued after that commits, so a queue that is down leaves a paid row
 * the worker will pick up on its next start rather than a picture nobody was
 * charged for.
 */
export async function generate(_prev: unknown, formData: FormData) {
  const handle = String(formData.get("handle") ?? "");
  const slug = String(formData.get("slug") ?? "");

  const user = await currentUser();
  if (!user) redirect(`/sign-in?next=/gallery/${handle}/${slug}`);

  if (!imageGenReady()) {
    return { error: "Generation is not switched on for this deployment yet." };
  }

  const found = await accessForSlug(handle, slug, user.id);
  // A paid style is bought before it can be generated with — `preview` is the
  // storefront state, and generating from it would be reading the rules
  // without paying for them.
  if (!found?.brain || !found.access) {
    return { error: "That style is not available to you — buy it first." };
  }
  if (found.brain.kind !== "style") {
    return { error: "That brain is not a style." };
  }

  // A generation is a paid call to a slow model. The balance is the real
  // limit, but a stuck client should not be able to queue thirty jobs while
  // the first is still running.
  if (await rateLimited(user.id, "generate", 20)) {
    return { error: "Twenty generations an hour is the limit. Try again shortly." };
  }

  const started = await startGeneration({
    brain: found.brain,
    buyerId: user.id,
    prompt: String(formData.get("prompt") ?? ""),
  });
  if (!started.ok) return { error: started.reason };

  await enqueueGeneration(started.id).catch(() => {
    // Deliberately not a failure: the row is paid for and the worker sweeps
    // queued rows when it starts. Telling the buyer their money vanished
    // because a queue hiccuped would be the wrong story.
  });

  revalidatePath(`/gallery/${handle}/${slug}`);
  return { ok: true, id: started.id };
}
