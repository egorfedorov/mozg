import { one, query } from "@/db";
import type { Brain } from "@/db/types";
import { compilePrompt, settleGeneration } from "@/lib/generate";
import { generateImage } from "@/lib/imagegen";
import { storage, storageKey } from "@/lib/storage";

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
    brain_id: string;
    prompt: string;
    status: string;
  }>(`select brain_id, prompt, status from generations where id = $1`, [id]);

  // A restarted worker can be handed a job it already finished.
  if (gen.status === "done" || gen.status === "failed") return;

  await query(`update generations set status = 'running' where id = $1`, [id]);

  const brain = await one<Brain>(`select * from brains where id = $1`, [gen.brain_id]);

  // The artist's rules, compiled in front of the buyer's sentence. Stored
  // before the call, not after: if the model then fails, the record still
  // shows what was asked, which is the difference between diagnosing a bad
  // result and guessing at one.
  const full = await compilePrompt(brain, gen.prompt);
  await query(`update generations set full_prompt = $2 where id = $1`, [id, full]);

  const image = await generateImage(full, {
    aspect: "1:1",
    // Written the moment the provider hands one over, not after the picture
    // arrives: a run that then times out is only chaseable by its task id, and
    // the first timeout in production had none recorded to chase.
    onSubmitted: (taskId) =>
      query(`update generations set task_id = $2 where id = $1`, [id, taskId]).then(() => {}),
  });

  const ext = image.mime.includes("webp") ? "webp" : image.mime.includes("jpeg") ? "jpg" : "png";
  const key = storageKey(brain.id, `generated.${ext}`);
  await storage.put(key, image.bytes, image.mime);

  // Pays the artist and marks the row done, in one transaction. The cost is
  // the provider's own figure for this job, not an average.
  await settleGeneration(id, key, image.costCents);
}
