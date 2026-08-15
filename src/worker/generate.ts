import { one, query } from "@/db";
import type { Brain } from "@/db/types";
import { compilePrompt, settleGeneration } from "@/lib/generate";
import { generateImage } from "@/lib/imagegen";
import { cutChroma, DEFAULT_KEY, KEYS } from "@/lib/cutout";
import { distinctClause, ROLES, type AssetRole } from "@/lib/slotgen";
import { packKey, storage, storageKey } from "@/lib/storage";
import { enqueueGeneration } from "@/worker/queue";

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
    // The key this pack's prompts asked for. Cutting on any other colour is
    // how a symbol comes back with a hole where its own colour was.
    chroma: string | null;
    is_anchor: boolean;
    /** The anchor's picture, once it exists. Every other asset in the set is
     *  drawn against it. */
    reference_key: string | null;
  }>(
    `select g.brain_id, g.pack_id, g.role, g.prompt, g.full_prompt, g.status,
            g.is_anchor, p.chroma, p.reference_key
       from generations g
       left join asset_packs p on p.id = g.pack_id
      where g.id = $1`,
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

  // Everything after the anchor is drawn against the anchor's own picture —
  // the set's palette, light and outline weight are decided by a file rather
  // than re-described in words the model reinterprets each call.
  //
  // And against its finished siblings, which is what stops a tomb set from
  // arriving as two eyes of Horus, two pillars and four scarabs: without them
  // every call reaches for the theme's most obvious object, because every call
  // is the first one as far as the model knows.
  const siblings =
    gen.pack_id && !gen.is_anchor ? await packSiblings(gen.pack_id, id) : [];

  const references: string[] = [];
  if (!gen.is_anchor && gen.reference_key) {
    const anchor = await referenceDataUri(gen.reference_key);
    if (anchor) references.push(anchor);
  }
  for (const sibling of siblings) {
    if (references.length >= MAX_REFERENCES) break;
    if (sibling.storage_key === gen.reference_key) continue;
    const uri = await referenceDataUri(sibling.storage_key);
    if (uri) references.push(uri);
  }

  if (siblings.length) {
    full = `${full}\n\n${distinctClause(siblings.map((s) => s.prompt))}`;
    // What was actually sent, so a repeat can be diagnosed from the record
    // rather than reconstructed from what we think we sent.
    await query(`update generations set full_prompt = $2 where id = $1`, [id, full]);
  }

  const image = await generateImage(full, {
    aspect: isPackAsset && gen.role ? aspectFor(gen.role) : "1:1",
    ...(references.length ? { imageUrls: references } : {}),
    // Written the moment the provider hands one over, not after the picture
    // arrives: a run that then times out is only chaseable by its task id, and
    // the first timeout in production had none recorded to chase.
    onSubmitted: (taskId) =>
      query(`update generations set task_id = $2 where id = $1`, [id, taskId]).then(() => {}),
  });

  // Roles that declare themselves cut out get the key removed here rather
  // than in the studio's own pipeline: "on transparency" is what was sold, and
  // a green square with instructions attached is not that.
  const cuts = Boolean(gen.role && ROLES[gen.role as AssetRole]?.cutout);
  const cut = cuts ? await cutChroma(image.bytes, KEYS[gen.chroma ?? ""] ?? DEFAULT_KEY) : null;
  if (cut && cut.keyed < 0.05) {
    // Not a failure — the picture is fine and the studio paid for it — but a
    // symbol that keyed almost nothing means the model ignored the background
    // instruction, and that is worth seeing in the log rather than discovering
    // in an engine.
    console.warn(`[generate] ${id} keyed only ${(cut.keyed * 100).toFixed(1)}% — flat key missing?`);
  }

  const bytes = cut ? cut.png : image.bytes;
  const mime = cut ? "image/png" : image.mime;
  const ext = cut ? "png" : image.mime.includes("webp") ? "webp" : image.mime.includes("jpeg") ? "jpg" : "png";
  // A pack's assets live under the pack, not under a brain: most packs have no
  // brain at all, and the ones that do borrow someone else's — filing a
  // studio's art under an artist's folder would put two people's work in one
  // place with one of them unable to find theirs.
  const key = gen.pack_id
    ? packKey(gen.pack_id, `${gen.role ?? "asset"}.${ext}`)
    : storageKey(brain!.id, `generated.${ext}`);
  await storage.put(key, bytes, mime);

  // Pays the artist and marks the row done, in one transaction. The cost is
  // the provider's own figure for this job, not an average.
  await settleGeneration(id, key, image.costCents);

  // The anchor just became the reference. Record it, then let the rest of the
  // set go — they were held back precisely until this picture existed.
  if (gen.pack_id && gen.is_anchor) {
    await query(`update asset_packs set reference_key = $2 where id = $1`, [gen.pack_id, key]);
    await releaseRest(gen.pack_id);
  }
}

/**
 * How many pictures ride along with a prompt.
 *
 * The provider takes fourteen; five is the anchor plus four siblings, which is
 * enough for "do not repeat these" without turning every call into a megabyte
 * upload. The siblings chosen are the most recent, so the newest divergences
 * are the ones being avoided.
 */
const MAX_REFERENCES = 5;

/** The finished symbols of this pack, newest first, with what each was asked
 *  for — the words go in the prompt, the pictures go alongside it. */
async function packSiblings(
  packId: string,
  self: string,
): Promise<{ prompt: string; storage_key: string }[]> {
  return query<{ prompt: string; storage_key: string }>(
    `select prompt, storage_key from generations
      where pack_id = $1 and id <> $2 and status = 'done'
        and storage_key is not null and role = 'symbol'
      order by finished_at desc nulls last
      limit 4`,
    [packId, self],
  ).catch(() => []);
}

/**
 * Read the anchor back as a data URI.
 *
 * A data URI rather than a link because the bucket is private: handing the
 * provider a signed URL would mean minting one that outlives the request, and
 * a 1K PNG is comfortably inside the ten megabytes it accepts.
 */
async function referenceDataUri(key: string): Promise<string | null> {
  try {
    const body = await storage.get(key);
    const ext = key.split(".").pop()?.toLowerCase();
    const mime = ext === "jpg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return `data:${mime};base64,${body.toString("base64")}`;
  } catch {
    // A missing reference must not cost the studio the rest of its set: the
    // assets are still generated, just from the words alone.
    console.warn(`[generate] reference ${key} unreadable — continuing without it`);
    return null;
  }
}

/**
 * Queue everything in the pack that was waiting on the anchor.
 *
 * Called after the anchor lands, and also after it fails: a set whose anchor
 * died is still paid for, and the studio is owed its assets even if they will
 * match each other less closely than they should have.
 */
export async function releaseRest(packId: string): Promise<void> {
  const waiting = await query<{ id: string }>(
    `select id from generations
      where pack_id = $1 and not is_anchor and status = 'queued'`,
    [packId],
  );
  for (const row of waiting) {
    await enqueueGeneration(row.id).catch(() => {
      // Swallowed on purpose: the row is paid for and stays queued, so the
      // next worker start sweeps it.
    });
  }
}
