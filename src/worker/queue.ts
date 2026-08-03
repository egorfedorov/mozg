import PgBoss from "pg-boss";
import { env } from "@/lib/env";

/**
 * Job queue. Lives in Postgres via pg-boss — one less service to run, and the
 * job rows sit next to the data they act on, so a failed ingest is debuggable
 * with plain SQL.
 */

export const QUEUES = {
  ingest: "ingest",
  exam: "exam",
  maintenance: "maintenance",
} as const;

/**
 * How often brains are checked for decay. Every six hours rather than nightly:
 * the pass is cheap when nothing changed, and a page that was rewritten this
 * morning should not answer stale until tomorrow.
 */
export const MAINTENANCE_CRON = "17 */6 * * *";

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

export async function enqueueIngest(sourceId: string): Promise<void> {
  const b = await getBoss();
  await b.send(QUEUES.ingest, { sourceId }, { singletonKey: sourceId });
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

export async function enqueueExam(brainId: string): Promise<void> {
  const b = await getBoss();
  // One exam per brain in flight; a burst of uploads should not queue ten runs.
  await b.send(
    QUEUES.exam,
    { brainId },
    { singletonKey: brainId, singletonSeconds: 60 },
  );
}
