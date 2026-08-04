import { query } from "@/db";
import { fetchPageText, contentHash } from "@/lib/page";
import { enqueueIngest, enqueueExam, enqueueCrawl } from "@/worker/queue";

/**
 * Keeping brains honest without being asked.
 *
 * A brain decays in ways nobody notices: a documentation page is rewritten and
 * the notes taken from it quietly become wrong; material piles up while the
 * score still reflects an exam from three weeks ago. Both are silent, which is
 * the worst property a knowledge base can have — it keeps answering
 * confidently.
 *
 * This runs on a schedule and is deliberately cheap. Checking a page costs one
 * request and a hash; a model is only paid for when the text actually changed.
 */

/** How long a page may go unchecked. */
const RECHECK_AFTER = "3 days";

/** Pages per pass. A cap, so one enormous account cannot starve the rest. */
const REFRESH_BATCH = 40;
const EXAM_BATCH = 10;

export interface RefreshReport {
  checked: number;
  unchanged: number;
  changed: number;
  failed: number;
  /** Sources that had no fingerprint yet — recorded, not re-read. */
  adopted: number;
}

/**
 * Re-read URL sources and re-ingest only the ones whose text actually moved.
 *
 * The notes from a changed page are superseded rather than deleted: the old
 * ones stay auditable, and the owner can see what a page used to say. They are
 * superseded *before* the re-ingest rather than after, so a brain is never
 * briefly answering from both versions at once.
 */
export async function refreshUrlSources(limit = REFRESH_BATCH): Promise<RefreshReport> {
  const due = await query<{ id: string; url: string; brain_id: string; content_hash: string | null }>(
    `select id, url, brain_id, content_hash from sources
      where kind = 'url' and status = 'ready' and url is not null
        and (checked_at is null or checked_at < now() - interval '${RECHECK_AFTER}')
      order by checked_at nulls first
      limit $1`,
    [limit],
  );

  const report: RefreshReport = {
    checked: 0,
    unchanged: 0,
    changed: 0,
    failed: 0,
    adopted: 0,
  };

  for (const source of due) {
    report.checked++;
    let text: string;
    try {
      text = await fetchPageText(source.url);
    } catch (err) {
      // A page that 404s or times out is not an error worth failing the pass
      // for — record the attempt so it goes to the back of the queue, and say
      // so on the source rather than silently retrying it every three days.
      report.failed++;
      await query(
        `update sources set checked_at = now(), error = $2 where id = $1`,
        [source.id, `refresh failed: ${err instanceof Error ? err.message : String(err)}`],
      );
      continue;
    }

    const hash = contentHash(text);

    // A source ingested before fingerprints existed has no hash to compare
    // against. That is not evidence the page changed — its notes are as good
    // as they ever were. Record what the page looks like now and leave it
    // alone; otherwise the first pass after this ships would supersede every
    // URL-derived note in the product and bill every owner to re-read the web.
    if (!source.content_hash) {
      report.adopted++;
      await query(
        `update sources set content_hash = $2, checked_at = now(), error = null
          where id = $1`,
        [source.id, hash],
      );
      continue;
    }

    if (hash === source.content_hash) {
      report.unchanged++;
      await query(`update sources set checked_at = now(), error = null where id = $1`, [
        source.id,
      ]);
      continue;
    }

    report.changed++;

    await query(
      `update notes
          set status = 'superseded',
              superseded_reason = 'the page it came from changed',
              superseded_at = now()
        where source_id = $1 and status = 'active'`,
      [source.id],
    );

    // Superseded notes must stop answering queries immediately, which means
    // their chunks have to go — search runs over chunks, not notes.
    await query(
      `delete from chunks where note_id in (
         select id from notes where source_id = $1 and status = 'superseded'
       )`,
      [source.id],
    );

    // extract_payload must go too — otherwise the re-ingest would skip the
    // paid step and re-chunk the *old* page's notes (see 0011).
    await query(
      `update sources
          set status = 'queued', content_hash = $2, checked_at = now(),
              changed_at = now(), refresh_count = refresh_count + 1,
              note_count = 0, error = null, extract_payload = null
        where id = $1`,
      [source.id, hash],
    );

    await query(`update brains set content_changed_at = now() where id = $1`, [
      source.brain_id,
    ]);

    await enqueueIngest(source.id);
  }

  return report;
}

/**
 * Re-sit the exam for brains that learned something since they were last
 * scored. Ingest already enqueues an exam after each source, so this is the
 * backstop for the runs that failed, were skipped while the brain had no goal,
 * or were dropped when the worker restarted.
 */
export async function examStaleBrains(limit = EXAM_BATCH): Promise<string[]> {
  const stale = await query<{ id: string }>(
    `select id from brains
      where goal is not null and note_count > 0
        and (score_at is null or content_changed_at > score_at)
      order by content_changed_at nulls first
      limit $1`,
    [limit],
  );

  for (const brain of stale) await enqueueExam(brain.id);
  return stale.map((b) => b.id);
}

/** How long a crawled site may go without checking for new pages. */
const RECRAWL_AFTER = "7 days";
const RECRAWL_BATCH = 10;

/**
 * Re-run old site crawls so a docs site that grew a chapter grows the brain
 * with it. Cheap by construction: the crawl skips every page that is already
 * a source, so an unchanged site costs one discovery pass and zero
 * extractions. Page *content* changes are refreshUrlSources' job — this one
 * only finds pages that did not exist before.
 */
export async function recrawlSites(limit = RECRAWL_BATCH): Promise<number> {
  const due = await query<{ id: string }>(
    `update sources set status = 'queued', error = null
      where id in (
        select id from sources
         where kind = 'site' and status = 'ready'
           and processed_at < now() - interval '${RECRAWL_AFTER}'
         order by processed_at
         limit $1
      )
      returning id`,
    [limit],
  );
  for (const s of due) await enqueueCrawl(s.id);
  return due.length;
}

/**
 * Sources paused by the extraction budget resume themselves. The budget is a
 * rolling 24h window, so by the next maintenance pass there is usually room
 * again; if not, the re-run costs one SQL check and fails with the same
 * message — no model is paid until the window actually has space.
 */
export async function requeueBudgetPaused(limit = 50): Promise<number> {
  const due = await query<{ id: string }>(
    `update sources set status = 'queued', error = null
      where id in (
        select id from sources
         where status = 'failed' and error like 'daily budget:%'
         order by processed_at
         limit $1
      )
      returning id`,
    [limit],
  );
  for (const s of due) await enqueueIngest(s.id);
  return due.length;
}

export async function runMaintenance(): Promise<{
  refresh: RefreshReport;
  examined: number;
  recrawled: number;
  resumed: number;
}> {
  const resumed = await requeueBudgetPaused();
  const recrawled = await recrawlSites();
  const refresh = await refreshUrlSources();
  // After the refresh, so a page that changed a minute ago is re-examined in
  // the same pass rather than waiting a full day for the next one.
  const examined = await examStaleBrains();
  return { refresh, examined: examined.length, recrawled, resumed };
}
