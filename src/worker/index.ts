import { getBoss, QUEUES, scheduleMaintenance, MAINTENANCE_CRON, CONSOLIDATE_CRON, scheduleConsolidation, scheduleDigest, scheduleMozgpay, enqueueIngest, enqueueCrawl } from "@/worker/queue";
import { runDigest } from "@/worker/digest";
import { runMozgpayWatch } from "@/worker/mozgpay";
import { compileLesson } from "@/worker/lesson";
import { withOwnerKey } from "@/lib/byok";
import { maybeOne } from "@/db";

/** BYOK: run a per-brain job on its owner's key when they set one. */
async function withBrainOwner<T>(brainId: string, fn: () => Promise<T>): Promise<T> {
  const row = await maybeOne<{ owner_id: string }>(
    `select owner_id from brains where id = $1`, [brainId],
  );
  return row ? withOwnerKey(row.owner_id, fn) : fn();
}

async function withSourceOwner<T>(sourceId: string, fn: () => Promise<T>): Promise<T> {
  const row = await maybeOne<{ owner_id: string }>(
    `select b.owner_id from sources s join brains b on b.id = s.brain_id where s.id = $1`,
    [sourceId],
  );
  return row ? withOwnerKey(row.owner_id, fn) : fn();
}

import { query } from "@/db";
import { ingestSource, SourceBusyError } from "@/worker/ingest";
import { crawlSite } from "@/worker/crawl";
import { runExam } from "@/worker/exam";
import { compileSummaries } from "@/worker/summary";
import { runMaintenance } from "@/worker/maintenance";
import { runConsolidation } from "@/worker/consolidate";
import { embedHealthy } from "@/lib/embed";
import { env } from "@/lib/env";

/**
 * Background worker. Run alongside the web app:
 *
 *   npm run worker
 */

async function main() {
  if (!(await embedHealthy())) {
    console.warn(
      `[worker] embedding service not reachable at ${env.EMBED_URL} — ` +
        "ingest will fail until it is up (services/embed/run.sh)",
    );
  }

  const boss = await getBoss();

  // Anything left mid-flight by the last shutdown. A deploy restarts the
  // worker whenever it likes, and a source interrupted between "processing"
  // and "ready" was simply abandoned — it stayed processing forever, counted
  // as stuck by the health check, and nothing ever picked it up again.
  //
  // No age threshold on purpose: during a deploy overlap the old worker may
  // still hold a source this sweep requeues, and that is now safe — the
  // requeued job bounces off the advisory lock in ingestSource and pg-boss
  // retries it once the real run has finished.
  const orphans = await query<{ id: string; kind: string; name: string | null }>(
    `update sources set status = 'queued', processing_at = null
      where status = 'processing' returning id, kind, coalesce(original_name, url) as name`,
  );
  for (const o of orphans) {
    // A site source belongs to the crawl queue — requeueing it as an ingest
    // would fail it with "unknown kind" instead of resuming the discovery.
    await (o.kind === "site" ? enqueueCrawl(o.id) : enqueueIngest(o.id));
  }
  if (orphans.length) {
    console.log(
      `[worker] requeued ${orphans.length} source(s) interrupted by the last stop:`,
      orphans.map((o) => o.name ?? o.id).join(", "),
    );
  }

  await boss.work(
    QUEUES.ingest,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      const { sourceId } = job.data as { sourceId: string };
      const started = Date.now();
      try {
        const result = await withSourceOwner(sourceId, () => ingestSource(sourceId));
        console.log(
          `[ingest] ${sourceId} ${result.status} notes=${result.notes} ` +
            `${Date.now() - started}ms` +
            (result.findings?.length ? ` findings=${result.findings.length}` : ""),
        );
      } catch (err) {
        // pg-boss swallows the throw into its retry bookkeeping, so a failure
        // would otherwise leave no trace in the log at all — the worst possible
        // shape for an ops problem.
        if (err instanceof SourceBusyError) {
          console.log(`[ingest] ${sourceId} ${err.message}`);
        } else {
          console.error(
            `[ingest] ${sourceId} FAILED after ${Date.now() - started}ms:`,
            err instanceof Error ? err.message : err,
          );
        }
        throw err;
      }
    },
  );

  await boss.work(
    QUEUES.crawl,
    { batchSize: 1, pollingIntervalSeconds: 2 },
    async ([job]) => {
      const { sourceId } = job.data as { sourceId: string };
      const started = Date.now();
      try {
        const result = await crawlSite(sourceId);
        console.log(
          `[crawl] ${sourceId} queued=${result.queued} skipped=${result.skipped} ` +
            `via=${result.via} ${Date.now() - started}ms`,
        );
      } catch (err) {
        if (err instanceof SourceBusyError) {
          console.log(`[crawl] ${sourceId} ${err.message}`);
        } else {
          console.error(
            `[crawl] ${sourceId} FAILED after ${Date.now() - started}ms:`,
            err instanceof Error ? err.message : err,
          );
        }
        throw err;
      }
    },
  );

  await boss.work(
    QUEUES.exam,
    { batchSize: 1, pollingIntervalSeconds: 5 },
    async ([job]) => {
      const { brainId, mini, force } = job.data as {
        brainId: string;
        mini?: boolean;
        force?: boolean;
      };
      const started = Date.now();
      try {
        const result = await withBrainOwner(brainId, () => runExam(brainId, { mini, force }));
        console.log(
          result
            ? `[exam] ${brainId} ${result.score}% (${result.passed}/${result.total}` +
                `${result.carried ? `, ${result.carried} carried` : ""}` +
                `${result.negativeTotal ? `, anti-bluff ${result.negativePassed}/${result.negativeTotal}` : ""}) ` +
                `${result.costCents.toFixed(1)}¢ ${Date.now() - started}ms`
            : `[exam] ${brainId} skipped — brain has no goal`,
        );
      } catch (err) {
        console.error(
          `[exam] ${brainId} FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  await boss.work(
    QUEUES.maintenance,
    { batchSize: 1, pollingIntervalSeconds: 30 },
    async () => {
      const started = Date.now();
      try {
        const { refresh, examined, recrawled, resumed, gapChecks } = await runMaintenance();
        console.log(
          `[maintenance] checked=${refresh.checked} unchanged=${refresh.unchanged} ` +
            `changed=${refresh.changed} failed=${refresh.failed} reexam=${examined} ` +
            `recrawl=${recrawled} resumed=${resumed} gapchecks=${gapChecks} ${Date.now() - started}ms`,
        );
      } catch (err) {
        console.error(
          `[maintenance] FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  await scheduleMaintenance();

  await boss.work(
    QUEUES.consolidate,
    { batchSize: 1, pollingIntervalSeconds: 30 },
    async () => {
      const started = Date.now();
      try {
        const report = await runConsolidation();
        console.log(
          `[consolidate] brains=${report.brains} clusters=${report.clusters} ` +
            `merged=${report.merged} superseded=${report.superseded} ` +
            `skipped=${report.skipped} ${report.costCents.toFixed(1)}¢ ` +
            `${Date.now() - started}ms`,
        );
      } catch (err) {
        console.error(
          `[consolidate] FAILED after ${Date.now() - started}ms:`,
          err instanceof Error ? err.message : err,
        );
        throw err;
      }
    },
  );

  await scheduleConsolidation();

  await boss.work(QUEUES.digest, { batchSize: 1, pollingIntervalSeconds: 60 }, async () => {
    const sent = await runDigest();
    console.log(`[digest] sent ${sent} weekly letter(s)`);
  });
  await scheduleDigest();

  await boss.work(QUEUES.lesson, { batchSize: 1, pollingIntervalSeconds: 5 }, async ([job]) => {
    const { brainId, category } = job.data as { brainId: string; category: string };
    const outcome = await withBrainOwner(brainId, () => compileLesson(brainId, category));
    console.log(`[lesson] ${brainId} "${category}" ${outcome}`);
  });

  await boss.work(QUEUES.summary, { batchSize: 1, pollingIntervalSeconds: 10 }, async ([job]) => {
    const { brainId } = job.data as { brainId: string };
    const started = Date.now();
    try {
      const r = await withBrainOwner(brainId, () => compileSummaries(brainId));
      console.log(
        `[summary] ${brainId} compiled=${r.compiled} current=${r.current} ` +
          `pruned=${r.pruned} ${r.costCents.toFixed(1)}¢ ${Date.now() - started}ms`,
      );
    } catch (err) {
      console.error(
        `[summary] ${brainId} FAILED after ${Date.now() - started}ms:`,
        err instanceof Error ? err.message : err,
      );
      throw err;
    }
  });

  await boss.work(QUEUES.mozgpay, { batchSize: 1, pollingIntervalSeconds: 15 }, async () => {
    const r = await runMozgpayWatch();
    if (r.matched || r.expired) {
      console.log(`[mozgpay] matched=${r.matched} expired=${r.expired} seen=${r.seen}`);
    }
  });
  await scheduleMozgpay();

  console.log(
    `[worker] up — queues: ${Object.values(QUEUES).join(", ")} ` +
      `(one job at a time per queue, maintenance ${MAINTENANCE_CRON} UTC, ` +
      `consolidation ${env.CONSOLIDATE_ENABLED ? `${CONSOLIDATE_CRON} UTC` : "off"})`,
  );

  const shutdown = async (signal: string) => {
    console.log(`\n[worker] ${signal}, draining…`);
    await boss.stop({ graceful: true, timeout: 30_000 });
    process.exit(0);
  };
  process.on("SIGINT", () => void shutdown("SIGINT"));
  process.on("SIGTERM", () => void shutdown("SIGTERM"));
}

main().catch((err) => {
  console.error("[worker] fatal:", err);
  process.exit(1);
});
