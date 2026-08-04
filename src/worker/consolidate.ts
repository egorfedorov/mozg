import { z } from "zod";
import { query, tx, toVector } from "@/db";
import type { Note } from "@/db/types";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages } from "@/lib/embed";
import { costCents, structured } from "@/lib/claude";
import { env } from "@/lib/env";
import { normalizeCategory } from "@/lib/category";
import { duplicatePairs } from "@/lib/notes";
import { clustersFromPairs } from "@/lib/consolidate";

/**
 * Merging the near-duplicates a brain accumulates.
 *
 * Write-time dedup only catches near-copies (cos ≥ 0.93, lib/dedup.ts). Below
 * that, duplicates pile up legally: two sources stating one rule in different
 * words, an agent writing down what a page already said, a re-read page after
 * an edit. Each one crowds search results and makes the brain look fuller than
 * it is — and an agent reading three variants of a fact trusts none of them.
 *
 * So once a day the tightest clusters of look-alike active notes are merged
 * into one canonical note each: the old notes go to superseded_by (auditable,
 * reversible), their chunks are deleted (search runs over chunks, so a merged
 * note must stop answering under its old shapes immediately), and the merge
 * itself is one Haiku call instructed to lose nothing.
 */

/**
 * Similarity ~0.91 — validated on production data (2026-08-04, 300 sampled
 * chunks across the six largest brains): below distance 0.09 every sampled
 * pair was the same fact in different words; between 0.09 and 0.12 the pairs
 * turned into *related but distinct* facts — "NativeTabs SDK 54" vs "SDK 55
 * and later", adapter-cloudflare vs adapter-cloudflare-workers — which must
 * never merge. Dedup's write-time 0.93 catches near-copies; this catches
 * paraphrases and stops before versions.
 */
const CONSOLIDATE_DISTANCE = 0.09;

/**
 * Notes younger than this are left alone even when they pair up — an agent
 * may still be correcting today's write, and review-required brains hold the
 * day's work in pending anyway. Merging under active work produces a merge
 * that is stale the moment it lands.
 */
const MIN_NOTE_AGE_HOURS = 24;

/**
 * Below this many active notes a brain rarely holds enough redundancy to be
 * worth a model call looking for it.
 */
const MIN_ACTIVE_NOTES = 15;

/** Brains per run. One enormous account must not starve the rest. */
const BRAIN_BATCH = 10;

/** Pairs to consider per brain; duplicatePairs is one indexed kNN per chunk. */
const PAIR_LIMIT = 60;

/**
 * Every merged cluster costs one Claude call, so the caps *are* the cost
 * ceiling: worst case per run is MAX_CLUSTERS_PER_RUN Haiku calls. Per-brain
 * the tightest clusters go first (pairs arrive sorted by distance), so a cut
 * drops the merges that matter least.
 */
const MAX_CLUSTERS_PER_BRAIN = 5;
const MAX_CLUSTERS_PER_RUN = 20;

const merged = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  category: z.string().max(80).nullable(),
});

const MERGE_SCHEMA = {
  type: "object",
  properties: {
    title: { type: "string", description: "Short and searchable." },
    body: {
      type: "string",
      description: "One self-contained note combining every fact from the inputs.",
    },
    category: {
      type: ["string", "null"],
      description: "Reuse one of the input categories when they have one.",
    },
  },
  required: ["title", "body", "category"],
  additionalProperties: false,
} as const;

export interface ConsolidateReport {
  brains: number;
  /** Clusters a merge was attempted for. */
  clusters: number;
  /** Clusters that actually landed as a merged note. */
  merged: number;
  /** Notes superseded into those merges. */
  superseded: number;
  /** Clusters abandoned mid-merge (changed underfoot, bad model output). */
  skipped: number;
  costCents: number;
}

export async function runConsolidation(): Promise<ConsolidateReport> {
  // Counted live rather than read off brains.note_count: that column is a
  // display cache, and a consolidation decision is exactly the place to not
  // trust a cache.
  const brains = await query<{ id: string; notes: number }>(
    `select brain_id as id, count(*)::int as notes
       from notes where status = 'active'
      group by 1 having count(*) >= $1
      order by 2 desc
      limit $2`,
    [MIN_ACTIVE_NOTES, BRAIN_BATCH],
  );

  const report: ConsolidateReport = {
    brains: brains.length,
    clusters: 0,
    merged: 0,
    superseded: 0,
    skipped: 0,
    costCents: 0,
  };

  let budget = MAX_CLUSTERS_PER_RUN;
  for (const brain of brains) {
    const result = await consolidateBrain(
      brain.id,
      Math.min(MAX_CLUSTERS_PER_BRAIN, budget),
    );
    report.clusters += result.clusters;
    report.merged += result.merged;
    report.superseded += result.superseded;
    report.skipped += result.skipped;
    report.costCents += result.costCents;
    budget -= result.clusters;
    if (budget <= 0) break;
  }

  return report;
}

async function consolidateBrain(
  brainId: string,
  maxClusters: number,
): Promise<Omit<ConsolidateReport, "brains">> {
  const report = { clusters: 0, merged: 0, superseded: 0, skipped: 0, costCents: 0 };
  if (maxClusters <= 0) return report;

  // Pending notes are never in here — duplicatePairs joins on status =
  // 'active'. That is deliberate: pending means "a human has not decided yet",
  // and merging before the decision would pre-empt it.
  const pairs = await duplicatePairs(brainId, {
    limit: PAIR_LIMIT,
    maxDistance: CONSOLIDATE_DISTANCE,
    minAgeHours: MIN_NOTE_AGE_HOURS,
  });

  const clusters = clustersFromPairs(pairs, maxClusters);
  report.clusters = clusters.length;

  for (const ids of clusters) {
    try {
      const done = await mergeCluster(brainId, ids);
      if (!done) {
        report.skipped++;
        continue;
      }
      report.merged++;
      report.superseded += done.superseded;
      report.costCents += done.costCents;
    } catch (err) {
      // One bad cluster must not sink the pass: a model hiccup or a cluster
      // that changed underfoot is skipped, logged, and retried by tomorrow's
      // run rather than aborting every other brain.
      report.skipped++;
      console.warn(
        `[consolidate] ${brainId} cluster ${ids.join(",")} skipped:`,
        err instanceof Error ? err.message : err,
      );
    }
  }

  return report;
}

/**
 * One cluster -> one canonical note, atomically with superseding the notes it
 * replaces. Returns null when the cluster no longer qualifies (someone
 * superseded a member between pairing and merging).
 */
async function mergeCluster(
  brainId: string,
  ids: string[],
): Promise<{ superseded: number; costCents: number } | null> {
  const notes = await query<Pick<Note, "id" | "title" | "body" | "category">>(
    `select id, title, body, category from notes
      where id = any($1::uuid[]) and status = 'active'
      order by created_at`,
    [ids],
  );
  if (notes.length < 2) return null;

  const { data: raw, usage } = await structured<unknown>({
    model: env.MODEL_JUDGE, // Haiku — merging is rephrasing, not reasoning.
    maxTokens: 8000,
    toolName: "save_merged_note",
    toolDescription: "Save the single note that replaces the duplicates.",
    schema: MERGE_SCHEMA,
    system:
      "You consolidate duplicate notes in a knowledge base that AI agents read.\n\n" +
      "You are given notes that all state roughly the same facts. Write ONE " +
      "note that replaces them.\n\n" +
      "Keep every concrete value, rule, name and number from the inputs — " +
      "losing a specific is a failure; repeating one is fine to fix. Resolve " +
      "contradictions in favour of the later note. The result must be " +
      "self-contained: correct for a reader who never saw the originals.",
    content: [
      {
        type: "text",
        text: notes
          .map(
            (n, i) =>
              `<note ${i + 1}${n.category ? ` category="${n.category}"` : ""}>\n` +
              `<title>${n.title}</title>\n<body>${n.body}</body>\n</note>`,
          )
          .join("\n\n"),
      },
    ],
  });

  const parsed = merged.safeParse(raw);
  if (!parsed.success) throw new Error("merge output schema mismatch");
  const canonical = parsed.data;

  const texts = chunksForNote(canonical.title, canonical.body);
  const vectors = await embedPassages(texts);
  if (texts.length !== vectors.length) {
    throw new Error("embedder returned a vector count that does not match the chunks");
  }

  const superseded = await tx(async (client) => {
    const { rows } = await client.query<{ id: string }>(
      `insert into notes (brain_id, title, body, category, kind, author, status)
       values ($1, $2, $3, $4, 'fact', 'consolidated', 'active')
       returning id`,
      [
        brainId,
        canonical.title,
        canonical.body,
        // Same canonicalisation as every other write path, or the merge
        // reintroduces the casing duplicates 0013 removed.
        normalizeCategory(canonical.category) ?? notes[0].category,
      ],
    );
    const noteId = rows[0].id;

    // Guarded on status: if another path merged or replaced a member since
    // pairing, the count comes back short and the rollback abandons the whole
    // merge — the alternative is a canonical note built from facts a newer
    // note has already corrected.
    const flipped = await client.query<{ id: string }>(
      `update notes
          set status = 'superseded', superseded_by = $2,
              superseded_reason = 'merged into a consolidated note',
              superseded_at = now()
        where id = any($1::uuid[]) and status = 'active'
        returning id`,
      [ids, noteId],
    );
    if (flipped.rows.length !== notes.length) {
      throw new Error(
        `cluster changed mid-merge (${flipped.rows.length}/${notes.length} still active)`,
      );
    }

    // Search runs over chunks, not notes: the old notes must stop answering
    // under their old shapes in the same transaction that creates the new one.
    await client.query(`delete from chunks where note_id = any($1::uuid[])`, [ids]);

    for (let i = 0; i < texts.length; i++) {
      await client.query(
        `insert into chunks (brain_id, note_id, content, token_count, embedding)
         values ($1, $2, $3, $4, $5::vector)`,
        [brainId, noteId, texts[i], estimateTokens(texts[i]), toVector(vectors[i])],
      );
    }

    return flipped.rows.length;
  });

  // Stamped so the maintenance pass re-sits the exam: the brain's content
  // changed, and a merged fact can move a check either way.
  await query(`update brains set content_changed_at = now() where id = $1`, [brainId]);

  return { superseded, costCents: costCents(env.MODEL_JUDGE, usage) };
}
