import { query } from "@/db";
import { env } from "@/lib/env";
import { redteamBrain } from "@/lib/redteam";
import { notifyGaps } from "@/lib/operator-chat";
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

/**
 * Pages per scheduled pass.
 *
 * This number is not a preference, it is the freshness promise divided by the
 * clock. RECHECK_AFTER says a page may go three days unchecked; the pass runs
 * four times a day (MAINTENANCE_CRON), so the catalogue can only keep that
 * promise while `batch x 4 x 3` covers every URL source in the product.
 *
 * It was 40, chosen when a few hundred pages existed. At 4,347 URL sources
 * that is 160 checks a day against 1,449 a day of demand: the pass covered
 * 11% of its own promise, re-reading a given page roughly once a month while
 * every log line said `checked=40 unchanged=40` and looked healthy. 500 covers
 * today's catalogue with about a third to spare, and `due` in the report below
 * is what says so out loud the next time the catalogue outgrows it.
 */
const REFRESH_BATCH = 500;

/**
 * How many pages are fetched at once. Sequential was fine at 40; at 500 it is
 * up to four minutes of waiting on other people's servers inside a job pg-boss
 * expires after fifteen. Six is polite to the hosts (most of the catalogue is
 * one CDN) and turns the pass back into a minute of work.
 */
const REFRESH_CONCURRENCY = 6;
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
  /**
   * How many were due when the pass started, batch or no batch. The one number
   * that tells an operator whether the promise is being kept: `due` above
   * `checked` for more than a pass or two means pages are ageing out of the
   * window faster than they are being looked at.
   */
  due: number;
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
  const where = `kind = 'url' and status = 'ready' and url is not null
        and ($1::uuid is null or brain_id = $1::uuid)
        and ($1::uuid is not null
             or checked_at is null or checked_at < now() - interval '${RECHECK_AFTER}')`;

  // The backlog, before the cap is applied. Counted separately rather than
  // inferred from a full batch: "we checked 500" and "500 was all there was"
  // are the difference between a pass that is keeping up and one that is not.
  const [{ n: due }] = await query<{ n: number }>(
    `select count(*)::int as n from sources where ${where}`,
    [brainId ?? null],
  );

  const batch = await query<{ id: string; url: string; brain_id: string; content_hash: string | null }>(
    `select id, url, brain_id, content_hash from sources
      where ${where}
      order by checked_at nulls first
      limit $2`,
    [brainId ?? null, limit],
  );

  const report: RefreshReport = {
    checked: 0,
    unchanged: 0,
    changed: 0,
    failed: 0,
    adopted: 0,
    due,
  };

  type Due = (typeof batch)[number];

  /** One page: fetch, compare, and re-ingest only if the text actually moved. */
  async function checkOne(source: Due): Promise<void> {
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
      return;
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
      return;
    }

    if (hash === source.content_hash) {
      report.unchanged++;
      await query(`update sources set checked_at = now(), error = null where id = $1`, [
        source.id,
      ]);
      return;
    }

    report.changed++;

    const retired = await query<{ id: string }>(
      `update notes
          set status = 'superseded',
              superseded_reason = 'the page it came from changed',
              superseded_at = now()
        where source_id = $1 and status = 'active'
        returning id`,
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

    // The refresh itself, kept. refresh_count above says how many times this
    // page has moved; without this row, changed_at would overwrite when — and
    // "is this brain maintained" is a question about the series, not the last
    // entry in it. See 0072.
    await query(
      `insert into source_refreshes (source_id, brain_id, content_hash, notes_retired)
       values ($1, $2, $3, $4)`,
      [source.id, source.brain_id, hash, retired.length],
    );

    await query(`update brains set content_changed_at = now() where id = $1`, [
      source.brain_id,
    ]);

    await enqueueIngest(source.id, PRIORITY.background);
  }

  // Fixed-width waves rather than a worker pool: the whole point is a ceiling
  // on simultaneous fetches, and a slice of six is the smallest thing that
  // gives one. A slow page delays its own wave, not the pass.
  for (let i = 0; i < batch.length; i += REFRESH_CONCURRENCY) {
    await Promise.all(batch.slice(i, i + REFRESH_CONCURRENCY).map(checkOne));
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

/**
 * Walk open gaps to the people who can close them. 90 pending suggestions
 * sat unread in the database — collected demand nobody was told about. One
 * message per brain per week (rate_limits carries the clock), three or more
 * open gaps before it is worth a ping.
 */
export async function notifyGapOwners(limit = 20): Promise<number> {
  // Operator-owned brains are excluded: the operator reads chatmozg from the
  // other side, and four gap notices addressed to yourself is noise, not
  // outreach — /admin already carries the same signal.
  const admins = env.ADMIN_EMAILS.split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  const rows = await query<{
    brain_id: string;
    slug: string;
    title: string;
    owner_id: string;
    n: number;
  }>(
    `select b.id as brain_id, b.slug, b.title, b.owner_id, count(*)::int as n
       from gap_suggestions g
       join brains b on b.id = g.brain_id
       join "user" u on u.id = b.owner_id
      where g.status = 'pending' and lower(u.email) <> all($2::text[])
      group by b.id, b.slug, b.title, b.owner_id
     having count(*) >= 3
      order by count(*) desc
      limit $1`,
    [limit, admins],
  );

  let sent = 0;
  for (const r of rows) {
    const action = `gap_notice:${r.brain_id}`;
    const recent = await query(
      `select 1 from rate_limits
        where user_id = $1 and action = $2 and created_at > now() - interval '7 days'`,
      [r.owner_id, action],
    );
    if (recent.length) continue;

    const qs = await query<{ question: string }>(
      `select question from gap_suggestions
        where brain_id = $1 and status = 'pending'
        order by created_at desc limit 3`,
      [r.brain_id],
    );
    await query(`insert into rate_limits (user_id, action) values ($1, $2)`, [
      r.owner_id,
      action,
    ]);
    await notifyGaps(
      r.owner_id,
      { title: r.title, slug: r.slug },
      qs.map((q) => q.question),
      r.n,
    ).catch(() => {});
    sent++;
  }
  return sent;
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
  await notifyGapOwners();
  // Expired batons linger 30 days for postmortems, then go — nobody resumes
  // work from a month-old handoff, and the table stays a queue, not a log.
  await query(`delete from handoffs where expires_at < now() - interval '30 days'`);

  // The red team walks the public catalogue on a weekly clock: regex scans
  // only, so ten brains a pass costs milliseconds, and the "attacks survived"
  // date on every storefront stays younger than a week.
  const toRedteam = await query<{ id: string }>(
    `select b.id from brains b
      where b.visibility = 'public'
        and not exists (select 1 from redteam_runs r
                         where r.brain_id = b.id
                           and r.ran_at > now() - interval '7 days')
      limit 10`,
  );
  for (const b of toRedteam) {
    await redteamBrain(b.id).catch(() => {});
  }
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
