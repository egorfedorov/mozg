import { pool, query, one, maybeOne, tx, toVector } from "@/db";
import { env } from "@/lib/env";
import type { Brain, Finding, Source } from "@/db/types";
import { chunksForNote, estimateTokens } from "@/lib/chunk";
import { limitsFor } from "@/lib/plans";
import { notifyBudgetPaused } from "@/lib/operator-chat";
import { byokStorage } from "@/lib/byok";
import { embedPassages } from "@/lib/embed";
import { extractFromImage, extractFromPdf, extractFromText, EXTRACT_PROMPT_VERSION, type ExtractResult } from "@/lib/extract";
import { redact, scanSecrets, secretGate } from "@/lib/scan";
import { findDuplicateNote } from "@/lib/dedup";
import { normalizeCategory } from "@/lib/category";
import { storage } from "@/lib/storage";
import { fetchPageText, contentHash } from "@/lib/page";
import { checkFetchableUrl } from "@/lib/url-guard";
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

export interface IngestResult {
  status: "ready" | "rejected" | "failed";
  notes: number;
  findings?: Finding[];
  costCents?: number;
}

/**
 * Thrown when another worker holds the source's lock. Not a failure of the
 * source — pg-boss retries the job, and by then the other run has finished.
 */
export class SourceBusyError extends Error {
  constructor(sourceId: string) {
    super(`source ${sourceId} is being ingested by another worker — left for retry`);
    this.name = "SourceBusyError";
  }
}

export async function ingestSource(sourceId: string): Promise<IngestResult> {
  // A deploy briefly runs two workers at once, and the new one's orphan sweep
  // requeues whatever the old one is still finishing — two extractions, two
  // Anthropic bills, one source. Hold a session lock for the whole run so the
  // second worker bows out instead. This is also why the startup sweep needs
  // no age threshold: a source that only looks orphaned bounces off this lock
  // and lands back on the queue. hashtextextended collisions cost a retry,
  // never a double run.
  const client = await pool.connect();
  try {
    const locked = await client.query<{ got: boolean }>(
      `select pg_try_advisory_lock(hashtextextended($1, 0)) as got`,
      [sourceId],
    );
    if (!locked.rows[0].got) throw new SourceBusyError(sourceId);

    try {
      return await ingestLocked(sourceId);
    } finally {
      await client.query(`select pg_advisory_unlock(hashtextextended($1, 0))`, [sourceId]);
    }
  } finally {
    client.release();
  }
}

async function ingestLocked(sourceId: string): Promise<IngestResult> {
  const source = await one<Source>(`select * from sources where id = $1`, [sourceId]);

  if (source.status === "ready") {
    return { status: "ready", notes: source.note_count };
  }

  // The maintenance refresh re-queues a source with changed_at newer than
  // its last completed processing — that is what "this ingest brings in
  // updated content" means, and the post-ingest exam probe keys on it.
  const wasRefresh =
    source.changed_at !== null &&
    (source.processed_at === null || source.changed_at > source.processed_at);

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
    )
      // Hand the model the canonical spellings, so "reuse an existing
      // category" cannot echo back a casing the write path would then
      // rewrite into a different string than the exam's label. Deduped after
      // normalising: "Type scale" and "type scale" were two rows above.
      .map((r) => normalizeCategory(r.category))
      .filter((c): c is string => c !== null)
      .filter((c, i, all) => all.indexOf(c) === i);

    // Extraction is the step that costs money, and pg-boss retries the whole
    // job — so a flake at the embed stage would otherwise buy the same
    // extraction again. Cache the payload on the source row; a retry skips
    // straight to chunking. Kept after success on purpose: it is a few KB per
    // source, and being able to re-chunk an old extraction beats re-buying
    // it. Maintenance clears it when a page's text actually changes.
    let extracted = source.extract_payload as ExtractResult | null;
    if (!extracted) {
      // The paid step gets a budget. Without one, a loop creating brains and
      // crawling large sites spends the platform's Anthropic bill at the
      // speed of the queue. Rolling 24h, per owner, sized by plan; a source
      // over the line fails with the reason in its error and the maintenance
      // pass requeues it once the window has rolled.
      // On a bring-your-own-key owner the budget guards nothing — the spend
      // is theirs, on their key — so it steps aside entirely.
      const byok = Boolean(byokStorage.getStore());
      const owner = await one<{ plan: string; paid_until: Date | null }>(
        `select u.plan, u.paid_until from "user" u where u.id = $1`,
        [brain.owner_id],
      );
      const limits = limitsFor(owner.plan as never, owner.paid_until);
      // Two windows, and both matter. The month is what the plan bought — a
      // ceiling only on the day was selling up to thirty times the price in
      // tokens. The day is the runaway guard on top: a crawl in a loop loses a
      // day of the allowance rather than the whole month.
      const { month, day } = await one<{ month: number; day: number }>(
        `select coalesce(sum(s.cost_cents) filter (
                  where s.processed_at > now() - interval '30 days'), 0)::int as month,
                coalesce(sum(s.cost_cents) filter (
                  where s.processed_at > now() - interval '24 hours'), 0)::int as day
           from sources s join brains b on b.id = s.brain_id
          where b.owner_id = $1 and s.processed_at > now() - interval '30 days'`,
        [brain.owner_id],
      );
      const over = byok
        ? null
        : month >= limits.monthlyExtractCents
          ? { window: "monthly", spent: month, budget: limits.monthlyExtractCents }
          : day >= limits.dailyExtractCents
            ? { window: "daily", spent: day, budget: limits.dailyExtractCents }
            : null;
      if (over) {
        // The owner hears about it in chat (mascot badge included), not only
        // in a source's error field nobody opens. Deduped inside; must not
        // block or fail the pause itself.
        await notifyBudgetPaused(
          brain.owner_id,
          over.window as "monthly" | "daily",
          owner.plan,
        ).catch(() => {});
        throw new Error(
          `${over.window} budget: extraction paused — ` +
            `${(over.spent / 100).toFixed(2)} of ${(over.budget / 100).toFixed(2)} USD used ` +
            `on the ${owner.plan} plan. ` +
            (over.budget === 0
              ? "Our AI reading for you is what a plan buys; teaching from your own CLI or " +
                "your own API key (settings) stays unlimited and starts working immediately."
              : "Resumes automatically as the window rolls."),
        );
      }

      extracted = await extract(source, brain, categories);
      await query(`update sources set extract_payload = $2 where id = $1`, [
        sourceId,
        JSON.stringify(extracted),
      ]);
    }

    // ── secret gate ────────────────────────────────────────────────────────
    const combined = extracted.notes.map((n) => `${n.title}\n${n.body}`).join("\n\n");
    const findings = scanSecrets(combined);
    // A waiver is the owner's recorded decision that these hits are
    // documentation examples (see 0017). The findings are still stored on the
    // source so the decision stays auditable next to what it let through.
    if (findings.length && source.scan_waived) {
      await query(`update sources set findings = $2 where id = $1`, [
        sourceId,
        JSON.stringify(findings),
      ]);
    }
    // A page fetched from a public URL is a different case from an upload, and
    // the gate was treating them the same. The scanner exists to stop a user's
    // own secret from entering a shared brain — a screenshot of their terminal,
    // a note their agent wrote. Nothing in a public documentation page is the
    // user's secret: the key in it is an example, already published by whoever
    // wrote the docs, and there is no leak left to prevent.
    //
    // Rejecting them cost twice. Sixty pages were thrown away on production —
    // Supabase's "connecting to postgres" and "managing user data", Hono's JWT
    // helper, ten AI SDK provider pages — which is exactly the material someone
    // asks a brain about. And the extraction was already paid for before the
    // gate ran, so we paid for notes we deleted.
    //
    // Redacting keeps the shape and drops the string: an agent reads
    // `SUPABASE_KEY=eyJ••••••I0` and learns which variable to set, not a
    // credential. Findings are still recorded on the source, so what the page
    // contained stays auditable.
    const gate = secretGate({
      kind: source.kind,
      findings: findings.length,
      waived: Boolean(source.scan_waived),
    });
    if (gate === "redact") {
      extracted = {
        ...extracted,
        notes: extracted.notes.map((n) => ({
          ...n,
          title: redact(n.title),
          body: redact(n.body),
        })),
      };
      await query(`update sources set findings = $2 where id = $1`, [
        sourceId,
        JSON.stringify(findings),
      ]);
    } else if (gate === "reject") {
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
        // Inside this transaction on purpose: the check must see the notes
        // this batch inserted moments ago, which are still uncommitted.
        const duplicate =
          (await findDuplicateNote(brain.id, noteVectors[0], client))?.note_id ?? null;

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
            // Canonical form, or "Type scale" / "type scale" stay two
            // categories forever (see lib/category.ts).
            normalizeCategory(note.category),
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
          // Search runs over chunks, not notes — a superseded note must stop
          // answering immediately, and its vectors would otherwise sit in the
          // hnsw/GIN indexes forever. Same reason maintenance deletes them.
          await client.query(`delete from chunks where note_id = $1`, [duplicate]);
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

    // A brain with a goal re-sits its exam whenever it learns something —
    // but not after every page of a hundred-page crawl. Wait until nothing
    // else is queued for this brain; if a page slips in right after this
    // check, the maintenance pass catches the gap (content_changed_at >
    // score_at) within six hours.
    //
    // A refresh re-ingest gets the mini probe instead of a full sitting:
    // re-judge the existing checks with one vote and record what regressed.
    // The full exam belongs to new material and manual re-sits — re-buying
    // it on every rewritten page would pay three votes to learn "two checks
    // flipped".
    if (brain.goal) {
      const { pending } = await one<{ pending: number }>(
        `select count(*)::int as pending from sources
          where brain_id = $1 and status in ('queued', 'processing')`,
        [brain.id],
      );
      if (pending === 0) await enqueueExam(brain.id, wasRefresh ? { mini: true } : undefined);
    }

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

/**
 * Extraction with a cross-source cache for text material.
 *
 * Same text + same model + same goal ⇒ same notes, so paying twice is pure
 * waste — re-crawls, the same page added twice, and re-reads after a cleanup
 * all hit this. The goal is part of the key on purpose: extraction is
 * goal-aware, and reusing notes made for a different goal would be cheaper
 * and quietly worse. Images and PDFs skip the cache — they duplicate rarely
 * and hashing their meaning is a different problem.
 */
/**
 * The exam steering every read: the questions the brain currently fails go
 * into the extraction prompt, so a re-read of a source is never blind — it
 * hunts for exactly what the score says is missing. Empty for a brain that
 * has no exam yet, or passes it.
 */
async function failedFocus(brainId: string): Promise<string[]> {
  // The parent's exam retrieves over the whole family, so its failures are
  // really the children's failures — and the children are where the source
  // material lives. A child re-reading only for its own exam would never
  // chase the family-level gaps. Own failures first; the parent's fill
  // whatever room is left.
  const rows = await query<{ question: string }>(
    `with latest as (
       select distinct on (brain_id) id, brain_id
         from check_runs
        where status = 'done'
          and brain_id in ($1, (select parent_id from brains where id = $1))
        order by brain_id, started_at desc
     )
     select c.question
       from check_results r
       join checks c on c.id = r.check_id
       join latest l on l.id = r.run_id
      where not r.passed
      order by (c.brain_id = $1) desc, c.weight desc
      limit 12`,
    [brainId],
  );
  return rows.map((r) => r.question);
}

async function cachedTextExtract(
  text: string,
  brain: Brain,
  categories: string[],
  label?: string,
): Promise<ExtractResult> {
  const focus = await failedFocus(brain.id);
  // Focus is part of the goal hash: a focused re-read is a different ask
  // than the blind first read, and must not be answered from its cache.
  const key = [
    contentHash(text),
    env.MODEL_EXTRACT,
    contentHash(`${EXTRACT_PROMPT_VERSION}\n${brain.goal ?? ""}\n${focus.join("\n")}`),
  ];

  const hit = await maybeOne<{ payload: ExtractResult }>(
    `select payload from extract_cache
      where content_hash = $1 and model = $2 and goal_hash = $3`,
    key,
  );
  if (hit) {
    // Free by definition: the money was spent when the cache was written.
    return { ...hit.payload, usage: { ...hit.payload.usage, costCents: 0 } };
  }

  const result = await extractFromText(text, { goal: brain.goal, categories, label, focus });

  await query(
    `insert into extract_cache (content_hash, model, goal_hash, payload, note_count)
     values ($1, $2, $3, $4, $5)
     on conflict (content_hash, model, goal_hash) do nothing`,
    [...key, JSON.stringify(result), result.notes.length],
  );
  return result;
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

    // A crawled link can be a PDF — payment specs and hardware docs live in
    // them. Text scraping would feed the model binary soup; the PDF path
    // hands the document over whole, layout included.
    if (/\.pdf(\?|#|$)/i.test(source.url)) {
      // Same SSRF re-check every other fetch does — DNS can change between
      // the add and the read, and a PDF fetch is still a fetch.
      const guard = await checkFetchableUrl(source.url);
      if (!guard.ok) throw new Error(`refusing to fetch: ${guard.reason}`);

      const res = await fetch(source.url, {
        signal: AbortSignal.timeout(60_000),
        headers: { "user-agent": "mozg/0.1 (+https://mozg.sh)" },
      });
      if (!res.ok) throw new Error(`fetch ${source.url} -> ${res.status}`);
      const bytes = Buffer.from(await res.arrayBuffer());
      if (bytes.length > 20 * 1024 * 1024) throw new Error("PDF is over 20 MB");

      await query(
        `update sources set content_hash = $2, checked_at = now(), mime = 'application/pdf'
          where id = $1`,
        [source.id, contentHash(bytes.toString("base64"))],
      );
      return extractFromPdf(bytes, {
        goal: brain.goal,
        categories,
        label: source.url,
        focus: await failedFocus(brain.id),
      });
    }

    const text = await fetchPageText(source.url);

    // Remember what we read, so the maintenance pass can tell an unchanged
    // page from one nobody has looked at.
    await query(
      `update sources set content_hash = $2, checked_at = now() where id = $1`,
      [source.id, contentHash(text)],
    );

    return cachedTextExtract(text, brain, categories, source.url);
  }

  // text | file
  if (!source.storage_key) throw new Error("text source has no storage key");
  const bytes = await storage.get(source.storage_key);
  return cachedTextExtract(
    bytes.toString("utf8"),
    brain,
    categories,
    source.original_name ?? undefined,
  );
}
