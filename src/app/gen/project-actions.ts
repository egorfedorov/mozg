"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { currentUser } from "@/lib/session";
import { imageGenReady } from "@/lib/imagegen";
import { rateLimited } from "@/lib/rate-limit";
import {
  createProject,
  proposedItems,
  addItems,
  setItemSpec,
  removeItem,
  runProject,
  KINDS,
} from "@/lib/genproject";

/**
 * The interview, as three server actions.
 *
 * Everything except the last one is free. A studio names the game, describes
 * the world, edits every symbol it cares about and throws away the ones it does
 * not want, and none of that costs a penny or touches a model — which is the
 * whole reason the plan is a table rather than a form submit.
 */

export async function newProject(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/gen/panel");

  // Cheap rows, but a loop that makes them is still a loop.
  if (await rateLimited(user.id, "gen-project", 20)) {
    return { error: "Twenty projects an hour is plenty. Try again shortly." };
  }

  try {
    const set = String(formData.get("set") ?? "full");
    const project = await createProject(user.id, {
      title: String(formData.get("title") ?? ""),
      style: String(formData.get("style") ?? ""),
      palette: String(formData.get("palette") ?? ""),
      // The set is what was picked; the kind is what that set is for. Read from
      // the same list the radios were built from rather than trusting a hidden
      // field, which is a value the browser can send anything in.
      kind: KINDS.find((k) => k.set === set)?.id ?? "custom",
    });

    // Proposed rather than imposed: every row is editable and removable on the
    // next screen, before anything is bought.
    await addItems(project.id, proposedItems(set));

    revalidatePath("/gen/panel");
    redirect(`/gen/p/${project.id}`);
  } catch (err) {
    // redirect() throws by design — never swallow it as a failure.
    if (err && typeof err === "object" && "digest" in err) throw err;
    return { error: err instanceof Error ? err.message : "Could not create the project." };
  }
}

export async function saveItemSpec(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const projectId = String(formData.get("project") ?? "");
  const label = String(formData.get("label") ?? "");
  const raw = String(formData.get("spec") ?? "").trim();

  // Empty is a real answer — "draw it from the world I already described" —
  // so it clears the spec rather than being rejected as incomplete.
  await setItemSpec(projectId, label, raw || null);
  revalidatePath(`/gen/p/${projectId}`);
}

export async function dropItem(formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  const projectId = String(formData.get("project") ?? "");
  await removeItem(projectId, String(formData.get("label") ?? ""));
  revalidatePath(`/gen/p/${projectId}`);
}

/** The one action that spends money. */
export async function generate(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in");

  if (!imageGenReady()) {
    return { error: "Generation is not switched on for this deployment yet." };
  }
  if (await rateLimited(user.id, "pack", 6)) {
    return { error: "Six runs an hour is the limit. Try again shortly." };
  }

  const projectId = String(formData.get("project") ?? "");
  // A single label runs one asset; absent, the whole planned set goes.
  const only = String(formData.get("label") ?? "").trim();

  const result = await runProject(projectId, user.id, only ? [only] : undefined);
  if (!result.ok) return { error: result.reason };

  // Queue after the transaction commits, the same order the pack path uses: a
  // queue that is down leaves paid rows the worker picks up on its next start,
  // rather than pictures nobody was charged for.
  const { enqueueGeneration } = await import("@/worker/queue");
  for (const id of result.ids) await enqueueGeneration(id);

  revalidatePath(`/gen/p/${projectId}`);
  return { ok: true as const, started: result.ids.length };
}
