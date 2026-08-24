import { maybeOne, query } from "@/db";
import type { Brain } from "@/db/types";
import { familyIds } from "@/lib/families";
import { searchBrain } from "@/lib/search";
import { env } from "@/lib/env";
import { redteamBrain } from "@/lib/redteam";
import { notifyGaps } from "@/lib/operator-chat";
import { fetchPageText, contentHash } from "@/lib/page";
import { enqueueIngest, enqueueExam, enqueueCrawl, PRIORITY } from "@/worker/queue";
import { growSearchGapChecks } from "@/worker/search-gaps";
import { generateNegativeProbes, negativeTarget } from "@/worker/exam";
import { withOwnerKey } from "@/lib/byok";
import { holdScheduledSpend, PLATFORM_DAILY_CENTS } from "@/lib/spend";
import { reportOnce } from "@/lib/errors";

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

/** What counts as somebody still asking. One search inside it is enough. */
const ASKED_WINDOW = "30 days";

/**
 * The same promise, measured less often, where nobody is asking.
 *
 * The pass was demand-blind, and the catalogue had grown past the point where
 * that was affordable: 11,208 of the 13,357 URL sources belong to brains
 * nobody has searched in a month, and 5,581 of those were due at once. The
 * batch is 500 four times a day, so the 1,372 pages somebody *is* asking about
 * were queued behind five thousand nobody wants — a demand-blind pass does not
 * merely waste the fetches, it makes the used brains the stale ones.
 *
 * Not "never", for the same reason examStaleBrains does not stop scoring them:
 * a brain has to be able to earn its first search, and knowledge that silently
 * stopped being re-read is worse than knowledge re-read rarely. Seven times
 * the window, not the end of it.
 */
const UNASKED_RECHECK_AFTER = "21 days";

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
  // Demand, rolled up to the family. A search on a parent searches every child,
  // so a child of a busy parent is in demand even though no call ever carried
  // its own id — without the rollup this would have quietly slowed the refresh
  // of stake-engine's children, which is 4,486 searches of demand wearing five
  // handles.
  const source = `from sources s
       join brains b on b.id = s.brain_id
       left join (
         select distinct coalesce(kb.parent_id, kb.id) as root
           from calls k join brains kb on kb.id = k.brain_id
          where k.tool = 'brain_search'
            and k.created_at > now() - interval '${ASKED_WINDOW}'
       ) asked on asked.root = coalesce(b.parent_id, b.id)
      where s.kind = 'url' and s.status = 'ready' and s.url is not null
        and ($1::uuid is null or s.brain_id = $1::uuid)
        -- A named brain ignores the window entirely, demand or not: somebody
        -- asked, and "I checked the ones I felt like" is not an answer.
        and ($1::uuid is not null
             or s.checked_at is null
             or s.checked_at < now() - (case when asked.root is not null
                                             then interval '${RECHECK_AFTER}'
                                             else interval '${UNASKED_RECHECK_AFTER}' end))`;

  // The backlog, before the cap is applied. Counted separately rather than
  // inferred from a full batch: "we checked 500" and "500 was all there was"
  // are the difference between a pass that is keeping up and one that is not.
  const [{ n: due }] = await query<{ n: number }>(
    `select count(*)::int as n ${source}`,
    [brainId ?? null],
  );

  const batch = await query<{ id: string; url: string; brain_id: string; content_hash: string | null }>(
    `select s.id, s.url, s.brain_id, s.content_hash ${source}
      -- Demand first. The window above decides what is due; this decides who
      -- goes first when more is due than the batch can hold, and it is the
      -- half that stops a busy brain waiting behind an idle one.
      order by (asked.root is not null) desc, s.checked_at nulls first
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
 * How long a brain nobody has asked anything waits between sittings.
 *
 * The refresh pass re-reads 500 pages four times a day, and every page that
 * changed bumps content_changed_at — so "learned something since it was last
 * scored" is true of most of the catalogue most days, and the backstop below
 * was re-sitting the same brains daily forever. Measured 08-12..08-19: $72 of
 * $81 of exam spend went to brains that have never been searched once (139 of
 * 170). Of the 31 that have, `stake-engine` alone is most of the demand.
 *
 * A score is a promise to a buyer about what asking this brain returns, so it
 * has to stay current where somebody is asking — those keep the old behaviour
 * and re-sit as soon as their material moves. Where nobody is asking, a score
 * a week old is not a worse promise to anybody, it is the same promise
 * measured less often.
 *
 * Not "never": a brain has to be able to earn its first search, and a score
 * frozen at whatever it was the day demand stopped is a number that quietly
 * stops meaning anything.
 */
const UNASKED_INTERVAL = "7 days";

/**
 * Re-sit the exam for brains that learned something since they were last
 * scored. Ingest already enqueues an exam after each source, so this is the
 * backstop for the runs that failed, were skipped while the brain had no goal,
 * or were dropped when the worker restarted.
 *
 * Brains nobody searches are held to UNASKED_INTERVAL rather than re-sat the
 * moment a refresh touches one of their pages — see the constant for why.
 */
export async function examStaleBrains(limit = EXAM_BATCH): Promise<string[]> {
  const stale = await query<{ id: string }>(
    `select b.id from brains b
      where b.goal is not null and b.note_count > 0
        and (b.score_at is null or b.content_changed_at > b.score_at)
        and (b.score_at is null
             or b.score_at < now() - interval '${UNASKED_INTERVAL}'
             or exists (select 1 from calls
                         where brain_id = b.id and tool = 'brain_search'
                           and created_at > now() - interval '${ASKED_WINDOW}'))
      order by b.content_changed_at nulls first
      limit $1`,
    [limit],
  );

  for (const brain of stale) await enqueueExam(brain.id);
  return stale.map((b) => b.id);
}

/** Brains topped up with anti-bluff probes per pass. Each one is a model call
 *  on the bigger model, so this is a trickle, not a sweep. */
const PROBE_BATCH = 3;

/**
 * Keep every exam measuring the same dimensions.
 *
 * Negative probes — plausible questions just outside a brain's scope, which it
 * is supposed to refuse — reached the generator after most brains had written
 * their exams, and a brain graded without them averages three points higher.
 * `npm run probes` was written to repair that once, by hand, for brains with
 * *zero* probes.
 *
 * Neither of those closes the hole. An exam grows — the search-gap harvest and
 * the usage loop add checks every pass — and negativeTarget is a *share* of
 * it, so a brain that started at the target drifts back under it as its
 * positive checks multiply. Nothing was watching that, and a one-shot script
 * nobody reruns is not watching it either.
 *
 * So the top-up joins the pass that already keeps brains honest. Ordered by
 * the biggest shortfall, because that is where the score is least comparable
 * to the rest of the catalogue.
 */
export async function topUpNegativeProbes(limit = PROBE_BATCH): Promise<number> {
  // negativeTarget is TypeScript, not SQL, so the shortfall is computed here
  // rather than in the order-by: one small query, a handful of rows.
  const candidates = await query<{ id: string; neg: number; total: number }>(
    `select b.id,
            count(*) filter (where c.kind = 'negative')::int as neg,
            count(*)::int as total
       from brains b
       join checks c on c.brain_id = b.id and c.enabled
      where b.goal is not null
      group by b.id
      having count(*) > 0
      limit 500`,
  );

  const short = candidates
    .map((c) => ({ id: c.id, gap: negativeTarget(c.total) - c.neg }))
    .filter((c) => c.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, limit);

  let wrote = 0;
  for (const { id } of short) {
    const brain = await maybeOne<Brain>(`select * from brains where id = $1`, [id]);
    if (!brain) continue;
    try {
      // On the owner's key where they set one. Every other lane routes its
      // model calls through the wallet the brain belongs to; a top-up that
      // skipped it would quietly put BYOK brains back on our bill.
      const n = await withOwnerKey(brain.owner_id, () => generateNegativeProbes(brain));
      wrote += n;
      // Adding a check is not a content change, so nothing else would ever
      // queue the sitting that makes the new probes count.
      if (n) await enqueueExam(brain.id);
    } catch {
      // One brain whose probe generation failed must not stop the pass; the
      // next one retries it, and the shortfall keeps it at the front.
    }
  }
  return wrote;
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
 * Close the gaps the brain has since learned to answer.
 *
 * Every failed check and every empty search files one, and nothing ever took
 * them off the list: 1074 rows sat pending, which is not a queue of work but a
 * wall nobody reads. A gap is a question the brain could not answer *then* —
 * once the material lands, the row is stale, and the only honest way to know
 * is to ask the question again.
 *
 * Cheap on purpose: it is a retrieval, not a model call, and it runs on the
 * oldest rows first so the wall drains from the bottom.
 */
export async function closeAnsweredGaps(limit = 40): Promise<number> {
  const open = await query<{ id: string; brain_id: string; question: string }>(
    `select g.id, g.brain_id, g.question
       from gap_suggestions g
      where g.status = 'pending'
      order by g.created_at
      limit $1`,
    [limit],
  );

  let closed = 0;
  for (const gap of open) {
    const brain = await maybeOne<Brain>(`select * from brains where id = $1`, [gap.brain_id]);
    if (!brain) continue;

    const scope = await familyIds(brain);
    const { hits, reranked } = await searchBrain(scope, gap.question, { limit: 3 });
    // Without the reranker there is no absolute score, so "found something"
    // means nothing — leave the row rather than close it on a guess.
    if (!reranked || !hits.length) continue;

    await query(
      `update gap_suggestions set status = 'answered', resolved_at = now() where id = $1`,
      [gap.id],
    );
    closed++;
  }
  return closed;
}

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
 * Rate-limited sources ride the same sweep: a provider's window closing is
 * the same kind of "not now" as a budget window, and the fix is the same —
 * come back on the next pass rather than retry into the same wall.
 *
 * So does a spent prepaid key ('provider credit:%'): nothing about that page
 * is broken either, and the moment somebody tops the key up the next pass
 * picks all of them back up without anyone re-adding a source by hand.
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
           and (error like 'daily budget:%' or error like 'monthly budget:%'
                or error like 'rate limit:%'
                or error like 'provider credit:%')
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
  /** Anti-bluff probes written this pass — see topUpNegativeProbes. */
  probes: number;
  recrawled: number;
  resumed: number;
  gapChecks: number;
  /** Gaps the material answered since they were filed — see closeAnsweredGaps. */
  gapsClosed: number;
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
  // The only lane with no ceiling of its own, and the one the money is
  // actually in. Everything above is cheap or capped per owner; a periodic
  // re-sit is neither, so it is what gets held when the platform has spent
  // its day. See holdScheduledSpend for why this and not the whole pass.
  const budget = await holdScheduledSpend();
  if (budget.hold) {
    // Stable message, moving number in the detail: see reportOnce. A pass runs
    // every few hours and the spend figure changes every time, so a figure in
    // the message would push-alert the operator on a loop about one condition.
    await reportOnce(
      "worker",
      "spend-ceiling",
      "Scheduled exams held: the platform hit its 24h model-spend ceiling.",
      {
        detail:
          `$${(budget.spent / 100).toFixed(2)} spent in the last 24h against a ` +
          `$${(PLATFORM_DAILY_CENTS / 100).toFixed(2)} ceiling (PLATFORM_DAILY_CENTS). ` +
          `Owner-initiated and post-ingest exams still run; only the periodic re-sit is held. ` +
          `Raise the ceiling or wait for the window to roll.`,
      },
    );
  }
  const examined = budget.hold ? [] : await examStaleBrains();
  // Under the same hold: topping up probes is a model call and it queues a
  // sitting, so it is scheduled spend by both definitions.
  // Never fatal. Everything else in this pass is a guarantee somebody depends
  // on — pages refreshed, scores kept current — and the probe top-up is a
  // nicety on top; a bad query here must not make pg-boss retry the whole pass.
  const probes = budget.hold
    ? 0
    : await topUpNegativeProbes().catch((err) => {
        reportOnce("worker", "probe-topup", err);
        return 0;
      });
  // Real searches that came back weak become exam checks, so the next
  // sitting measures what callers actually asked and could not get. After
  // examStaleBrains deliberately: a check added now is graded by the exam
  // this pass just queued, not by one a pass away.
  const gapChecks = await growSearchGapChecks();
  // After the refresh and the exam: a gap closed by material that landed this
  // pass should leave the list in the same pass, not a day later.
  const gapsClosed = await closeAnsweredGaps();
  return {
    refresh,
    examined: examined.length,
    probes,
    recrawled,
    resumed,
    gapChecks: gapChecks.added,
    gapsClosed,
    abandoned,
  };
}
