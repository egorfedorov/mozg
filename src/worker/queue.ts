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
} as const;

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

export async function enqueueExam(brainId: string): Promise<void> {
  const b = await getBoss();
  // One exam per brain in flight; a burst of uploads should not queue ten runs.
  await b.send(
    QUEUES.exam,
    { brainId },
    { singletonKey: brainId, singletonSeconds: 60 },
  );
}
