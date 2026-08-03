import { query, one, tx, toVector } from "@/db";
import type { Brain, Finding, Source } from "@/db/types";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { embedPassages } from "@/lib/embed";
import { extractFromImage, extractFromPdf, extractFromText } from "@/lib/extract";
import { scanSecrets } from "@/lib/scan";
import { storage } from "@/lib/storage";
import { fetchPageText, contentHash } from "@/lib/page";
import { enqueueExam } from "@/worker/queue";

/**
 * One source -> notes -> chunks.
 *
 *   secret scan -> extract -> secret scan again -> dedup -> chunk -> embed
 *
 * The scan runs twice on purpose: once on what we were given, once on what the
 * model wrote. A model asked not to transcribe a token will still occasionally
 * paraphrase one into a note.
 */

/** cos distance below this means "the brain already knows this". */
const DUPLICATE_DISTANCE = 0.07;

export interface IngestResult {
  status: "ready" | "rejected" | "failed";
  notes: number;
  findings?: Finding[];
  costCents?: number;
}

export async function ingestSource(sourceId: string): Promise<IngestResult> {
  const source = await one<Source>(`select * from sources where id = $1`, [sourceId]);

  if (source.status === "ready") {
    return { status: "ready", notes: source.note_count };
  }

  const brain = await one<Brain>(`select * from brains where id = $1`, [
    source.brain_id,
  ]);

  await query(
    `update sources set status = 'processing', error = null, processing_at = now()
      where id = $1`,
    [sourceId],
  );

  try {
    // The vocabulary to file notes under, exam categories first.
    //
    // This used to be the categories already on notes, which drifts: the exam
    // asks about "Spacing and layout" while extraction invents "Type scale and
    // spacing", and the coverage view then reports no notes for a category that
    // is in fact covered. The exam's own labels are the authority — they come
    // from the goal, which is the thing the brain is measured against.
    const categories = (
      await query<{ category: string }>(
        `select category, 0 as rank from checks
          where brain_id = $1 and enabled and category is not null
         union
         select distinct category, 1 as rank from notes
          where brain_id = $1 and status = 'active' and category is not null
         order by rank, category
         limit 40`,
        [brain.id],
      )
    ).map((r) => r.category);

    const extracted = await extract(source, brain, categories);

    // ── secret gate ────────────────────────────────────────────────────────
    const combined = extracted.notes.map((n) => `${n.title}\n${n.body}`).join("\n\n");
    const findings = scanSecrets(combined);
    if (findings.length) {
      await query(
        `update sources
            set status = 'rejected', reject_reason = 'secrets_detected',
                findings = $2, processed_at = now(), cost_cents = $3
          where id = $1`,
        [sourceId, JSON.stringify(findings), Math.round(extracted.usage.costCents)],
      );
      return { status: "rejected", notes: 0, findings };
    }

    if (!extracted.notes.length) {
      await query(
        `update sources
            set status = 'ready', note_count = 0, processed_at = now(), cost_cents = $2
          where id = $1`,
        [sourceId, Math.round(extracted.usage.costCents)],
      );
      return { status: "ready", notes: 0, costCents: extracted.usage.costCents };
    }

    // ── chunk + embed ──────────────────────────────────────────────────────
    const perNote = extracted.notes.map((n) => chunksForNote(n.title, n.body));
    const flat = perNote.flat();
    const vectors = await embedPassages(flat);

    // ── persist ────────────────────────────────────────────────────────────
    let cursor = 0;
    let inserted = 0;

    await tx(async (client) => {
      for (let i = 0; i < extracted.notes.length; i++) {
        const note = extracted.notes[i];
        const texts = perNote[i];
        const noteVectors = vectors.slice(cursor, cursor + texts.length);
        cursor += texts.length;
        if (!noteVectors.length) continue;

        // Dedup on the note's leading chunk — that's where title + first
        // sentence live, which is what makes two notes "the same fact".
        const dup = await client.query<{ note_id: string; distance: number }>(
          `select c.note_id, (c.embedding <=> $2::vector) as distance
             from chunks c
             join notes n on n.id = c.note_id
            where c.brain_id = $1 and n.status = 'active'
            order by c.embedding <=> $2::vector
            limit 1`,
          [brain.id, toVector(noteVectors[0])],
        );

        const duplicate =
          dup.rows[0] && Number(dup.rows[0].distance) < DUPLICATE_DISTANCE
            ? dup.rows[0].note_id
            : null;

        const { rows } = await client.query<{ id: string }>(
          `insert into notes
             (brain_id, source_id, title, body, category, kind, confidence, author)
           values ($1, $2, $3, $4, $5, $6, $7, 'ingest')
           returning id`,
          [
            brain.id,
            source.id,
            note.title,
            note.body,
            note.category,
            note.kind,
            note.confidence,
          ],
        );
        const noteId = rows[0].id;
        inserted++;

        // Supersede rather than delete: the old note stays auditable, and a
        // bad merge can be undone without re-ingesting the source.
        if (duplicate) {
          await client.query(
            `update notes set status = 'superseded', superseded_by = $2
              where id = $1 and status = 'active'`,
            [duplicate, noteId],
          );
        }

        for (let c = 0; c < texts.length; c++) {
          await client.query(
            `insert into chunks (brain_id, note_id, content, token_count, embedding)
             values ($1, $2, $3, $4, $5::vector)`,
            [
              brain.id,
              noteId,
              texts[c],
              estimateTokens(texts[c]),
              toVector(noteVectors[c]),
            ],
          );
        }
      }

      await client.query(
        `update sources
            set status = 'ready', note_count = $2, processed_at = now(), cost_cents = $3
          where id = $1`,
        [sourceId, inserted, Math.round(extracted.usage.costCents)],
      );
    });

    // Stamped so the maintenance pass can tell a brain that learned something
    // since its last exam from one that has simply not been touched.
    await query(`update brains set content_changed_at = now() where id = $1`, [brain.id]);

    // A brain with a goal re-sits its exam whenever it learns something.
    if (brain.goal) await enqueueExam(brain.id);

    return { status: "ready", notes: inserted, costCents: extracted.usage.costCents };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    await query(
      `update sources set status = 'failed', error = $2, processed_at = now()
        where id = $1`,
      [sourceId, message.slice(0, 1000)],
    );
    throw err;
  }
}

async function extract(source: Source, brain: Brain, categories: string[]) {
  if (source.kind === "image") {
    if (!source.storage_key) throw new Error("image source has no storage key");
    const bytes = await storage.get(source.storage_key);
    return extractFromImage(bytes, { goal: brain.goal, categories });
  }

  if (source.mime === "application/pdf") {
    if (!source.storage_key) throw new Error("pdf source has no storage key");
    const bytes = await storage.get(source.storage_key);
    return extractFromPdf(bytes, {
      goal: brain.goal,
      categories,
      label: source.original_name ?? undefined,
    });
  }

  if (source.kind === "url") {
    if (!source.url) throw new Error("url source has no url");

    const text = await fetchPageText(source.url);

    // Remember what we read, so the maintenance pass can tell an unchanged
    // page from one nobody has looked at.
    await query(
      `update sources set content_hash = $2, checked_at = now() where id = $1`,
      [source.id, contentHash(text)],
    );

    return extractFromText(text, {
      goal: brain.goal,
      categories,
      label: source.url,
    });
  }

  // text | file
  if (!source.storage_key) throw new Error("text source has no storage key");
  const bytes = await storage.get(source.storage_key);
  return extractFromText(bytes.toString("utf8"), {
    goal: brain.goal,
    categories,
    label: source.original_name ?? undefined,
  });
}
