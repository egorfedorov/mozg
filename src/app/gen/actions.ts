"use server";

import { redirect } from "next/navigation";
import { currentUser } from "@/lib/session";
import { imageGenReady } from "@/lib/imagegen";
import { rateLimited } from "@/lib/rate-limit";
import { startPack } from "@/lib/assetpacks";
import { defaultSpecs, SYMBOL_LADDER, type AssetSpec } from "@/lib/slotgen";
import { enqueueGeneration } from "@/worker/queue";

/**
 * What a studio can order in one go.
 *
 * Three sets rather than a checklist of thirteen boxes: the whole point of the
 * service is that it knows what a slot needs, and a form that asks the studio
 * to assemble the paytable themselves has handed the expertise back to them.
 * Anyone who wants a different mix orders twice.
 */
const SETS: Record<string, () => AssetSpec[]> = {
  full: () => defaultSpecs(),
  symbols: () =>
    SYMBOL_LADDER.map((s) => ({ role: "symbol" as const, label: s.label, brief: s.brief })),
  scene: () => [
    { role: "background", label: "bg", brief: "the game's reel background" },
    { role: "tile", label: "tile", brief: "lobby key art for the game" },
    { role: "frame", label: "frame", brief: "the reel frame and UI panel" },
  ],
};

/**
 * Order a pack.
 *
 * The debit and the rows are one transaction inside startPack; jobs are queued
 * only after it commits, so a queue that is down leaves paid rows the worker
 * picks up on its next start rather than pictures nobody was charged for.
 */
export async function createPack(_prev: unknown, formData: FormData) {
  const user = await currentUser();
  if (!user) redirect("/sign-in?next=/gen");

  if (!imageGenReady()) {
    return { error: "Generation is not switched on for this deployment yet." };
  }

  // One pack is up to forty paid calls to a slow model. The balance is the
  // real limit; this stops a stuck client from ordering the same set six times
  // while the first is still rendering.
  if (await rateLimited(user.id, "pack", 6)) {
    return { error: "Six packs an hour is the limit. Try again shortly." };
  }

  const set = String(formData.get("set") ?? "full");
  const specs = (SETS[set] ?? SETS.full)();

  const started = await startPack({
    ownerId: user.id,
    title: String(formData.get("title") ?? ""),
    brief: String(formData.get("brief") ?? ""),
    palette: String(formData.get("palette") ?? ""),
    specs,
  });
  if (!started.ok) return { error: started.reason };

  // Queued one by one and never fatally: the rows are paid for, and a worker
  // that starts later sweeps them. Telling a studio its money vanished because
  // a queue hiccuped would be the wrong story.
  for (const id of started.assetIds) {
    await enqueueGeneration(id).catch(() => {});
  }

  redirect(`/gen/${started.id}`);
}
