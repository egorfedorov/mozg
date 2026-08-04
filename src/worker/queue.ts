import PgBoss from "pg-boss";
import { env } from "@/lib/env";

/**
 * Job queue. Lives in Postgres via pg-boss — one less service to run, and the
 * job rows sit next to the data they act on, so a failed ingest is debuggable
 * with plain SQL.
 */

export const QUEUES = {
  ingest: "ingest",
  crawl: "crawl",
  exam: "exam",
  maintenance: "maintenance",
  consolidate: "consolidate",
  digest: "digest",
  mozgpay: "mozgpay",
} as const;

/**
 * How often brains are checked for decay. Every six hours rather than nightly:
 * the pass is cheap when nothing changed, and a page that was rewritten this
 * morning should not answer stale until tomorrow.
 */
export const MAINTENANCE_CRON = "17 */6 * * *";

/**
 * Consolidation is daily, unlike maintenance: every merge is a paid model
 * call, and duplicates accumulate slowly enough that six-hourly passes would
 * buy the same merges four times over. 03:43 UTC keeps it clear of the
 * maintenance slots.
 */
export const CONSOLIDATE_CRON = "43 3 * * *";

let boss: PgBoss | null = null;
let starting: Promise<PgBoss> | null = null;

export async function getBoss(): Promise<PgBoss> {
  if (boss) return boss;
  starting ??= (async () => {
    const instance = new PgBoss({
      connectionString: env.DATABASE_URL,
      schema: "pgboss",
      retryLimit: 3,
      retryDelay: 30,
      retryBackoff: true,
    });
    instance.on("error", (err) => console.error("[queue]", err));
    await instance.start();
    for (const name of Object.values(QUEUES)) {
      await instance.createQueue(name);
    }
    boss = instance;
    return instance;
  })();
  return starting;
}

/**
 * Queue priorities. A person watching their brain learn is not the same as a
 * nightly refresh nobody is waiting on — when both are queued, the person
 * wins. Crawl-expanded pages sit in the middle: bulk, but someone did ask.
 */
export const PRIORITY = { interactive: 10, crawl: 0, background: -5 } as const;

export async function enqueueIngest(
  sourceId: string,
  priority: number = PRIORITY.interactive,
): Promise<void> {
  const b = await getBoss();
  await b.send(QUEUES.ingest, { sourceId }, { singletonKey: sourceId, priority });
}

export async function enqueueCrawl(sourceId: string): Promise<void> {
  const b = await getBoss();
  await b.send(QUEUES.crawl, { sourceId }, { singletonKey: sourceId });
}

/**
 * Register the recurring maintenance pass. pg-boss stores the schedule in the
 * database, so it survives restarts and only one worker fires it even if
 * several are running.
 */
export async function scheduleMaintenance(): Promise<void> {
  const b = await getBoss();
  await b.schedule(QUEUES.maintenance, MAINTENANCE_CRON, {}, { tz: "UTC" });
}

export async function enqueueMaintenance(): Promise<void> {
  const b = await getBoss();
  await b.send(QUEUES.maintenance, {}, { singletonKey: "maintenance", singletonSeconds: 300 });
}

/**
 * Register the daily consolidation pass. Same rationale as maintenance:
 * stored in the database, so restarts and multi-worker deploys fire it once.
 */
export async function scheduleConsolidation(): Promise<void> {
  const b = await getBoss();

  // Off by default — see CONSOLIDATE_ENABLED in lib/env.ts. Unschedule rather
  // than skip, so turning the flag off actually stops a schedule already
  // stored in the database from a previous boot.
  if (!env.CONSOLIDATE_ENABLED) {
    await b.unschedule(QUEUES.consolidate).catch(() => {});
    return;
  }

  await b.schedule(QUEUES.consolidate, CONSOLIDATE_CRON, {}, { tz: "UTC" });
}

export async function enqueueConsolidation(): Promise<void> {
  const b = await getBoss();
  // The pass walks every large brain; a double trigger would pay for the same
  // merges twice.
  await b.send(QUEUES.consolidate, {}, { singletonKey: "consolidation", singletonSeconds: 600 });
}

/** Monday morning, owner's timezone unknown — 09:00 UTC lands in everyone's
 *  working day somewhere near the start of the week. */
export async function scheduleDigest(): Promise<void> {
  const b = await getBoss();
  await b.schedule(QUEUES.digest, "0 9 * * 1", {}, { tz: "UTC" });
}

/** Every minute — a paying customer is watching the pending screen. */
export async function scheduleMozgpay(): Promise<void> {
  const b = await getBoss();
  await b.schedule(QUEUES.mozgpay, "* * * * *", {}, { tz: "UTC" });
}

export async function enqueueExam(brainId: string): Promise<void> {
  const b = await getBoss();
  // One exam per brain in flight; a burst of uploads should not queue ten runs.
  await b.send(
    QUEUES.exam,
    { brainId },
    { singletonKey: brainId, singletonSeconds: 60 },
  );
}
