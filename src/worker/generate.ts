import { one, query } from "@/db";
import type { Brain } from "@/db/types";
import { compilePrompt, settleGeneration } from "@/lib/generate";
import { generateImage } from "@/lib/imagegen";
import { ROLES, type AssetRole } from "@/lib/slotgen";
import { packKey, storage, storageKey } from "@/lib/storage";

/** A role the database no longer recognises must not decide the frame: an
 *  unknown value falls back to square rather than throwing away a paid job. */
function aspectFor(role: string): "1:1" | "16:9" | "3:4" {
  return ROLES[role as AssetRole]?.aspect ?? "1:1";
}

/**
 * Make the picture the buyer already paid for.
 *
 * Everything that can fail throws, and the caller refunds — so this must never
 * swallow an error to "finish gracefully". A half-success that records done
 * without an image is the one outcome that takes someone's money and gives
 * them nothing.
 */
export async function runGeneration(id: string): Promise<void> {
  const gen = await one<{
    brain_id: string | null;
    pack_id: string | null;
    role: string | null;
    prompt: string;
    full_prompt: string | null;
    status: string;
  }>(
    `select brain_id, pack_id, role, prompt, full_prompt, status
       from generations where id = $1`,
    [id],
  );

  // A restarted worker can be handed a job it already finished.
  if (gen.status === "done" || gen.status === "failed") return;

  await query(`update generations set status = 'running' where id = $1`, [id]);

  // An asset ordered as part of a pack arrives already compiled: its prompt
  // was written when the studio paid, against the brief the whole set shares.
  // Recompiling it here from the brief would let two assets in one set be
  // generated against different rules — which is the one thing a set must not
  // do — and would lose the record of what was actually bought.
  const isPackAsset = Boolean(gen.pack_id && gen.full_prompt);

  const brain = gen.brain_id
    ? await one<Brain>(`select * from brains where id = $1`, [gen.brain_id])
    : null;

  let full: string;
  if (isPackAsset) {
    full = gen.full_prompt!;
  } else if (brain) {
    // The artist's rules, compiled in front of the buyer's sentence. Stored
    // before the call, not after: if the model then fails, the record still
    // shows what was asked, which is the difference between diagnosing a bad
    // result and guessing at one.
    full = await compilePrompt(brain, gen.prompt);
    await query(`update generations set full_prompt = $2 where id = $1`, [id, full]);
  } else {
    // Neither a style to compile from nor a compiled prompt to send. Throwing
    // refunds the buyer; finishing would take the money for nothing.
    throw new Error("generation has neither a style brain nor a compiled prompt");
  }

  const image = await generateImage(full, {
    aspect: isPackAsset && gen.role ? aspectFor(gen.role) : "1:1",
    // Written the moment the provider hands one over, not after the picture
    // arrives: a run that then times out is only chaseable by its task id, and
    // the first timeout in production had none recorded to chase.
    onSubmitted: (taskId) =>
      query(`update generations set task_id = $2 where id = $1`, [id, taskId]).then(() => {}),
  });

  const ext = image.mime.includes("webp") ? "webp" : image.mime.includes("jpeg") ? "jpg" : "png";
  // A pack's assets live under the pack, not under a brain: most packs have no
  // brain at all, and the ones that do borrow someone else's — filing a
  // studio's art under an artist's folder would put two people's work in one
  // place with one of them unable to find theirs.
  const key = gen.pack_id
    ? packKey(gen.pack_id, `${gen.role ?? "asset"}.${ext}`)
    : storageKey(brain!.id, `generated.${ext}`);
  await storage.put(key, image.bytes, image.mime);

  // Pays the artist and marks the row done, in one transaction. The cost is
  // the provider's own figure for this job, not an average.
  await settleGeneration(id, key, image.costCents);
}
