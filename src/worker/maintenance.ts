import { query } from "@/db";
import { fetchPageText, contentHash } from "@/lib/page";
import { enqueueIngest, enqueueExam, enqueueCrawl, PRIORITY } from "@/worker/queue";
import { growSearchGapChecks } from "@/worker/search-gaps";

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
/**
 * The cap when a person asked. Higher than the scheduled batch because a brain
 * built from a documentation site has hundreds of pages and "update it" that
 * only touched forty of them would be a lie told with a progress message.
 */
const ON_DEMAND_BATCH = 400;
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
export async function refreshUrlSources(
  limit = REFRESH_BATCH,
  /**
   * One brain, checked now. The scheduled pass takes whatever is due across
   * everyone; a person asking "update this brain" is not asking about the
   * three-day window, they are saying the page changed today — so a named brain
   * ignores checked_at entirely. Still one fetch and a hash per page, and still
   * only a changed page costs a re-read.
   */
  brainId?: string,
): Promise<RefreshReport> {
  const due = await query<{ id: string; url: string; brain_id: string; content_hash: string | null }>(
    `select id, url, brain_id, content_hash from sources
      where kind = 'url' and status = 'ready' and url is not null
        and ($2::uuid is null or brain_id = $2::uuid)
        and ($2::uuid is not null
             or checked_at is null or checked_at < now() - interval '${RECHECK_AFTER}')
      order by checked_at nulls first
      limit $1`,
    [limit, brainId ?? null],
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

    await enqueueIngest(source.id, PRIORITY.background);
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

/**
 * The longest a sitting can honestly still be in progress. A full exam is ~30
 * checks against a judge; an hour is generous even for a large family.
 */
const RUN_MAX_AGE = "60 minutes";

/**
 * Close sittings nobody is running any more.
 *
 * A run is marked 'running' before the first check and 'done' or 'failed' at
 * the end — so a worker that is killed mid-sitting (a deploy recreates the
 * container, an OOM, a lost database connection) leaves the row open forever.
 * Production had 18 of them, the oldest 41 hours old, and they are not
 * cosmetic: a brain whose latest run says 'running' is a brain the operator
 * reads as busy rather than as never scored.
 *
 * The age guard is what makes this safe rather than a boot-time sweep would be:
 * autoscale runs up to two workers, so "open right now" does not mean
 * abandoned — only "open for longer than a sitting can possibly take" does.
 */
export async function closeAbandonedRuns(): Promise<number> {
  const closed = await query<{ id: string }>(
    `update check_runs
        set status = 'failed', finished_at = now(),
            error = coalesce(error, 'abandoned: the worker running this sitting went away')
      where status = 'running' and started_at < now() - interval '${RUN_MAX_AGE}'
      returning id`,
  );
  return closed.length;
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
export async function recrawlSites(limit = RECRAWL_BATCH, brainId?: string): Promise<number> {
  const due = await query<{ id: string }>(
    `update sources set status = 'queued', error = null
      where id in (
        select id from sources
         where kind = 'site' and status = 'ready'
           and ($2::uuid is null or brain_id = $2::uuid)
           and ($2::uuid is not null
                or processed_at < now() - interval '${RECRAWL_AFTER}')
         order by processed_at
         limit $1
      )
      returning id`,
    [limit, brainId ?? null],
  );
  for (const s of due) await enqueueCrawl(s.id);
  return due.length;
}

/**
 * Sources paused by the extraction budget resume themselves. The daily window
 * usually has room again by the next pass; the monthly one rolls slower but
 * also moves the moment the owner upgrades their plan — and either way a
 * premature re-run costs one SQL check and fails with the same message. No
 * model is paid until the window actually has space.
 *
 * Both prefixes, deliberately: this sweep matched only 'daily budget:%' while
 * ingest also writes 'monthly budget:%' — 41 sources on one free account sat
 * failed forever, waiting for a requeue that could never see them.
 */
export async function requeueBudgetPaused(limit = 50): Promise<number> {
  const due = await query<{ id: string }>(
    `update sources set status = 'queued', error = null
      where id in (
        select id from sources
         where status = 'failed'
           and (error like 'daily budget:%' or error like 'monthly budget:%')
         order by processed_at
         limit $1
      )
      returning id`,
    [limit],
  );
  for (const s of due) await enqueueIngest(s.id, PRIORITY.background);
  return due.length;
}

/**
 * Everything "update this brain" means, in one call: re-read the pages whose
 * text moved, and re-walk the sites for pages that did not exist last time.
 *
 * On demand rather than on the schedule, because the schedule is a guarantee of
 * eventual freshness and a person watching a release ship is not asking for
 * eventual. Cheap by construction — a fetch and a hash per page, and only a page
 * that actually changed reaches the paid extractor, where the plan budget still
 * applies.
 */
export async function refreshBrain(brainId: string): Promise<{
  checked: number;
  changed: number;
  failed: number;
  sitesRecrawled: number;
}> {
  const sites = await recrawlSites(RECRAWL_BATCH, brainId);
  const report = await refreshUrlSources(ON_DEMAND_BATCH, brainId);
  return {
    checked: report.checked,
    changed: report.changed,
    failed: report.failed,
    sitesRecrawled: sites,
  };
}

export async function runMaintenance(): Promise<{
  refresh: RefreshReport;
  examined: number;
  recrawled: number;
  resumed: number;
  gapChecks: number;
  abandoned: number;
}> {
  const resumed = await requeueBudgetPaused();
  // Before examStaleBrains: an abandoned run closed here is a brain that gets
  // re-queued in the same pass instead of waiting six hours for the next one.
  const abandoned = await closeAbandonedRuns();
  const recrawled = await recrawlSites();
  const refresh = await refreshUrlSources();
  // After the refresh, so a page that changed a minute ago is re-examined in
  // the same pass rather than waiting a full day for the next one.
  const examined = await examStaleBrains();
  // Real searches that came back weak become exam checks, so the next
  // sitting measures what callers actually asked and could not get. After
  // examStaleBrains deliberately: a check added now is graded by the exam
  // this pass just queued, not by one a pass away.
  const gapChecks = await growSearchGapChecks();
  return {
    refresh,
    examined: examined.length,
    recrawled,
    resumed,
    gapChecks: gapChecks.added,
    abandoned,
  };
}
